import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

const BodySchema = z.object({
    spaceId: z.string().uuid(),
});

export async function POST(req: Request) {
    const context = createRequestContext('/api/spaces/active', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const validated = BodySchema.parse(body);

        const { data: membership, error: membershipError } = await supabase
            .from('space_members')
            .select('space_id')
            .eq('space_id', validated.spaceId)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (membershipError) {
            return NextResponse.json({ error: membershipError.message }, { status: 500 });
        }
        if (!membership) {
            return NextResponse.json({ error: 'No tienes acceso a este espacio.' }, { status: 403 });
        }

        const { error } = await supabase.auth.updateUser({
            data: {
                active_space_id: validated.spaceId,
            },
        });

        if (error) {
            return NextResponse.json({ error: error.message || 'No se pudo cambiar el espacio.' }, { status: 500 });
        }

        logInfo('active_space_updated', {
            ...context,
            userId: session.user.id,
            spaceId: validated.spaceId,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, activeSpaceId: validated.spaceId });
    } catch (error: any) {
        logError('active_space_update_exception', error, { ...context, durationMs: Date.now() - startedAt });
        return NextResponse.json({ error: error?.errors || error?.message || 'No se pudo cambiar el espacio.' }, { status: 400 });
    }
}

