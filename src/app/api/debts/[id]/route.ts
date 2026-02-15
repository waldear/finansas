import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { DebtUpdateSchema } from '@/lib/schemas';
import { recordAuditEvent } from '@/lib/audit';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { ensureActiveSpace } from '@/lib/spaces';

const ParamsSchema = z.object({
    id: z.string().uuid('ID de deuda inválido'),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/debts/[id]', 'PUT');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de deuda inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const payload = await req.json();
        const validated = DebtUpdateSchema.parse(payload);

        const { data: existingDebt, error: existingError } = await supabase
            .from('debts')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        if (!existingDebt) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 });

        const { data: updatedDebt, error: updateError } = await supabase
            .from('debts')
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
            entityType: 'debt',
            entityId: updatedDebt.id,
            action: 'update',
            beforeData: existingDebt,
            afterData: updatedDebt,
        });

        logInfo('debt_updated', {
            ...context,
            userId: session.user.id,
            debtId: updatedDebt.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(updatedDebt);
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('debt_update_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'Datos inválidos' }, { status: 400 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/debts/[id]', 'DELETE');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de deuda inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data: existingDebt, error: existingError } = await supabase
            .from('debts')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        if (!existingDebt) return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 });

        const { error: deleteError } = await supabase
            .from('debts')
            .delete()
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId);

        if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'debt',
            entityId: existingDebt.id,
            action: 'delete',
            beforeData: existingDebt,
        });

        logInfo('debt_deleted', {
            ...context,
            userId: session.user.id,
            debtId: existingDebt.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, id: existingDebt.id });
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('debt_delete_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'No se pudo eliminar la deuda' }, { status: 400 });
    }
}
