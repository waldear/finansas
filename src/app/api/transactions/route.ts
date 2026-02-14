import { createClient } from '@/lib/supabase-server';
import { TransactionInputSchema } from '@/lib/schemas';
import { NextResponse } from 'next/server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

export async function GET() {
    const context = createRequestContext('/api/transactions', 'GET');
    const startedAt = Date.now();
    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', session.user.id)
            .order('date', { ascending: false })
            // Tie-breaker so "Actividad Reciente" shows the newest record when multiple share the same date.
            .order('created_at', { ascending: false });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        logInfo('transactions_loaded', {
            ...context,
            userId: session.user.id,
            count: data?.length || 0,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error) {
        logError('transactions_get_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al cargar transacciones' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/transactions', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validatedData = TransactionInputSchema.parse(body);

        const { data, error } = await supabase
            .from('transactions')
            .insert([{ ...validatedData, user_id: session.user.id }])
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'transaction',
            entityId: data.id,
            action: 'create',
            afterData: data,
        });

        logInfo('transaction_created', {
            ...context,
            userId: session.user.id,
            transactionId: data.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (err: unknown) {
        const error = err as { errors?: unknown; message?: string };
        logError('transaction_create_exception', err, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message || 'Datos inválidos' }, { status: 400 });
    }
}
