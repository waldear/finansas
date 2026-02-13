import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeEnv } from '@/lib/utils';
import { createServiceClient } from '@/lib/supabase-service';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';

const BillingEventSchema = z.object({
    provider: z.enum(['app_store', 'play_store', 'stripe', 'admin']),
    external_event_id: z.string().min(3).max(200),
    event_type: z.string().min(2).max(120),
    user_id: z.string().uuid(),
    entitlement: z.object({
        plan: z.enum(['free', 'pro']),
        status: z.enum(['active', 'trialing', 'past_due', 'canceled', 'inactive']).default('active'),
        current_period_start: z.string().datetime().optional().nullable(),
        current_period_end: z.string().datetime().optional().nullable(),
        assistant_monthly_request_limit: z.number().int().nonnegative().optional().nullable(),
        assistant_hard_block: z.boolean().optional().nullable(),
    }),
    payload: z.record(z.string(), z.unknown()).default({}),
});

function ensureAuthorized(headers: Headers) {
    const configuredSecret = sanitizeEnv(process.env.BILLING_WEBHOOK_SECRET);
    if (!configuredSecret) {
        return { ok: false as const, status: 503, error: 'Falta BILLING_WEBHOOK_SECRET en el entorno.' };
    }

    const receivedSecret = headers.get('x-billing-webhook-secret');
    if (!receivedSecret || receivedSecret !== configuredSecret) {
        return { ok: false as const, status: 401, error: 'Webhook secret inválido.' };
    }

    return { ok: true as const };
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/billing/events', 'POST');
    const startedAt = Date.now();

    try {
        const auth = ensureAuthorized(req.headers);
        if (!auth.ok) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const body = await req.json().catch(() => null);
        const parsed = BillingEventSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({ error: 'Payload inválido', details: parsed.error.flatten() }, { status: 400 });
        }

        const serviceClient = createServiceClient();
        if (!serviceClient) {
            return NextResponse.json({ error: 'Supabase service role no configurado' }, { status: 500 });
        }

        const event = parsed.data;
        const { error: eventInsertError } = await serviceClient
            .from('billing_events')
            .upsert({
                user_id: event.user_id,
                provider: event.provider,
                external_event_id: event.external_event_id,
                event_type: event.event_type,
                payload: event.payload,
                processed: false,
            }, {
                onConflict: 'provider,external_event_id',
            });

        if (eventInsertError) {
            logWarn('billing_event_upsert_warning', {
                ...context,
                userId: event.user_id,
                provider: event.provider,
                externalEventId: event.external_event_id,
                reason: eventInsertError.message,
            });
            return NextResponse.json({ error: eventInsertError.message }, { status: 500 });
        }

        const { error: entitlementError } = await serviceClient
            .from('user_entitlements')
            .upsert({
                user_id: event.user_id,
                plan: event.entitlement.plan,
                status: event.entitlement.status,
                provider: event.provider,
                current_period_start: event.entitlement.current_period_start || null,
                current_period_end: event.entitlement.current_period_end || null,
                assistant_monthly_request_limit: event.entitlement.assistant_monthly_request_limit ?? (event.entitlement.plan === 'pro' ? 1200 : 40),
                assistant_hard_block: event.entitlement.assistant_hard_block ?? false,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id',
            });

        if (entitlementError) {
            logWarn('billing_entitlement_upsert_warning', {
                ...context,
                userId: event.user_id,
                provider: event.provider,
                reason: entitlementError.message,
            });
            return NextResponse.json({ error: entitlementError.message }, { status: 500 });
        }

        const { error: eventMarkError } = await serviceClient
            .from('billing_events')
            .update({
                processed: true,
            })
            .eq('provider', event.provider)
            .eq('external_event_id', event.external_event_id);

        if (eventMarkError) {
            logWarn('billing_event_mark_processed_warning', {
                ...context,
                userId: event.user_id,
                provider: event.provider,
                externalEventId: event.external_event_id,
                reason: eventMarkError.message,
            });
        }

        logInfo('billing_event_processed', {
            ...context,
            userId: event.user_id,
            provider: event.provider,
            externalEventId: event.external_event_id,
            plan: event.entitlement.plan,
            status: event.entitlement.status,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            ok: true,
            userId: event.user_id,
            provider: event.provider,
            plan: event.entitlement.plan,
            status: event.entitlement.status,
        });
    } catch (error) {
        logError('billing_events_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo procesar el evento de billing' }, { status: 500 });
    }
}
