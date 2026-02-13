import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { TransactionUpdateSchema } from '@/lib/schemas';
import { recordAuditEvent } from '@/lib/audit';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

const ParamsSchema = z.object({
    id: z.string().uuid('ID de transacción inválido'),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/transactions/[id]', 'PUT');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de transacción inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validatedData = TransactionUpdateSchema.parse(body);

        const { data: existingTransaction, error: existingError } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        if (!existingTransaction) return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });

        const { data: updatedTransaction, error: updateError } = await supabase
            .from('transactions')
            .update(validatedData)
            .eq('id', parsedParams.data.id)
            .eq('user_id', session.user.id)
            .select('*')
            .single();

        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'transaction',
            entityId: updatedTransaction.id,
            action: 'update',
            beforeData: existingTransaction,
            afterData: updatedTransaction,
        });

        logInfo('transaction_updated', {
            ...context,
            userId: session.user.id,
            transactionId: updatedTransaction.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(updatedTransaction);
    } catch (err: unknown) {
        const error = err as { errors?: unknown; message?: string };
        logError('transaction_update_exception', err, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message || 'Datos inválidos' }, { status: 400 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const context = createRequestContext('/api/transactions/[id]', 'DELETE');
    const startedAt = Date.now();

    try {
        const routeParams = await params;
        const parsedParams = ParamsSchema.safeParse(routeParams);
        if (!parsedParams.success) {
            return NextResponse.json({ error: 'ID de transacción inválido' }, { status: 400 });
        }

        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: existingTransaction, error: existingError } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', parsedParams.data.id)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
        if (!existingTransaction) return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });

        const { error: deleteError } = await supabase
            .from('transactions')
            .delete()
            .eq('id', parsedParams.data.id)
            .eq('user_id', session.user.id);

        if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'transaction',
            entityId: existingTransaction.id,
            action: 'delete',
            beforeData: existingTransaction,
            afterData: null,
        });

        logInfo('transaction_deleted', {
            ...context,
            userId: session.user.id,
            transactionId: existingTransaction.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, id: existingTransaction.id });
    } catch (err: unknown) {
        const error = err as { errors?: unknown; message?: string };
        logError('transaction_delete_exception', err, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message || 'No se pudo eliminar la transacción' }, { status: 400 });
    }
}
