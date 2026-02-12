import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { BudgetSchema } from '@/lib/schemas';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

function getMonthRange(month: string) {
    const [year, monthPart] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, monthPart - 1, 1));
    const end = new Date(Date.UTC(year, monthPart, 0));
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    };
}

function currentMonth() {
    const date = new Date();
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isMissingBudgetsTableError(message?: string | null) {
    if (!message) return false;
    const value = message.toLowerCase();
    return value.includes('budgets') && value.includes('schema cache');
}

export async function GET(req: Request) {
    const context = createRequestContext('/api/budgets', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const month = new URL(req.url).searchParams.get('month') || currentMonth();
        const { startDate, endDate } = getMonthRange(month);

        const { data: budgets, error: budgetsError } = await supabase
            .from('budgets')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('month', month)
            .order('category', { ascending: true });

        if (budgetsError) {
            if (isMissingBudgetsTableError(budgetsError.message)) {
                logWarn('budgets_table_missing_returning_empty', {
                    ...context,
                    userId: session.user.id,
                    reason: budgetsError.message,
                });
                return NextResponse.json([]);
            }
            return NextResponse.json({ error: budgetsError.message }, { status: 500 });
        }

        const { data: transactions, error: txError } = await supabase
            .from('transactions')
            .select('category, amount, type, date')
            .eq('user_id', session.user.id)
            .eq('type', 'expense')
            .gte('date', startDate)
            .lte('date', endDate);

        if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

        const spentByCategory = new Map<string, number>();
        (transactions || []).forEach((transaction: any) => {
            const previous = spentByCategory.get(transaction.category) || 0;
            spentByCategory.set(transaction.category, previous + Number(transaction.amount || 0));
        });

        const enriched = (budgets || []).map((budget: any) => {
            const spent = spentByCategory.get(budget.category) || 0;
            const usage = budget.limit_amount > 0 ? (spent / budget.limit_amount) * 100 : 0;
            return {
                ...budget,
                spent,
                remaining: Math.max(0, Number(budget.limit_amount) - spent),
                usage,
                isAlert: usage >= Number(budget.alert_threshold || 80),
            };
        });

        logInfo('budgets_loaded', {
            ...context,
            userId: session.user.id,
            month,
            count: enriched.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(enriched);
    } catch (error) {
        logError('budgets_get_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al cargar presupuestos' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/budgets', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await req.json();
        const validated = BudgetSchema.parse(payload);

        const { data, error } = await supabase
            .from('budgets')
            .upsert({
                ...validated,
                user_id: session.user.id,
            }, {
                onConflict: 'user_id,category,month',
            })
            .select()
            .single();

        if (error) {
            if (isMissingBudgetsTableError(error.message)) {
                return NextResponse.json({
                    error: 'El módulo de presupuestos no está inicializado en la base.',
                    hint: 'Ejecuta supabase-advanced.sql en Supabase SQL Editor.',
                }, { status: 503 });
            }
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'budget',
            entityId: data.id,
            action: 'create',
            afterData: data,
        });

        logInfo('budget_upserted', {
            ...context,
            userId: session.user.id,
            budgetId: data.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error: any) {
        logError('budget_upsert_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message }, { status: 400 });
    }
}
