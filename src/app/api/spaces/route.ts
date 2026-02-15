import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { ensureActiveSpace, listUserSpaces } from '@/lib/spaces';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

const CreateSpaceSchema = z.object({
    name: z.string().min(1).max(48),
    type: z.enum(['family']).default('family'),
});

export async function GET() {
    const context = createRequestContext('/api/spaces', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId, spaces } = await ensureActiveSpace(supabase as any, session.user);

        logInfo('spaces_loaded', {
            ...context,
            userId: session.user.id,
            count: spaces.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ activeSpaceId, spaces });
    } catch (error) {
        logError('spaces_get_exception', error, { ...context, durationMs: Date.now() - startedAt });
        return NextResponse.json({ error: 'No se pudieron cargar los espacios.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/spaces', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const validated = CreateSpaceSchema.parse(body);
        const name = validated.name.trim();

        const { data: space, error: spaceError } = await supabase
            .from('spaces')
            .insert({
                name,
                type: validated.type,
                created_by: session.user.id,
            })
            .select('id, name, type, created_at')
            .single();

        if (spaceError || !space) {
            return NextResponse.json({ error: spaceError?.message || 'No se pudo crear el espacio.' }, { status: 500 });
        }

        const { error: memberError } = await supabase
            .from('space_members')
            .insert({
                space_id: space.id,
                user_id: session.user.id,
                role: 'owner',
            });

        if (memberError) {
            // Best effort cleanup.
            await supabase.from('spaces').delete().eq('id', space.id);
            return NextResponse.json({ error: memberError.message || 'No se pudo asignar el espacio.' }, { status: 500 });
        }

        await supabase.auth.updateUser({ data: { active_space_id: space.id } });

        const spaces = await listUserSpaces(supabase as any, session.user.id);

        logInfo('space_created', {
            ...context,
            userId: session.user.id,
            spaceId: space.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            space,
            activeSpaceId: space.id,
            spaces,
        });
    } catch (error: any) {
        logError('space_create_exception', error, { ...context, durationMs: Date.now() - startedAt });
        return NextResponse.json({ error: error?.errors || error?.message || 'No se pudo crear el espacio.' }, { status: 400 });
    }
}

