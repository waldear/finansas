import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { RecurringTransactionUpdateSchema } from '@/lib/schemas';
import { recordAuditEvent } from '@/lib/audit';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { ensureActiveSpace } from '@/lib/spaces';

const ParamsSchema = z.object({
    id: z.string().uuid('ID de recurrencia inválido'),
});

function isMissingRecurringTableError(message?: string | null) {
    if (!message) return false;
    const value = message.toLowerCase();
    return value.includes('recurring_transactions') && value.includes('schema cache');
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/recurring/[id]', 'PUT');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de recurrencia inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const payload = await req.json();
        const validated = RecurringTransactionUpdateSchema.parse(payload);

        const nextPayload = { ...validated };
        if (nextPayload.start_date && !nextPayload.next_run) {
            nextPayload.next_run = nextPayload.start_date;
        }

        const { data: existingRule, error: existingError } = await supabase
            .from('recurring_transactions')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) {
            if (isMissingRecurringTableError(existingError.message)) {
                return NextResponse.json({
                    error: 'El módulo de recurrencias no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: existingError.message }, { status: 500 });
        }
        if (!existingRule) return NextResponse.json({ error: 'Regla recurrente no encontrada' }, { status: 404 });

        const { data: updatedRule, error: updateError } = await supabase
            .from('recurring_transactions')
            .update(nextPayload)
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .select('*')
            .single();

        if (updateError) {
            if (isMissingRecurringTableError(updateError.message)) {
                return NextResponse.json({
                    error: 'El módulo de recurrencias no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'recurring_transaction',
            entityId: updatedRule.id,
            action: 'update',
            beforeData: existingRule,
            afterData: updatedRule,
        });

        logInfo('recurring_updated', {
            ...context,
            userId: session.user.id,
            recurringId: updatedRule.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(updatedRule);
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('recurring_update_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'Datos inválidos' }, { status: 400 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/recurring/[id]', 'DELETE');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de recurrencia inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data: existingRule, error: existingError } = await supabase
            .from('recurring_transactions')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId)
            .maybeSingle();

        if (existingError) {
            if (isMissingRecurringTableError(existingError.message)) {
                return NextResponse.json({
                    error: 'El módulo de recurrencias no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: existingError.message }, { status: 500 });
        }
        if (!existingRule) return NextResponse.json({ error: 'Regla recurrente no encontrada' }, { status: 404 });

        const { error: deleteError } = await supabase
            .from('recurring_transactions')
            .delete()
            .eq('id', parsedParams.data.id)
            .eq('space_id', activeSpaceId);

        if (deleteError) {
            if (isMissingRecurringTableError(deleteError.message)) {
                return NextResponse.json({
                    error: 'El módulo de recurrencias no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'recurring_transaction',
            entityId: existingRule.id,
            action: 'delete',
            beforeData: existingRule,
        });

        logInfo('recurring_deleted', {
            ...context,
            userId: session.user.id,
            recurringId: existingRule.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, id: existingRule.id });
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('recurring_delete_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'No se pudo eliminar la recurrencia' }, { status: 400 });
    }
}
