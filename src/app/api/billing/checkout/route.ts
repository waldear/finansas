import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { resolveAssistantEntitlement } from '@/lib/assistant-entitlements';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import {
    getStripeClient,
    getStripeProPriceId,
    resolveAppBaseUrl,
    resolveOrCreateStripeCustomer,
} from '@/lib/stripe';

function parseTrialDays(rawValue: string | undefined) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return null;
    const normalized = Math.floor(parsed);
    if (normalized <= 0) return null;
    return Math.min(normalized, 365);
}

function userDisplayName(user: any) {
    const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.display_name;
    if (typeof fullName === 'string' && fullName.trim()) {
        return fullName.trim();
    }
    return null;
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/billing/checkout', 'POST');
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

        const stripe = getStripeClient();
        const proPriceId = getStripeProPriceId();
        if (!stripe || !proPriceId) {
            return NextResponse.json({ error: 'Stripe no está configurado en el servidor' }, { status: 503 });
        }

        const entitlement = await resolveAssistantEntitlement({
            supabase,
            userId: user.id,
            requestContext: context,
        });

        if (entitlement.plan === 'pro' && (entitlement.status === 'active' || entitlement.status === 'trialing')) {
            return NextResponse.json({ error: 'Tu suscripción Pro ya está activa.' }, { status: 409 });
        }

        const requestOrigin = new URL(req.url).origin;
        const baseUrl = resolveAppBaseUrl(requestOrigin);
        if (!baseUrl) {
            return NextResponse.json({ error: 'No se pudo determinar NEXT_PUBLIC_SITE_URL' }, { status: 500 });
        }

        const customerId = await resolveOrCreateStripeCustomer({
            stripe,
            userId: user.id,
            email: user.email || null,
            fullName: userDisplayName(user),
            createIfMissing: true,
        });
        if (!customerId) {
            return NextResponse.json({ error: 'No se pudo resolver el customer de Stripe' }, { status: 500 });
        }

        const trialDays = parseTrialDays(process.env.STRIPE_PRO_TRIAL_DAYS);
        const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
            metadata: {
                supabase_user_id: user.id,
            },
        };

        if (trialDays) {
            subscriptionData.trial_period_days = trialDays;
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: customerId,
            line_items: [{ price: proPriceId, quantity: 1 }],
            allow_promotion_codes: true,
            success_url: `${baseUrl}/dashboard/assistant?billing=success`,
            cancel_url: `${baseUrl}/dashboard/assistant?billing=cancelled`,
            client_reference_id: user.id,
            metadata: {
                supabase_user_id: user.id,
            },
            subscription_data: subscriptionData,
        });

        if (!session.url) {
            return NextResponse.json({ error: 'Stripe no devolvió URL de checkout' }, { status: 500 });
        }

        logInfo('billing_checkout_session_created', {
            ...context,
            userId: user.id,
            customerId,
            sessionId: session.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            url: session.url,
            sessionId: session.id,
        });
    } catch (error) {
        logError('billing_checkout_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo iniciar el checkout de Stripe' }, { status: 500 });
    }
}
