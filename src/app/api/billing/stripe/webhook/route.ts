import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { persistBillingEvent, type BillingEvent } from '@/lib/billing-events';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';
import {
    extractSupabaseUserIdFromMetadata,
    getStripeClient,
    getStripeProPriceId,
    getStripeWebhookSecret,
    normalizeUuid,
    resolveStripeCustomerUserId,
} from '@/lib/stripe';

export const runtime = 'nodejs';

type BillingStatus = BillingEvent['entitlement']['status'];

function parseLimit(rawValue: string | undefined, fallback: number) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.floor(parsed));
}

function freeLimit() {
    return parseLimit(process.env.ASSISTANT_FREE_MONTHLY_REQUEST_LIMIT, 40);
}

function proLimit() {
    return parseLimit(process.env.ASSISTANT_PRO_MONTHLY_REQUEST_LIMIT, 1200);
}

function unixToIso(value: number | null | undefined) {
    if (!value || value <= 0) return null;
    return new Date(value * 1000).toISOString();
}

function resolvePeriodStartIso(subscription: Stripe.Subscription) {
    const starts = subscription.items.data
        .map((item) => item.current_period_start)
        .filter((value): value is number => Number.isFinite(value));
    if (starts.length === 0) return null;
    return unixToIso(Math.min(...starts));
}

function resolvePeriodEndIso(subscription: Stripe.Subscription) {
    const ends = subscription.items.data
        .map((item) => item.current_period_end)
        .filter((value): value is number => Number.isFinite(value));
    if (ends.length === 0) return null;
    return unixToIso(Math.max(...ends));
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): BillingStatus {
    if (status === 'active') return 'active';
    if (status === 'trialing') return 'trialing';
    if (status === 'past_due' || status === 'unpaid') return 'past_due';
    if (status === 'canceled') return 'canceled';
    return 'inactive';
}

function resolvePlanFromSubscription(subscription: Stripe.Subscription, proPriceId: string) {
    const priceIds = subscription.items.data
        .map((item) => item.price?.id)
        .filter((id): id is string => Boolean(id));

    const isPro = proPriceId
        ? priceIds.includes(proPriceId)
        : priceIds.length > 0;

    return {
        plan: (isPro ? 'pro' : 'free') as BillingEvent['entitlement']['plan'],
        priceIds,
    };
}

async function resolveUserIdForSubscription(params: {
    stripe: Stripe;
    subscription: Stripe.Subscription;
    fallbackUserId?: string | null;
}) {
    const { stripe, subscription, fallbackUserId } = params;
    const fallback = normalizeUuid(fallbackUserId || null);
    if (fallback) return fallback;

    const fromMetadata = extractSupabaseUserIdFromMetadata(subscription.metadata);
    if (fromMetadata) return fromMetadata;

    return resolveStripeCustomerUserId(stripe, subscription.customer);
}

async function buildBillingEventFromSubscription(params: {
    stripe: Stripe;
    stripeEvent: Stripe.Event;
    subscription: Stripe.Subscription;
    fallbackUserId?: string | null;
    statusOverride?: BillingStatus;
    extraPayload?: Record<string, unknown>;
}) {
    const {
        stripe,
        stripeEvent,
        subscription,
        fallbackUserId,
        statusOverride,
        extraPayload = {},
    } = params;

    const userId = await resolveUserIdForSubscription({
        stripe,
        subscription,
        fallbackUserId,
    });

    if (!userId) return null;

    const proPriceId = getStripeProPriceId();
    const { plan, priceIds } = resolvePlanFromSubscription(subscription, proPriceId);
    const entitlementStatus = statusOverride || mapStripeSubscriptionStatus(subscription.status);

    const customerId = typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id || null;

    return {
        provider: 'stripe',
        external_event_id: stripeEvent.id,
        event_type: stripeEvent.type,
        user_id: userId,
        entitlement: {
            plan,
            status: entitlementStatus,
            current_period_start: resolvePeriodStartIso(subscription),
            current_period_end: resolvePeriodEndIso(subscription),
            assistant_monthly_request_limit: plan === 'pro' ? proLimit() : freeLimit(),
            assistant_hard_block: false,
        },
        payload: {
            stripe_event_type: stripeEvent.type,
            stripe_event_created: stripeEvent.created,
            livemode: stripeEvent.livemode,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscription.id,
            stripe_subscription_status: subscription.status,
            stripe_price_ids: priceIds,
            ...extraPayload,
        },
    } satisfies BillingEvent;
}

