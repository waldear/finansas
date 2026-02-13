import Stripe from 'stripe';
import { sanitizeEnv } from '@/lib/utils';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedStripeClient: Stripe | null | undefined;

type ResolveCustomerParams = {
    stripe: Stripe;
    userId: string;
    email?: string | null;
    fullName?: string | null;
    createIfMissing?: boolean;
};

export function normalizeUuid(candidate: string | null | undefined) {
    if (!candidate) return null;
    const normalized = candidate.trim();
    if (!UUID_PATTERN.test(normalized)) return null;
    return normalized;
}

export function extractSupabaseUserIdFromMetadata(metadata: Stripe.Metadata | null | undefined) {
    if (!metadata) return null;
    return normalizeUuid(metadata.supabase_user_id || metadata.user_id);
}

export function getStripeSecretKey() {
    return sanitizeEnv(process.env.STRIPE_SECRET_KEY);
}

export function getStripeProPriceId() {
    return sanitizeEnv(process.env.STRIPE_PRO_PRICE_ID);
}

export function getStripeWebhookSecret() {
    return sanitizeEnv(process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripeClient() {
    if (cachedStripeClient !== undefined) {
        return cachedStripeClient;
    }

    const key = getStripeSecretKey();
    if (!key) {
        cachedStripeClient = null;
        return null;
    }

    cachedStripeClient = new Stripe(key);
    return cachedStripeClient;
}

export function resolveAppBaseUrl(fallbackOrigin?: string) {
    const configured = sanitizeEnv(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, '');
    if (configured) return configured;
    if (fallbackOrigin) return fallbackOrigin.replace(/\/$/, '');
    return '';
}

export async function resolveOrCreateStripeCustomer(params: ResolveCustomerParams) {
    const {
        stripe,
        userId,
        email,
        fullName,
        createIfMissing = true,
    } = params;

    const normalizedEmail = email?.trim().toLowerCase();
    if (normalizedEmail) {
        const existing = await stripe.customers.list({
            email: normalizedEmail,
            limit: 10,
        });

        if (existing.data.length > 0) {
            const preferred = existing.data.find((customer) => extractSupabaseUserIdFromMetadata(customer.metadata) === userId)
                || existing.data[0];

            if (extractSupabaseUserIdFromMetadata(preferred.metadata) !== userId) {
                await stripe.customers.update(preferred.id, {
                    metadata: {
                        ...(preferred.metadata || {}),
                        supabase_user_id: userId,
                    },
                });
            }

            return preferred.id;
        }
    }

    if (!createIfMissing) {
        return null;
    }

    const created = await stripe.customers.create({
        email: normalizedEmail || undefined,
        name: fullName?.trim() || undefined,
        metadata: {
            supabase_user_id: userId,
        },
    });

    return created.id;
}

export async function resolveStripeCustomerUserId(stripe: Stripe, customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined) {
    if (!customer) return null;

    if (typeof customer !== 'string') {
        if (customer.deleted) return null;
        return extractSupabaseUserIdFromMetadata(customer.metadata);
    }

    const retrieved = await stripe.customers.retrieve(customer);
    if ('deleted' in retrieved && retrieved.deleted) {
        return null;
    }

    return extractSupabaseUserIdFromMetadata(retrieved.metadata);
}
