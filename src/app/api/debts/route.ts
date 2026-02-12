import { createClient } from '@/lib/supabase-server';
import { DebtSchema } from '@/lib/schemas';
import { NextResponse } from 'next/server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

export async function GET() {
    const context = createRequestContext('/api/debts', 'GET');
    const startedAt = Date.now();
    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('debts')
            .select('*')
            .eq('user_id', session.user.id)
            .order('next_payment_date', { ascending: true });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        logInfo('debts_loaded', {
            ...context,
            userId: session.user.id,
            count: data?.length || 0,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error) {
        logError('debts_get_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al cargar deudas' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/debts', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validatedData = DebtSchema.parse(body);
        const { data, error } = await supabase
            .from('debts')
            .insert([{ ...validatedData, user_id: session.user.id }])
            .select()
            .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'debt',
            entityId: data.id,
            action: 'create',
            afterData: data,
        });

        logInfo('debt_created', {
            ...context,
            userId: session.user.id,
            debtId: data.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (err: any) {
        logError('debt_create_exception', err, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: err.errors || err.message }, { status: 400 });
    }
}
