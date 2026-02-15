import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { SavingsGoalUpdateSchema } from '@/lib/schemas';
import { recordAuditEvent } from '@/lib/audit';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { ensureActiveSpace } from '@/lib/spaces';

const ParamsSchema = z.object({
    id: z.string().uuid('ID de meta inválido'),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/savings/[id]', 'PUT');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de meta inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const payload = await req.json();
        const validated = SavingsGoalUpdateSchema.parse(payload);

        const { data: existingGoal, error: existingError } = await supabase
            .from('savings_goals')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        if (!existingGoal) return NextResponse.json({ error: 'Meta no encontrada' }, { status: 404 });

        const { data: updatedGoal, error: updateError } = await supabase
            .from('savings_goals')
            .update(validated)
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .select('*')
            .single();

        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'savings_goal',
            entityId: updatedGoal.id,
            action: 'update',
            beforeData: existingGoal,
            afterData: updatedGoal,
        });

        logInfo('savings_goal_updated', {
            ...context,
            userId: session.user.id,
            goalId: updatedGoal.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(updatedGoal);
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('savings_goal_update_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'Datos inválidos' }, { status: 400 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/savings/[id]', 'DELETE');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de meta inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data: existingGoal, error: existingError } = await supabase
            .from('savings_goals')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        if (!existingGoal) return NextResponse.json({ error: 'Meta no encontrada' }, { status: 404 });

        const { error: deleteError } = await supabase
            .from('savings_goals')
            .delete()
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId);

        if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'savings_goal',
            entityId: existingGoal.id,
            action: 'delete',
            beforeData: existingGoal,
        });

        logInfo('savings_goal_deleted', {
            ...context,
            userId: session.user.id,
            goalId: existingGoal.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, id: existingGoal.id });
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('savings_goal_delete_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'No se pudo eliminar la meta' }, { status: 400 });
    }
}
