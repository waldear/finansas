import { NextResponse } from 'next/server';
import { sanitizeEnv } from '@/lib/utils';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';
import { generateGeminiContentWithFallback } from '@/lib/gemini';

type AssistantRequestPayload = {
    message?: string;
};

type TransactionRow = {
    type: 'income' | 'expense';
    amount: number;
    category: string;
    description: string;
    date: string;
};

function parseNumber(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function currentMonthKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysUntil(dateValue: string) {
    const target = new Date(`${dateValue}T00:00:00.000Z`);
    if (Number.isNaN(target.getTime())) return null;

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const diff = target.getTime() - todayUtc.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatMoney(value: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(value);
}

export async function POST(req: Request) {
    const logContext = createRequestContext('/api/assistant', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = (await req.json().catch(() => ({}))) as AssistantRequestPayload;
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (!message) {
            return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
        }

        const geminiApiKey = sanitizeEnv(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);
        if (!geminiApiKey) {
            return NextResponse.json({
                text: 'El sistema de IA no está configurado (falta GEMINI_API_KEY).',
            });
        }

        const month = currentMonthKey();
        const [
            transactionsResult,
            debtsResult,
            goalsResult,
            obligationsResult,
            budgetsResult,
            recurringResult,
        ] = await Promise.all([
            supabase
                .from('transactions')
                .select('type, amount, category, description, date')
                .eq('user_id', user.id)
                .order('date', { ascending: false })
                .limit(300),
            supabase
                .from('debts')
                .select('id, name, total_amount, monthly_payment, remaining_installments, total_installments, category, next_payment_date')
                .eq('user_id', user.id)
                .order('next_payment_date', { ascending: true }),
            supabase
                .from('savings_goals')
                .select('id, name, target_amount, current_amount, deadline, category, is_completed')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false }),
            supabase
                .from('obligations')
                .select('id, title, amount, due_date, status, category, minimum_payment')
                .eq('user_id', user.id)
                .order('due_date', { ascending: true }),
            supabase
                .from('budgets')
                .select('id, category, month, limit_amount, alert_threshold')
                .eq('user_id', user.id)
                .eq('month', month),
            supabase
                .from('recurring_transactions')
                .select('id, type, amount, description, category, frequency, next_run, is_active')
                .eq('user_id', user.id)
                .eq('is_active', true)
                .order('next_run', { ascending: true }),
        ]);

        if (transactionsResult.error) logWarn('assistant_transactions_query_warning', { ...logContext, userId: user.id, reason: transactionsResult.error.message });
        if (debtsResult.error) logWarn('assistant_debts_query_warning', { ...logContext, userId: user.id, reason: debtsResult.error.message });
        if (goalsResult.error) logWarn('assistant_goals_query_warning', { ...logContext, userId: user.id, reason: goalsResult.error.message });
        if (obligationsResult.error) logWarn('assistant_obligations_query_warning', { ...logContext, userId: user.id, reason: obligationsResult.error.message });
        if (budgetsResult.error) logWarn('assistant_budgets_query_warning', { ...logContext, userId: user.id, reason: budgetsResult.error.message });
        if (recurringResult.error) logWarn('assistant_recurring_query_warning', { ...logContext, userId: user.id, reason: recurringResult.error.message });

        const transactions = (transactionsResult.data || []) as TransactionRow[];
        const debts = (debtsResult.data || []) as any[];
        const goals = (goalsResult.data || []) as any[];
        const obligations = (obligationsResult.data || []) as any[];
        const budgets = (budgetsResult.data || []) as any[];
        const recurring = (recurringResult.data || []) as any[];

        const totalIncome = transactions
            .filter((transaction) => transaction.type === 'income')
            .reduce((accumulator, transaction) => accumulator + parseNumber(transaction.amount), 0);
        const totalExpenses = transactions
            .filter((transaction) => transaction.type === 'expense')
            .reduce((accumulator, transaction) => accumulator + parseNumber(transaction.amount), 0);
        const balance = totalIncome - totalExpenses;

        const activeDebts = debts.filter((debt) => parseNumber(debt.total_amount) > 0 && parseNumber(debt.remaining_installments) > 0);
        const pendingObligations = obligations.filter((obligation) => obligation.status === 'pending');
        const overdueObligations = pendingObligations.filter((obligation) => {
            const days = daysUntil(obligation.due_date);
            return days !== null && days < 0;
        });

        const monthExpenses = transactions.filter(
            (transaction) => transaction.type === 'expense' && typeof transaction.date === 'string' && transaction.date.startsWith(month)
        );
        const spentByCategory = monthExpenses.reduce<Record<string, number>>((accumulator, transaction) => {
            const key = String(transaction.category || 'otros').toLowerCase();
            accumulator[key] = (accumulator[key] || 0) + parseNumber(transaction.amount);
            return accumulator;
        }, {});

        const budgetUsage = budgets.map((budget) => {
            const categoryKey = String(budget.category || 'otros').toLowerCase();
            const spent = spentByCategory[categoryKey] || 0;
            const limitAmount = parseNumber(budget.limit_amount);
            const usage = limitAmount > 0 ? (spent / limitAmount) * 100 : 0;
            const alertThreshold = parseNumber(budget.alert_threshold) || 80;

            return {
                category: budget.category,
                spent,
                limit_amount: limitAmount,
                usage: Number(usage.toFixed(1)),
                alert_threshold: alertThreshold,
                is_alert: usage >= alertThreshold,
            };
        });

        const reminders: string[] = [];

        for (const obligation of pendingObligations.slice(0, 8)) {
            const days = daysUntil(obligation.due_date);
            if (days === null) continue;
            if (days < 0) {
                reminders.push(`⚠️ ${obligation.title} está vencida por ${Math.abs(days)} día(s) (${formatMoney(parseNumber(obligation.amount))}).`);
                continue;
            }
            if (days <= 7) {
                reminders.push(`⏰ ${obligation.title} vence en ${days} día(s) (${formatMoney(parseNumber(obligation.amount))}).`);
            }
        }

        for (const debt of activeDebts.slice(0, 8)) {
            const days = daysUntil(String(debt.next_payment_date));
            if (days === null || days > 7) continue;
            reminders.push(`💳 Pago de ${debt.name} en ${days} día(s), cuota ${formatMoney(parseNumber(debt.monthly_payment))}.`);
        }

        for (const budget of budgetUsage.filter((item) => item.is_alert).slice(0, 5)) {
            reminders.push(`📉 Presupuesto ${budget.category} al ${budget.usage}% (${formatMoney(budget.spent)} de ${formatMoney(budget.limit_amount)}).`);
        }

        for (const item of recurring.slice(0, 5)) {
            const days = daysUntil(String(item.next_run));
            if (days === null || days > 7) continue;
            reminders.push(`🔁 ${item.description} se ejecuta en ${days} día(s) por ${formatMoney(parseNumber(item.amount))}.`);
        }

        const assistantContext = {
            summary: {
                balance,
                totalIncome,
                totalExpenses,
                totalActiveDebt: activeDebts.reduce((accumulator, debt) => accumulator + parseNumber(debt.total_amount), 0),
                totalPendingObligations: pendingObligations.reduce((accumulator, obligation) => accumulator + parseNumber(obligation.amount), 0),
                overdueObligations: overdueObligations.length,
                pendingObligationsCount: pendingObligations.length,
                activeDebtsCount: activeDebts.length,
                goalsCount: goals.length,
            },
            debts: activeDebts.slice(0, 15),
            obligations: obligations.slice(0, 20),
            budgets: budgetUsage.slice(0, 20),
            recurring: recurring.slice(0, 20),
            goals: goals.slice(0, 20),
            recentTransactions: transactions.slice(0, 40),
            reminders: reminders.slice(0, 12),
        };

        const systemPrompt = `
Eres el asistente principal de Finansas. Tu rol es ser el "cerebro" financiero del usuario.
Responde en español, con tono directo y accionable.
Usa SOLAMENTE el contexto entregado en este prompt.
Si falta algún dato, dilo explícitamente.

Tu respuesta debe incluir:
1) Estado actual (resumen corto)
2) Recordatorios clave (máximo 5)
3) Recomendaciones accionables (máximo 4)
4) Siguiente mejor acción (1 acción concreta para hoy)

Prioriza:
- vencimientos próximos o vencidos
- pagos de deudas
- desvíos de presupuesto
- riesgo de liquidez (si balance es bajo frente a obligaciones)
`;

        const { text, modelName } = await generateGeminiContentWithFallback({
            apiKey: geminiApiKey,
            request: `
${systemPrompt}

Fecha de referencia (UTC): ${new Date().toISOString()}

CONTEXTO FINANCIERO:
${JSON.stringify(assistantContext)}

MENSAJE DEL USUARIO:
${message}
`,
        });

        logInfo('assistant_response_generated', {
            ...logContext,
            userId: user.id,
            model: modelName,
            remindersCount: reminders.length,
            transactionsInContext: transactions.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ text });
    } catch (error: any) {
        logError('assistant_exception', error, {
            ...logContext,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({
            text: 'Lo siento, tuve un problema al procesar tu solicitud. Intenta de nuevo más tarde.',
        });
    }
}
