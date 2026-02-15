import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

const BodySchema = z.object({
    code: z.string().min(4).max(128),
});

export async function POST(req: Request) {
    const context = createRequestContext('/api/spaces/join', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const validated = BodySchema.parse(body);
        const code = validated.code.trim();

        const { data: spaceId, error: rpcError } = await supabase.rpc('accept_space_invite', {
            p_code: code,
        });

        if (rpcError || !spaceId) {
            return NextResponse.json(
                { error: rpcError?.message || 'Código inválido o vencido.' },
                { status: 400 }
            );
        }

        await supabase.auth.updateUser({ data: { active_space_id: spaceId } });

        logInfo('space_joined', {
            ...context,
            userId: session.user.id,
            spaceId,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, activeSpaceId: spaceId });
    } catch (error: any) {
        logError('space_join_exception', error, { ...context, durationMs: Date.now() - startedAt });
        return NextResponse.json({ error: error?.errors || error?.message || 'No se pudo unir al espacio.' }, { status: 400 });
    }
}

