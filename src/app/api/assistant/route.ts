import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sanitizeEnv } from '@/lib/utils';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';
import { generateGeminiContentWithFallback } from '@/lib/gemini';
import { recordAuditEvent } from '@/lib/audit';

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

type QuickAction =
    | {
        type: 'transaction';
        payload: {
            type: 'income' | 'expense';
            amount: number;
            description: string;
            category: string;
            date: string;
        };
    }
    | {
        type: 'debt';
        payload: {
            name: string;
            total_amount: number;
            monthly_payment: number;
            remaining_installments: number;
            total_installments: number;
            category: string;
            next_payment_date: string;
        };
    };

type AppliedAction = {
    type: 'transaction' | 'debt';
    id: string;
    summary: string;
};

function normalizeText(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function parseNumber(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function parseLocalizedAmount(value: string) {
    const normalized = value
        .replace(/[^\d,.-]/g, '')
        .replace(/\s/g, '');

    if (!normalized) return null;

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');

    let candidate = normalized;
    if (hasComma && hasDot) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
            candidate = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            candidate = normalized.replace(/,/g, '');
        }
    } else if (hasComma) {
        candidate = normalized.replace(',', '.');
    }

    const amount = Number(candidate);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return amount;
}

function isoToday() {
    return new Date().toISOString().split('T')[0];
}

function extractIsoDateFromText(rawMessage: string) {
    const isoMatch = rawMessage.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (isoMatch?.[1]) return isoMatch[1];

    const localMatch = rawMessage.match(/\b(\d{2})\/(\d{2})\/(20\d{2})\b/);
    if (localMatch) {
        const [, day, month, year] = localMatch;
        return `${year}-${month}-${day}`;
    }

    return isoToday();
}

function categoryFromDescription(type: 'income' | 'expense', description: string) {
    const text = normalizeText(description);
    if (type === 'income') {
        if (/sueldo|salario|nomina/.test(text)) return 'Salario';
        if (/freelance|cliente|servicio/.test(text)) return 'Freelance';
        if (/venta|vendi/.test(text)) return 'Ventas';
        return 'Ingresos';
    }

    if (/super|mercado|almacen/.test(text)) return 'Supermercado';
    if (/comida|almuerzo|cena|desayuno|resto|restaurante/.test(text)) return 'Comida';
    if (/nafta|gasolina|transporte|uber|taxi|subte|colectivo/.test(text)) return 'Transporte';
    if (/luz|agua|gas|internet|telefono|servicio/.test(text)) return 'Servicios';
    if (/salud|farmacia|medico/.test(text)) return 'Salud';
    if (/educacion|curso|colegio/.test(text)) return 'Educación';
    if (/ocio|netflix|spotify|cine|entretenimiento/.test(text)) return 'Entretenimiento';
    if (/tarjeta|deuda|prestamo|prestamo/.test(text)) return 'Deudas';
    return 'Gastos';
}

function inferQuickAction(message: string): QuickAction | null {
    const raw = message.trim();
    const normalized = normalizeText(raw);

    const commandMatch = raw.match(/^\/(gasto|ingreso|deuda)\s+(.+)$/i);
    if (commandMatch) {
        const command = normalizeText(commandMatch[1]);
        const body = commandMatch[2].trim();
        const amountMatch = body.match(/(\d[\d.,]*)/);
        const amount = amountMatch?.[1] ? parseLocalizedAmount(amountMatch[1]) : null;
        if (!amount) return null;

        const description = body.replace(amountMatch?.[1] || '', '').trim() || 'Registro desde asistente';
        const date = extractIsoDateFromText(body);

        if (command === 'deuda') {
            const installmentsMatch = body.match(/(\d{1,3})\s*cuotas?/i);
            const totalInstallments = installmentsMatch?.[1] ? Number(installmentsMatch[1]) : 1;
            const quotaMatch = body.match(/cuota(?:s)?\s*(?:de)?\s*(\d[\d.,]*)/i);
            const monthlyPayment = quotaMatch?.[1] ? parseLocalizedAmount(quotaMatch[1]) || amount : amount;

            return {
                type: 'debt',
                payload: {
                    name: description || 'Deuda registrada por asistente',
                    total_amount: amount,
                    monthly_payment: monthlyPayment,
                    remaining_installments: totalInstallments,
                    total_installments: totalInstallments,
                    category: 'Deuda',
                    next_payment_date: date,
                },
            };
        }

        const kind = command === 'ingreso' ? 'income' : 'expense';
        return {
            type: 'transaction',
            payload: {
                type: kind,
                amount,
                description,
                category: categoryFromDescription(kind, description),
                date,
            },
        };
    }

    const expenseMatch = normalized.match(/(?:gaste|gasto|pague|pago|compre|compro|me debitaron|debitaron|me cobraron|cobraron)\s*(?:de)?\s*\$?\s*([0-9][0-9.,]*)/);
    if (expenseMatch?.[1]) {
        const amount = parseLocalizedAmount(expenseMatch[1]);
        if (!amount) return null;

        const categoryPhrase = raw.match(/(?:en|de)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s-]{3,60})/);
        const description = categoryPhrase?.[1]?.trim() || raw;
        const category = categoryFromDescription('expense', description);

        return {
            type: 'transaction',
            payload: {
                type: 'expense',
                amount,
                description: `Gasto informado: ${description}`,
                category,
                date: extractIsoDateFromText(raw),
            },
        };
    }

    const incomeMatch = normalized.match(/(?:ingrese|ingreso|cobre|cobro|recibi|recibo|me depositaron|depositaron)\s*(?:de)?\s*\$?\s*([0-9][0-9.,]*)/);
    if (incomeMatch?.[1]) {
        const amount = parseLocalizedAmount(incomeMatch[1]);
        if (!amount) return null;

        const categoryPhrase = raw.match(/(?:por|de)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s-]{3,60})/);
        const description = categoryPhrase?.[1]?.trim() || raw;
        const category = categoryFromDescription('income', description);

        return {
            type: 'transaction',
            payload: {
                type: 'income',
                amount,
                description: `Ingreso informado: ${description}`,
                category,
                date: extractIsoDateFromText(raw),
            },
        };
    }

    const debtSignal = /\b(deuda|tarjeta|prestamo|prestamo|debo)\b/.test(normalized);
    const debtAmountMatch = raw.match(/\$?\s*([0-9][0-9.,]*)/);
    if (debtSignal && debtAmountMatch?.[1]) {
        const amount = parseLocalizedAmount(debtAmountMatch[1]);
        if (!amount) return null;

        const installmentsMatch = normalized.match(/(\d{1,3})\s*cuotas?/);
        const totalInstallments = installmentsMatch?.[1] ? Number(installmentsMatch[1]) : 1;
        const quotaMatch = normalized.match(/cuota(?:s)?\s*(?:de)?\s*([0-9][0-9.,]*)/);
        const monthlyPayment = quotaMatch?.[1] ? parseLocalizedAmount(quotaMatch[1]) || amount : amount;

        const nameMatch = raw.match(/(?:tarjeta|deuda|prestamo|préstamo)\s*(.*)$/i);
        const name = nameMatch?.[1]?.trim() || 'Deuda registrada por asistente';

        return {
            type: 'debt',
            payload: {
                name,
                total_amount: amount,
                monthly_payment: monthlyPayment,
                remaining_installments: totalInstallments,
                total_installments: totalInstallments,
                category: /tarjeta/.test(normalized) ? 'Tarjeta' : 'Deuda',
                next_payment_date: extractIsoDateFromText(raw),
            },
        };
    }

    return null;
}

