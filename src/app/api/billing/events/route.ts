import { NextResponse } from 'next/server';
import { sanitizeEnv } from '@/lib/utils';
import { BillingEventSchema, persistBillingEvent } from '@/lib/billing-events';
import { createRequestContext, logError } from '@/lib/observability';

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

        const persisted = await persistBillingEvent({
            event: parsed.data,
            requestContext: {
                ...context,
                durationMs: Date.now() - startedAt,
            },
        });

        if (!persisted.ok) {
            return NextResponse.json({ error: persisted.error }, { status: persisted.status });
        }

        return NextResponse.json({
            ok: true,
            userId: parsed.data.user_id,
            provider: parsed.data.provider,
            plan: parsed.data.entitlement.plan,
            status: parsed.data.entitlement.status,
        });
    } catch (error) {
        logError('billing_events_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo procesar el evento de billing' }, { status: 500 });
    }
}
