import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { BudgetUpdateSchema } from '@/lib/schemas';
import { recordAuditEvent } from '@/lib/audit';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { ensureActiveSpace } from '@/lib/spaces';

const ParamsSchema = z.object({
    id: z.string().uuid('ID de presupuesto inválido'),
});

function isMissingBudgetsTableError(message?: string | null) {
    if (!message) return false;
    const value = message.toLowerCase();
    return value.includes('budgets') && value.includes('schema cache');
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/budgets/[id]', 'PUT');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de presupuesto inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const payload = await req.json();
        const validated = BudgetUpdateSchema.parse(payload);

        const { data: existingBudget, error: existingError } = await supabase
            .from('budgets')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) {
            if (isMissingBudgetsTableError(existingError.message)) {
                return NextResponse.json({
                    error: 'El módulo de presupuestos no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: existingError.message }, { status: 500 });
        }
        if (!existingBudget) return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });

        const { data: updatedBudget, error: updateError } = await supabase
            .from('budgets')
            .update(validated)
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .select('*')
            .single();

        if (updateError) {
            if (isMissingBudgetsTableError(updateError.message)) {
                return NextResponse.json({
                    error: 'El módulo de presupuestos no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'budget',
            entityId: updatedBudget.id,
            action: 'update',
            beforeData: existingBudget,
            afterData: updatedBudget,
        });

        logInfo('budget_updated', {
            ...context,
            userId: session.user.id,
            budgetId: updatedBudget.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(updatedBudget);
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('budget_update_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'Datos inválidos' }, { status: 400 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/budgets/[id]', 'DELETE');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de presupuesto inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data: existingBudget, error: existingError } = await supabase
            .from('budgets')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) {
            if (isMissingBudgetsTableError(existingError.message)) {
                return NextResponse.json({
                    error: 'El módulo de presupuestos no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: existingError.message }, { status: 500 });
        }
        if (!existingBudget) return NextResponse.json({ error: 'Presupuesto no encontrado' }, { status: 404 });

        const { error: deleteError } = await supabase
            .from('budgets')
            .delete()
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId);

        if (deleteError) {
            if (isMissingBudgetsTableError(deleteError.message)) {
                return NextResponse.json({
                    error: 'El módulo de presupuestos no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'budget',
            entityId: existingBudget.id,
            action: 'delete',
            beforeData: existingBudget,
        });

        logInfo('budget_deleted', {
            ...context,
            userId: session.user.id,
            budgetId: existingBudget.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, id: existingBudget.id });
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('budget_delete_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'No se pudo eliminar el presupuesto' }, { status: 400 });
    }
}
