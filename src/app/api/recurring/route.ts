import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { RecurringTransactionInputSchema } from '@/lib/schemas';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';
import { ensureActiveSpace } from '@/lib/spaces';

function isMissingRecurringTableError(message?: string | null) {
    if (!message) return false;
    const value = message.toLowerCase();
    return value.includes('recurring_transactions') && value.includes('schema cache');
}

export async function GET() {
    const context = createRequestContext('/api/recurring', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data, error } = await supabase
            .from('recurring_transactions')
            .select('*')
            .eq('space_id', activeSpaceId)
            .order('next_run', { ascending: true });

        if (error) {
            if (isMissingRecurringTableError(error.message)) {
                logWarn('recurring_table_missing_returning_empty', {
                    ...context,
                    userId: session.user.id,
                    reason: error.message,
                });
                return NextResponse.json([]);
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

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

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const payload = await req.json();
        const validated = RecurringTransactionInputSchema.parse(payload);

        const { data, error } = await supabase
            .from('recurring_transactions')
            .insert({
                ...validated,
                user_id: session.user.id,
                space_id: activeSpaceId,
                next_run: validated.next_run || validated.start_date,
            })
            .select()
            .single();

        if (error) {
            if (isMissingRecurringTableError(error.message)) {
                return NextResponse.json({
                    error: 'El módulo de recurrencias no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
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
    } catch (error: unknown) {
        const parsedError = error as { errors?: unknown; message?: string };
        logError('recurring_create_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: parsedError.errors || parsedError.message || 'Datos inválidos' }, { status: 400 });
    }
}
