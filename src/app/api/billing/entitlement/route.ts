import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { resolveAssistantEntitlement } from '@/lib/assistant-entitlements';

export async function GET() {
    const context = createRequestContext('/api/billing/entitlement', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const entitlement = await resolveAssistantEntitlement({
            supabase,
            userId: user.id,
            requestContext: context,
        });

        logInfo('billing_entitlement_loaded', {
            ...context,
            userId: user.id,
            plan: entitlement.plan,
            usedRequests: entitlement.usedRequests,
            limitRequests: entitlement.limitRequests,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            plan: entitlement.plan,
            status: entitlement.status,
            provider: entitlement.provider,
            blockedReason: entitlement.blockedReason,
            usage: {
                usedRequests: entitlement.usedRequests,
                limitRequests: entitlement.limitRequests,
                remainingRequests: entitlement.remainingRequests,
                periodStart: entitlement.periodStartIso,
                periodEnd: entitlement.periodEndIso,
            },
        });
    } catch (error) {
        logError('billing_entitlement_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo obtener el estado de suscripción' }, { status: 500 });
    }
}
