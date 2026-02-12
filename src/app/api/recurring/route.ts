import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { RecurringTransactionSchema } from '@/lib/schemas';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

export async function GET() {
    const context = createRequestContext('/api/recurring', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('recurring_transactions')
            .select('*')
            .eq('user_id', session.user.id)
            .order('next_run', { ascending: true });

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        logInfo('recurring_loaded', {
            ...context,
            userId: session.user.id,
            count: data?.length || 0,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error) {
        logError('recurring_get_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al cargar reglas recurrentes' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/recurring', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await req.json();
        const validated = RecurringTransactionSchema.parse(payload);

        const { data, error } = await supabase
            .from('recurring_transactions')
            .insert({
                ...validated,
                user_id: session.user.id,
                next_run: validated.next_run || validated.start_date,
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'recurring_transaction',
            entityId: data.id,
            action: 'create',
            afterData: data,
        });

        logInfo('recurring_created', {
            ...context,
            userId: session.user.id,
            recurringId: data.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error: any) {
        logError('recurring_create_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message }, { status: 400 });
    }
}