async function persistStripeBillingEvent(params: {
    billingEvent: BillingEvent;
    requestContext: Record<string, unknown>;
}) {
    const result = await persistBillingEvent({
        event: params.billingEvent,
        requestContext: params.requestContext,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return null;
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/billing/stripe/webhook', 'POST');
    const startedAt = Date.now();

    try {
        const stripe = getStripeClient();
        const webhookSecret = getStripeWebhookSecret();
        if (!stripe || !webhookSecret) {
            return NextResponse.json({ error: 'Stripe webhook no está configurado' }, { status: 503 });
        }

        const signature = req.headers.get('stripe-signature');
        if (!signature) {
            return NextResponse.json({ error: 'Falta stripe-signature' }, { status: 400 });
        }

        const rawBody = await req.text();
        let event: Stripe.Event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        } catch (error) {
            logWarn('stripe_webhook_signature_invalid', {
                ...context,
                durationMs: Date.now() - startedAt,
                reason: error instanceof Error ? error.message : String(error),
            });
            return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
        }

        let handled = false;
        let persisted = false;

        if (event.type === 'checkout.session.completed') {
            handled = true;
            const session = event.data.object as Stripe.Checkout.Session;
            if (session.mode === 'subscription' && session.subscription) {
                const subscriptionId = typeof session.subscription === 'string'
                    ? session.subscription
                    : session.subscription.id;

                const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                    expand: ['items.data.price', 'customer'],
                });

                const fallbackUserId = normalizeUuid(
                    session.client_reference_id
                    || session.metadata?.supabase_user_id
                    || session.metadata?.user_id
                    || null
                );

                const billingEvent = await buildBillingEventFromSubscription({
                    stripe,
                    stripeEvent: event,
                    subscription,
                    fallbackUserId,
                    extraPayload: {
                        stripe_checkout_session_id: session.id,
                    },
                });

                if (!billingEvent) {
                    logWarn('stripe_webhook_missing_user_id', {
                        ...context,
                        eventType: event.type,
                        eventId: event.id,
                        durationMs: Date.now() - startedAt,
                    });
                    return NextResponse.json({ received: true, handled: true, ignored: 'missing_user_id' });
                }

                const persistenceResponse = await persistStripeBillingEvent({
                    billingEvent,
                    requestContext: {
                        ...context,
                        durationMs: Date.now() - startedAt,
                    },
                });
                if (persistenceResponse) return persistenceResponse;
                persisted = true;
            }
        } else if (
            event.type === 'customer.subscription.created'
            || event.type === 'customer.subscription.updated'
            || event.type === 'customer.subscription.deleted'
        ) {
            handled = true;
            const subscription = event.data.object as Stripe.Subscription;
            const billingEvent = await buildBillingEventFromSubscription({
                stripe,
                stripeEvent: event,
                subscription,
            });

            if (!billingEvent) {
                logWarn('stripe_webhook_missing_user_id', {
                    ...context,
                    eventType: event.type,
                    eventId: event.id,
                    subscriptionId: subscription.id,
                    durationMs: Date.now() - startedAt,
                });
                return NextResponse.json({ received: true, handled: true, ignored: 'missing_user_id' });
            }

            const persistenceResponse = await persistStripeBillingEvent({
                billingEvent,
                requestContext: {
                    ...context,
                    durationMs: Date.now() - startedAt,
                },
            });
            if (persistenceResponse) return persistenceResponse;
            persisted = true;
        } else if (event.type === 'invoice.payment_failed') {
            handled = true;
            const invoice = event.data.object as Stripe.Invoice;
            const subscriptionReference = invoice.parent?.subscription_details?.subscription;
            const subscriptionId = typeof subscriptionReference === 'string'
                ? subscriptionReference
                : subscriptionReference?.id || null;

            if (subscriptionId) {
                const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
                    expand: ['items.data.price', 'customer'],
                });

                const invoiceUserId = normalizeUuid(
                    invoice.parent?.subscription_details?.metadata?.supabase_user_id
                    || invoice.parent?.subscription_details?.metadata?.user_id
                    || invoice.metadata?.supabase_user_id
                    || invoice.metadata?.user_id
                    || null
                );

                const billingEvent = await buildBillingEventFromSubscription({
                    stripe,
                    stripeEvent: event,
                    subscription,
                    fallbackUserId: invoiceUserId,
                    statusOverride: 'past_due',
                    extraPayload: {
                        stripe_invoice_id: invoice.id,
                    },
                });

                if (!billingEvent) {
                    logWarn('stripe_webhook_missing_user_id', {
                        ...context,
                        eventType: event.type,
                        eventId: event.id,
                        subscriptionId,
                        durationMs: Date.now() - startedAt,
                    });
                    return NextResponse.json({ received: true, handled: true, ignored: 'missing_user_id' });
                }

                const persistenceResponse = await persistStripeBillingEvent({
                    billingEvent,
                    requestContext: {
                        ...context,
                        durationMs: Date.now() - startedAt,
                    },
                });
                if (persistenceResponse) return persistenceResponse;
                persisted = true;
            } else {
                logWarn('stripe_webhook_missing_subscription', {
                    ...context,
                    eventType: event.type,
                    eventId: event.id,
                    durationMs: Date.now() - startedAt,
                });
            }
        }

        logInfo('stripe_webhook_processed', {
            ...context,
            eventType: event.type,
            eventId: event.id,
            handled,
            persisted,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ received: true, handled, persisted });
    } catch (error) {
        logError('stripe_webhook_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo procesar el webhook de Stripe' }, { status: 500 });
    }
}
