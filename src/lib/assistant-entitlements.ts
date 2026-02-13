import type { SupabaseClient } from '@supabase/supabase-js';
import { logWarn } from '@/lib/observability';

export type AssistantPlan = 'free' | 'pro';
export type AssistantEntitlementStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive';
export type AssistantEntitlementProvider = 'none' | 'app_store' | 'play_store' | 'stripe' | 'admin';
export type AssistantBlockReason = 'hard_block' | 'monthly_limit_reached' | null;

export type AssistantEntitlementSnapshot = {
    plan: AssistantPlan;
    status: AssistantEntitlementStatus;
    provider: AssistantEntitlementProvider;
    limitRequests: number;
    usedRequests: number;
    remainingRequests: number;
    periodStartIso: string;
    periodEndIso: string;
    blockedReason: AssistantBlockReason;
};

type RecordUsageParams = {
    supabase: SupabaseClient;
    userId: string;
    requestId: string;
    plan: AssistantPlan;
    status: 'completed' | 'blocked' | 'failed';
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    blockedReason?: string;
    metadata?: Record<string, unknown>;
};

function parseInteger(raw: string | undefined, fallback: number) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
}

function freeMonthlyRequestLimit() {
    return parseInteger(process.env.ASSISTANT_FREE_MONTHLY_REQUEST_LIMIT, 40);
}

function proMonthlyRequestLimit() {
    return parseInteger(process.env.ASSISTANT_PRO_MONTHLY_REQUEST_LIMIT, 1200);
}

function utcMonthWindow(referenceDate = new Date()) {
    const start = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
    const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1));
    return {
        startIso: start.toISOString(),
        endIso: end.toISOString(),
    };
}

function looksLikeMissingTable(message: string | undefined, tableName: string) {
    if (!message) return false;
    const normalized = message.toLowerCase();
    return normalized.includes(tableName) && (normalized.includes('does not exist') || normalized.includes('schema cache'));
}

function normalizeEntitlementStatus(value: unknown): AssistantEntitlementStatus {
    if (value === 'active' || value === 'trialing' || value === 'past_due' || value === 'canceled' || value === 'inactive') {
        return value;
    }
    return 'active';
}

function normalizeEntitlementProvider(value: unknown): AssistantEntitlementProvider {
    if (value === 'none' || value === 'app_store' || value === 'play_store' || value === 'stripe' || value === 'admin') {
        return value;
    }
    return 'none';
}

export function estimateTokenCount(text: string) {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}

export async function resolveAssistantEntitlement(params: {
    supabase: SupabaseClient;
    userId: string;
    requestContext?: Record<string, unknown>;
}) {
    const { supabase, userId, requestContext = {} } = params;

    const monthWindow = utcMonthWindow();
    let plan: AssistantPlan = 'free';
    let status: AssistantEntitlementStatus = 'active';
    let provider: AssistantEntitlementProvider = 'none';
    let limitRequests = freeMonthlyRequestLimit();
    let hardBlock = false;

    const entitlementResult = await supabase
        .from('user_entitlements')
        .select('plan, status, provider, current_period_end, assistant_monthly_request_limit, assistant_hard_block')
        .eq('user_id', userId)
        .maybeSingle();

    if (entitlementResult.error && !looksLikeMissingTable(entitlementResult.error.message, 'user_entitlements')) {
        logWarn('assistant_entitlement_query_warning', {
            ...requestContext,
            userId,
            reason: entitlementResult.error.message,
        });
    }

    const entitlement = entitlementResult.data as {
        plan?: string;
        status?: string;
        provider?: string;
        current_period_end?: string | null;
        assistant_monthly_request_limit?: number | null;
        assistant_hard_block?: boolean | null;
    } | null;

    if (entitlement) {
        status = normalizeEntitlementStatus(entitlement.status);
        provider = normalizeEntitlementProvider(entitlement.provider);
        const candidatePlan = entitlement.plan === 'pro' ? 'pro' : 'free';
        const periodEnded = entitlement.current_period_end
            ? new Date(entitlement.current_period_end).getTime() < Date.now()
            : false;
        const isProEntitled = candidatePlan === 'pro' && (status === 'active' || status === 'trialing') && !periodEnded;

        plan = isProEntitled ? 'pro' : 'free';
        if (typeof entitlement.assistant_monthly_request_limit === 'number' && Number.isFinite(entitlement.assistant_monthly_request_limit)) {
            limitRequests = Math.max(0, Math.floor(entitlement.assistant_monthly_request_limit));
        } else {
            limitRequests = plan === 'pro' ? proMonthlyRequestLimit() : freeMonthlyRequestLimit();
        }
        hardBlock = Boolean(entitlement.assistant_hard_block);
    } else {
        limitRequests = freeMonthlyRequestLimit();
    }

    const usageResult = await supabase
        .from('assistant_usage_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('created_at', monthWindow.startIso)
        .lt('created_at', monthWindow.endIso);

    let usedRequests = 0;
    if (usageResult.error && !looksLikeMissingTable(usageResult.error.message, 'assistant_usage_events')) {
        logWarn('assistant_usage_count_warning', {
            ...requestContext,
            userId,
            reason: usageResult.error.message,
        });
    } else {
        usedRequests = usageResult.count || 0;
    }

    const remainingRequests = Math.max(0, limitRequests - usedRequests);
    const blockedReason: AssistantBlockReason = hardBlock
        ? 'hard_block'
        : remainingRequests <= 0
            ? 'monthly_limit_reached'
            : null;

    return {
        plan,
        status,
        provider,
        limitRequests,
        usedRequests,
        remainingRequests,
        periodStartIso: monthWindow.startIso,
        periodEndIso: monthWindow.endIso,
        blockedReason,
    } satisfies AssistantEntitlementSnapshot;
}

export async function recordAssistantUsageEvent(params: RecordUsageParams) {
    const {
        supabase,
        userId,
        requestId,
        plan,
        status,
        model = null,
        promptTokens = 0,
        completionTokens = 0,
        totalTokens = Math.max(0, promptTokens + completionTokens),
        blockedReason = null,
        metadata = {},
    } = params;

    const { error } = await supabase
        .from('assistant_usage_events')
        .insert({
            user_id: userId,
            request_id: requestId,
            plan,
            status,
            model,
            prompt_tokens: Math.max(0, Math.floor(promptTokens)),
            completion_tokens: Math.max(0, Math.floor(completionTokens)),
            total_tokens: Math.max(0, Math.floor(totalTokens)),
            blocked_reason: blockedReason,
            metadata,
        });

    if (error && !looksLikeMissingTable(error.message, 'assistant_usage_events')) {
        logWarn('assistant_usage_event_insert_warning', {
            userId,
            requestId,
            reason: error.message,
        });
    }
}