async function persistChatEvent(params: {
    supabase: SupabaseClient;
    userId: string;
    role: 'user' | 'assistant';
    content: string;
    actionsApplied?: AppliedAction[];
}) {
    const { supabase, userId, role, content, actionsApplied = [] } = params;
    try {
        const { error } = await supabase.from('audit_events').insert({
            user_id: userId,
            entity_type: 'assistant_chat',
            entity_id: 'main',
            action: 'system',
            metadata: {
                role,
                content,
                actions_applied: actionsApplied,
            },
        });

        if (error) {
            logWarn('assistant_chat_persist_warning', {
                userId,
                role,
                reason: error.message,
            });
        }
    } catch (error) {
        logWarn('assistant_chat_persist_exception', {
            userId,
            role,
            reason: error instanceof Error ? error.message : String(error),
        });
    }
}

async function applyQuickAction(params: {
    supabase: SupabaseClient;
    userId: string;
    message: string;
}): Promise<AppliedAction[]> {
    const { supabase, userId, message } = params;
    const detectedAction = inferQuickAction(message);
    if (!detectedAction) return [] as AppliedAction[];

    if (detectedAction.type === 'transaction') {
        const { data, error } = await supabase
            .from('transactions')
            .insert({
                ...detectedAction.payload,
                user_id: userId,
            })
            .select()
            .single();

        if (error || !data) {
            throw new Error(`No se pudo registrar transacción: ${error?.message || 'sin detalles'}`);
        }

        await recordAuditEvent({
            supabase,
            userId,
            entityType: 'transaction',
            entityId: data.id,
            action: 'create',
            afterData: data,
            metadata: {
                source: 'assistant_quick_action',
            },
        });

        return [{
            type: 'transaction' as const,
            id: data.id,
            summary: `${detectedAction.payload.type === 'income' ? 'Ingreso' : 'Gasto'} ${formatMoney(detectedAction.payload.amount)} en ${detectedAction.payload.category}`,
        }];
    }

    const { data, error } = await supabase
        .from('debts')
        .insert({
            ...detectedAction.payload,
            user_id: userId,
        })
        .select()
        .single();

    if (error || !data) {
        throw new Error(`No se pudo registrar deuda: ${error?.message || 'sin detalles'}`);
    }

    await recordAuditEvent({
        supabase,
        userId,
        entityType: 'debt',
        entityId: data.id,
        action: 'create',
        afterData: data,
        metadata: {
            source: 'assistant_quick_action',
        },
    });

    return [{
        type: 'debt' as const,
        id: data.id,
        summary: `Deuda ${data.name} por ${formatMoney(parseNumber(data.total_amount))}`,
    }];
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

        let actionsApplied: AppliedAction[] = [];
        try {
            actionsApplied = await applyQuickAction({
                supabase,
                userId: user.id,
                message,
            });
        } catch (error) {
            logWarn('assistant_quick_action_failed', {
                ...logContext,
                userId: user.id,
                reason: error instanceof Error ? error.message : String(error),
            });
        }

        await persistChatEvent({
            supabase,
            userId: user.id,
            role: 'user',
            content: message,
            actionsApplied,
        });

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
            actionsApplied,
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

Si "actionsApplied" viene con elementos, confirma claramente qué se registró automáticamente.

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

        await persistChatEvent({
            supabase,
            userId: user.id,
            role: 'assistant',
            content: text,
            actionsApplied,
        });

        logInfo('assistant_response_generated', {
            ...logContext,
            userId: user.id,
            model: modelName,
            actionsApplied: actionsApplied.length,
            remindersCount: reminders.length,
            transactionsInContext: transactions.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            text,
            actionsApplied,
        });
    } catch (error: any) {
        logError('assistant_exception', error, {
            ...logContext,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({
            text: 'Lo siento, tuve un problema al procesar tu solicitud. Intenta de nuevo más tarde.',
            actionsApplied: [],
        });
    }
}
