import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ensureActiveSpace } from '@/lib/spaces';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

type CalendarItem =
    | {
        kind: 'obligation';
        id: string;
        title: string;
        amount: number;
        due_date: string;
        status: 'pending' | 'overdue' | 'paid' | string;
        category: string | null;
        minimum_payment: number | null;
    }
    | {
        kind: 'debt';
        id: string;
        title: string;
        amount: number;
        due_date: string;
        category: string | null;
        remaining_installments: number | null;
    }
    | {
        kind: 'recurring';
        id: string;
        title: string;
        amount: number;
        due_date: string;
        type: 'income' | 'expense' | string;
        frequency: string;
        category: string | null;
    };

function isoToday() {
    return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number) {
    const base = new Date(`${baseIso}T00:00:00.000Z`);
    if (Number.isNaN(base.getTime())) return baseIso;
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString().slice(0, 10);
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function toNumber(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
    const context = createRequestContext('/api/calendar', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const url = new URL(req.url);
        const days = clamp(Number(url.searchParams.get('days') || 45), 1, 120);

        const from = isoToday();
        const to = addDaysIso(from, days);

        const [obligationsResult, debtsResult, recurringResult] = await Promise.all([
            supabase
                .from('obligations')
                .select('id, title, amount, due_date, status, category, minimum_payment')
                .eq('space_id', activeSpaceId)
                .in('status', ['pending', 'overdue'])
                .lte('due_date', to)
                .order('due_date', { ascending: true })
                .limit(800),
            supabase
                .from('debts')
                .select('id, name, total_amount, monthly_payment, next_payment_date, remaining_installments, category')
                .eq('space_id', activeSpaceId)
                .lte('next_payment_date', to)
                .order('next_payment_date', { ascending: true })
                .limit(800),
            supabase
                .from('recurring_transactions')
                .select('id, type, amount, description, category, frequency, next_run, is_active')
                .eq('space_id', activeSpaceId)
                .eq('is_active', true)
                .lte('next_run', to)
                .order('next_run', { ascending: true })
                .limit(800),
        ]);

        const obligations = (obligationsResult.data || []) as any[];
        const debts = (debtsResult.data || []) as any[];
        const recurring = (recurringResult.data || []) as any[];

        const items: CalendarItem[] = [
            ...obligations.map((row) => ({
                kind: 'obligation' as const,
                id: String(row.id),
                title: String(row.title || 'Obligación'),
                amount: toNumber(row.amount),
                due_date: String(row.due_date),
                status: row.status,
                category: row.category ?? null,
                minimum_payment: row.minimum_payment != null ? toNumber(row.minimum_payment) : null,
            })),
            ...debts.map((row) => ({
                kind: 'debt' as const,
                id: String(row.id),
                title: String(row.name || 'Deuda'),
                amount: toNumber(row.monthly_payment || 0) || toNumber(row.total_amount || 0),
                due_date: String(row.next_payment_date),
                category: row.category ?? null,
                remaining_installments: row.remaining_installments != null ? Number(row.remaining_installments) : null,
            })),
            ...recurring.map((row) => ({
                kind: 'recurring' as const,
                id: String(row.id),
                title: String(row.description || 'Recurrente'),
                amount: toNumber(row.amount),
                due_date: String(row.next_run),
                type: String(row.type || 'expense'),
                frequency: String(row.frequency || 'monthly'),
                category: row.category ?? null,
            })),
        ]
            .filter((item) => typeof item.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.due_date))
            .sort((a, b) => a.due_date.localeCompare(b.due_date));

        logInfo('calendar_loaded', {
            ...context,
            userId: session.user.id,
            spaceId: activeSpaceId,
            obligations: obligations.length,
            debts: debts.length,
            recurring: recurring.length,
            total: items.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            range: { from, to, days },
            items,
        });
    } catch (error) {
        logError('calendar_get_exception', error, { ...context, durationMs: Date.now() - startedAt });
        return NextResponse.json({ error: 'No se pudo cargar la agenda.' }, { status: 500 });
    }
}

