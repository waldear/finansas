import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import {
    getStripeClient,
    resolveAppBaseUrl,
    resolveOrCreateStripeCustomer,
} from '@/lib/stripe';

function userDisplayName(user: any) {
    const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.user_metadata?.display_name;
    if (typeof fullName === 'string' && fullName.trim()) {
        return fullName.trim();
    }
    return null;
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/billing/portal', 'POST');
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
        if (!stripe) {
            return NextResponse.json({ error: 'Stripe no está configurado en el servidor' }, { status: 503 });
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
            createIfMissing: false,
        });

        if (!customerId) {
            return NextResponse.json({ error: 'No existe suscripción de Stripe para gestionar.' }, { status: 404 });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${baseUrl}/dashboard/assistant?billing=portal`,
        });

        logInfo('billing_portal_session_created', {
            ...context,
            userId: user.id,
            customerId,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ url: session.url });
    } catch (error) {
        logError('billing_portal_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo abrir el portal de suscripción' }, { status: 500 });
    }
}
