import { createClient } from '@/lib/supabase-server';
import { SavingsGoalInputSchema } from '@/lib/schemas';
import { NextResponse } from 'next/server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';
import { ensureActiveSpace } from '@/lib/spaces';

export async function GET() {
    const context = createRequestContext('/api/savings', 'GET');
    const startedAt = Date.now();
    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data, error } = await supabase
            .from('savings_goals')
            .select('*')
            .eq('space_id', activeSpaceId)
            .order('created_at', { ascending: false });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        logInfo('savings_loaded', {
            ...context,
            userId: session.user.id,
            count: data?.length || 0,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error) {
        logError('savings_get_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al cargar metas' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/savings', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const body = await req.json();
        const validatedData = SavingsGoalInputSchema.parse(body);
        const { data, error } = await supabase
            .from('savings_goals')
            .insert([{ ...validatedData, user_id: session.user.id, space_id: activeSpaceId }])
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'savings_goal',
            entityId: data.id,
            action: 'create',
            afterData: data,
        });

        logInfo('savings_goal_created', {
            ...context,
            userId: session.user.id,
            goalId: data.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (err: unknown) {
        const error = err as { errors?: unknown; message?: string };
        logError('savings_goal_create_exception', err, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message || 'Datos inválidos' }, { status: 400 });
    }
}
