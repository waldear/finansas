import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase-service';
import { logInfo, logWarn } from '@/lib/observability';

const EntitlementStatusSchema = z.enum(['active', 'trialing', 'past_due', 'canceled', 'inactive']);
const PlanSchema = z.enum(['free', 'pro']);

export const BillingEntitlementSchema = z.object({
    plan: PlanSchema,
    status: EntitlementStatusSchema.default('active'),
    current_period_start: z.string().datetime().optional().nullable(),
    current_period_end: z.string().datetime().optional().nullable(),
    assistant_monthly_request_limit: z.number().int().nonnegative().optional().nullable(),
    assistant_hard_block: z.boolean().optional().nullable(),
});

export const BillingEventSchema = z.object({
    provider: z.enum(['app_store', 'play_store', 'stripe', 'admin']),
    external_event_id: z.string().min(3).max(200),
    event_type: z.string().min(2).max(120),
    user_id: z.string().uuid(),
    entitlement: BillingEntitlementSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
});

export type BillingEntitlement = z.infer<typeof BillingEntitlementSchema>;
export type BillingEvent = z.infer<typeof BillingEventSchema>;

type PersistBillingEventParams = {
    event: BillingEvent;
    requestContext?: Record<string, unknown>;
};

type PersistBillingEventResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

function parseLimit(rawValue: string | undefined, fallback: number) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
}

function defaultLimitForPlan(plan: BillingEntitlement['plan']) {
    if (plan === 'pro') {
        return parseLimit(process.env.ASSISTANT_PRO_MONTHLY_REQUEST_LIMIT, 1200);
    }
    return parseLimit(process.env.ASSISTANT_FREE_MONTHLY_REQUEST_LIMIT, 40);
}

function resolvedLimit(entitlement: BillingEntitlement) {
    if (typeof entitlement.assistant_monthly_request_limit === 'number' && Number.isFinite(entitlement.assistant_monthly_request_limit)) {
        return Math.max(0, Math.floor(entitlement.assistant_monthly_request_limit));
    }
    return defaultLimitForPlan(entitlement.plan);
}

export async function persistBillingEvent(params: PersistBillingEventParams): Promise<PersistBillingEventResult> {
    const { event, requestContext = {} } = params;
    const serviceClient = createServiceClient();
    if (!serviceClient) {
        return { ok: false, status: 500, error: 'Supabase service role no configurado' };
    }

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
            ...requestContext,
            userId: event.user_id,
            provider: event.provider,
            externalEventId: event.external_event_id,
            reason: eventInsertError.message,
        });
        return { ok: false, status: 500, error: eventInsertError.message };
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
            assistant_monthly_request_limit: resolvedLimit(event.entitlement),
            assistant_hard_block: event.entitlement.assistant_hard_block ?? false,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: 'user_id',
        });

    if (entitlementError) {
        logWarn('billing_entitlement_upsert_warning', {
            ...requestContext,
            userId: event.user_id,
            provider: event.provider,
            reason: entitlementError.message,
        });
        return { ok: false, status: 500, error: entitlementError.message };
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
            ...requestContext,
            userId: event.user_id,
            provider: event.provider,
            externalEventId: event.external_event_id,
            reason: eventMarkError.message,
        });
    }

    logInfo('billing_event_processed', {
        ...requestContext,
        userId: event.user_id,
        provider: event.provider,
        externalEventId: event.external_event_id,
        plan: event.entitlement.plan,
        status: event.entitlement.status,
    });

    return { ok: true };
}
