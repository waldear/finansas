import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { sanitizeEnv } from '@/lib/utils';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';
import { generateGeminiContentWithFallback } from '@/lib/gemini';
import { recordAuditEvent } from '@/lib/audit';
import { estimateTokenCount, recordAssistantUsageEvent, resolveAssistantEntitlement } from '@/lib/assistant-entitlements';

type AssistantRequestPayload = {
    message?: string;
    documentContext?: {
        sourceName?: string;
        mimeType?: string;
        sizeBytes?: number;
        extraction?: unknown;
    };
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
            currency?: 'ARS' | 'USD';
            description: string;
            category: string;
            date: string;
            card_brand?: 'visa' | 'mastercard' | 'amex' | 'unknown';
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
    }
    | {
        type: 'installment_plan';
        payload: {
            plan_name: string;
            total_installments: number;
            upfront_ars_amount: number;
            upfront_usd_amount: number;
            future_installments: number;
            future_installment_amount_ars: number;
            paid_date: string;
            was_paid_now: boolean;
            card_brand: 'visa' | 'mastercard' | 'amex' | 'unknown';
        };
    };

type AppliedAction = {
    type: 'transaction' | 'debt' | 'obligation';
    id: string;
    summary: string;
};

type AssistantDocumentContext = {
    sourceName: string;
    mimeType: string;
    sizeBytes: number;
    extraction: unknown;
};

type DocumentRegisterEntry = {
    type: 'income' | 'expense';
    amount: number;
    description: string;
    category: string;
    date: string;
    currency: 'ARS' | 'USD';
};

function sanitizeDocumentContext(raw: AssistantRequestPayload['documentContext']): AssistantDocumentContext | null {
    if (!raw || typeof raw !== 'object') return null;

    const sourceName = typeof raw.sourceName === 'string' && raw.sourceName.trim()
        ? raw.sourceName.trim().slice(0, 180)
        : 'adjunto';

    const mimeType = typeof raw.mimeType === 'string' && raw.mimeType.trim()
        ? raw.mimeType.trim().slice(0, 120)
        : 'application/octet-stream';

    const sizeBytes = Number.isFinite(Number(raw.sizeBytes)) ? Number(raw.sizeBytes) : 0;
    const extraction = raw.extraction ?? null;

    return {
        sourceName,
        mimeType,
        sizeBytes,
        extraction,
    };
}

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

function addMonthsIsoDate(dateValue: string, monthsToAdd: number) {
    const base = new Date(`${dateValue}T00:00:00.000Z`);
    if (Number.isNaN(base.getTime())) return isoToday();

    const day = base.getUTCDate();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + monthsToAdd);
    const monthLastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(day, monthLastDay));
    return base.toISOString().split('T')[0];
}

function detectCardBrand(rawMessage: string): 'visa' | 'mastercard' | 'amex' | 'unknown' {
    const normalized = normalizeText(rawMessage);
    if (/\bvisa\b/.test(normalized)) return 'visa';
    if (/\bmaster\b|\bmastercard\b/.test(normalized)) return 'mastercard';
    if (/\bamex\b|\bamerican express\b/.test(normalized)) return 'amex';
    return 'unknown';
}

function extractAmountsByCurrency(rawMessage: string) {
    const matcher = /(u\$s|us\$|usd|\$)\s*([0-9][0-9.,]*)/gi;
    const entries: Array<{ currency: 'ARS' | 'USD'; amount: number }> = [];
    let match: RegExpExecArray | null = null;

    while ((match = matcher.exec(rawMessage)) !== null) {
        const marker = normalizeText(match[1] || '');
        const currency = marker.includes('u$s') || marker.includes('us$') || marker.includes('usd') ? 'USD' : 'ARS';
        const amount = parseLocalizedAmount(match[2] || '');
        if (!amount) continue;

        entries.push({
            currency,
            amount,
        });
    }

    return entries;
}

function parseInstallmentPlanFromMessage(rawMessage: string) {
    const normalized = normalizeText(rawMessage);
    const planSignal = /\bplan\b|\bcuotas?\b/.test(normalized);
    const installmentsMatch = normalized.match(/(\d{1,3})\s*cuotas?\s*(?:de)?\s*\$?\s*([0-9][0-9.,]*)/i);
    const rawInstallmentsMatch = rawMessage.match(/(\d{1,3})\s*cuotas?\s*(?:de)?\s*\$?\s*([0-9][0-9.,]*)/i);
    if (!planSignal || !installmentsMatch) return null;

    const futureInstallments = Number(installmentsMatch[1]);
    const futureInstallmentAmountArs = parseLocalizedAmount(installmentsMatch[2]);
    if (!futureInstallments || !futureInstallmentAmountArs) return null;

    const totalInstallmentsMatch = normalized.match(/en\s+(\d{1,3})\b/i);
    const totalInstallments = totalInstallmentsMatch?.[1]
        ? Math.max(Number(totalInstallmentsMatch[1]), futureInstallments)
        : futureInstallments + 1;

    const planNameMatch = rawMessage.match(/(plan\s+[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ.\-_ ]{1,50})/i);
    const planName = planNameMatch?.[1]?.trim() || 'Plan en cuotas';

    const upfrontSourceText = rawInstallmentsMatch?.index != null
        ? rawMessage.slice(0, rawInstallmentsMatch.index)
        : rawMessage;
    const upfrontAmounts = extractAmountsByCurrency(upfrontSourceText);
    const allAmounts = extractAmountsByCurrency(rawMessage);

    const upfrontArsAmount = upfrontAmounts.find((item) => item.currency === 'ARS')?.amount || 0;
    const upfrontUsdAmount = upfrontAmounts.find((item) => item.currency === 'USD')?.amount
        || allAmounts.find((item) => item.currency === 'USD')?.amount
        || 0;
    const paidDate = extractIsoDateFromText(rawMessage);
    const wasPaidNow = /\b(pague|pague|pago|pagado|debitaron|debitado|me cobraron|cobro)\b/i.test(normalized);
    const cardBrand = detectCardBrand(rawMessage);

    return {
        plan_name: planName,
        total_installments: totalInstallments,
        upfront_ars_amount: upfrontArsAmount,
        upfront_usd_amount: upfrontUsdAmount,
        future_installments: futureInstallments,
        future_installment_amount_ars: futureInstallmentAmountArs,
        paid_date: paidDate,
        was_paid_now: wasPaidNow,
        card_brand: cardBrand,
    };
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

    const thisMonthMatch = rawMessage.match(/\b(?:el\s+)?(\d{1,2})\s+de\s+este\s+mes\b/i);
    if (thisMonthMatch?.[1]) {
        const day = Number(thisMonthMatch[1]);
        if (day >= 1 && day <= 31) {
            const now = new Date();
            const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
            return candidate.toISOString().split('T')[0];
        }
    }

    const normalized = normalizeText(rawMessage);
    const monthByName = [
        { key: 'enero', month: 1 },
        { key: 'febrero', month: 2 },
        { key: 'marzo', month: 3 },
        { key: 'abril', month: 4 },
        { key: 'mayo', month: 5 },
        { key: 'junio', month: 6 },
        { key: 'julio', month: 7 },
        { key: 'agosto', month: 8 },
        { key: 'septiembre', month: 9 },
        { key: 'setiembre', month: 9 },
        { key: 'octubre', month: 10 },
        { key: 'noviembre', month: 11 },
        { key: 'diciembre', month: 12 },
    ].find((item) => normalized.includes(item.key));

    if (monthByName) {
        const yearMatch = normalized.match(/\b(20\d{2})\b/);
        const year = yearMatch?.[1] ? Number(yearMatch[1]) : new Date().getUTCFullYear();
        return `${year}-${String(monthByName.month).padStart(2, '0')}-01`;
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
        const isUsdAmount = /\b(u\$s|us\$|usd)\b/i.test(body);
        const cardBrand = detectCardBrand(body);

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
                currency: isUsdAmount ? 'USD' : 'ARS',
                description,
                category: categoryFromDescription(kind, description),
                date,
                card_brand: cardBrand,
            },
        };
    }

    const installmentPlan = parseInstallmentPlanFromMessage(raw);
    if (installmentPlan) {
        return {
            type: 'installment_plan',
            payload: installmentPlan,
        };
    }

    const expenseUsdMatch = raw.match(/(?:gaste|gasto|pague|pago|compre|compro|me debitaron|debitaron|me cobraron|cobraron)\s*(?:de)?\s*(?:u\$s|us\$|usd)\s*([0-9][0-9.,]*)/i);
    const expenseArsMatch = normalized.match(/(?:gaste|gasto|pague|pago|compre|compro|me debitaron|debitaron|me cobraron|cobraron)\s*(?:de)?\s*\$?\s*([0-9][0-9.,]*)/);
    if (expenseUsdMatch?.[1] || expenseArsMatch?.[1]) {
        const isUsd = Boolean(expenseUsdMatch?.[1]);
        const amount = parseLocalizedAmount((expenseUsdMatch?.[1] || expenseArsMatch?.[1]) as string);
        if (!amount) return null;

        const categoryPhrase = raw.match(/(?:en|de)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s-]{3,60})/);
        const description = categoryPhrase?.[1]?.trim() || raw;
        const category = categoryFromDescription('expense', description);

        return {
            type: 'transaction',
            payload: {
                type: 'expense',
                amount,
                currency: isUsd ? 'USD' : 'ARS',
                description: `Gasto informado: ${description}`,
                category,
                date: extractIsoDateFromText(raw),
                card_brand: detectCardBrand(raw),
            },
        };
    }

    const incomeUsdMatch = raw.match(/(?:ingrese|ingreso|cobre|cobro|recibi|recibo|me depositaron|depositaron)\s*(?:de)?\s*(?:u\$s|us\$|usd)\s*([0-9][0-9.,]*)/i);
    const incomeArsMatch = normalized.match(/(?:ingrese|ingreso|cobre|cobro|recibi|recibo|me depositaron|depositaron)\s*(?:de)?\s*\$?\s*([0-9][0-9.,]*)/);
    if (incomeUsdMatch?.[1] || incomeArsMatch?.[1]) {
        const isUsd = Boolean(incomeUsdMatch?.[1]);
        const amount = parseLocalizedAmount((incomeUsdMatch?.[1] || incomeArsMatch?.[1]) as string);
        if (!amount) return null;

        const categoryPhrase = raw.match(/(?:por|de)\s+([a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s-]{3,60})/);
        const description = categoryPhrase?.[1]?.trim() || raw;
        const category = categoryFromDescription('income', description);

        return {
            type: 'transaction',
            payload: {
                type: 'income',
                amount,
                currency: isUsd ? 'USD' : 'ARS',
                description: `Ingreso informado: ${description}`,
                category,
                date: extractIsoDateFromText(raw),
                card_brand: detectCardBrand(raw),
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

function shouldRegisterFromMessage(message: string) {
    const normalized = normalizeText(message);
    return /\b(registra|registrar|registralo|registralo|guardar|guarda|cargar|carga|anota|agrega|importa)\b/.test(normalized);
}

function parseDocumentEntriesForRegistration(message: string, extraction: any): DocumentRegisterEntry[] {
    const baseDate = extractIsoDateFromText(`${message}\n${String(extraction?.period_label || '')}\n${String(extraction?.raw_text || '')}`);
    const entries = Array.isArray(extraction?.entries)
        ? extraction.entries
        : Array.isArray(extraction?.items)
            ? extraction.items
            : [];

    const rows: DocumentRegisterEntry[] = [];
    const dedupe = new Set<string>();

    for (const entry of entries) {
        const labelRaw = typeof entry?.label === 'string'
            ? entry.label
            : typeof entry?.description === 'string'
                ? entry.description
                : '';
        const label = labelRaw.trim();
        if (!label) continue;

        const normalizedLabel = normalizeText(label);
        if (/^(total|diferencia|saldo|resumen)$/.test(normalizedLabel)) continue;
        if (/(^|\s)(total|diferencia|saldo)\b/.test(normalizedLabel)) continue;

        const amount = typeof entry?.amount === 'string'
            ? parseLocalizedAmount(entry.amount) || 0
            : parseNumber(entry?.amount);
        if (!amount || amount <= 0) continue;

        const currencyRaw = typeof entry?.currency === 'string' ? entry.currency.toUpperCase() : 'ARS';
        const currency: 'ARS' | 'USD' = currencyRaw.includes('USD') ? 'USD' : 'ARS';
        const kind = typeof entry?.kind === 'string' ? normalizeText(entry.kind) : '';

        let type: 'income' | 'expense';
        if (kind === 'income') {
            type = 'income';
        } else if (kind === 'expense' || kind === 'debt' || kind === 'saving') {
            type = 'expense';
        } else {
            type = /\b(sueldo|salario|ingreso|extra|venta|cobro|deposito|deposito)\b/.test(normalizedLabel)
                ? 'income'
                : 'expense';
        }

        const category = /\b(ahorro|fondo)\b/.test(normalizedLabel)
            ? 'Ahorro'
            : categoryFromDescription(type, label);

        const dateValue = typeof entry?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
            ? entry.date
            : baseDate;

        const key = `${type}|${category}|${label}|${amount.toFixed(2)}|${dateValue}|${currency}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);

        rows.push({
            type,
            amount: Number(amount.toFixed(2)),
            description: label,
            category,
            date: dateValue,
            currency,
        });
    }

    return rows.slice(0, 120);
}

async function persistChatEvent(params: {
    supabase: SupabaseClient;
    userId: string;
    role: 'user' | 'assistant';
    content: string;
    actionsApplied?: AppliedAction[];
    documentContext?: AssistantDocumentContext | null;
}) {
    const { supabase, userId, role, content, actionsApplied = [], documentContext = null } = params;
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
                document_context: documentContext,
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

function parseEnvNumber(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getDefaultTaxPercent() {
    const countryTax = parseEnvNumber(process.env.ARG_TAX_PAIS_PERCENT, 30);
    const incomeTax = parseEnvNumber(process.env.ARG_TAX_GANANCIAS_PERCENT, 30);
    const extraTax = parseEnvNumber(process.env.ARG_TAX_CARD_EXTRA_PERCENT, 0);
    return countryTax + incomeTax + extraTax;
}

function cardSpecificExtraPercent(cardBrand: 'visa' | 'mastercard' | 'amex' | 'unknown') {
    if (cardBrand === 'visa') return parseEnvNumber(process.env.ARG_CARD_EXTRA_PERCENT_VISA, 0);
    if (cardBrand === 'mastercard') return parseEnvNumber(process.env.ARG_CARD_EXTRA_PERCENT_MASTERCARD, 0);
    if (cardBrand === 'amex') return parseEnvNumber(process.env.ARG_CARD_EXTRA_PERCENT_AMEX, 0);
    return 0;
}

async function fetchJsonWithTimeout(url: string, timeoutMs = 3500) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
        });

        if (!response.ok) return null;
        return await response.json().catch(() => null);
    } finally {
        clearTimeout(timeout);
    }
}

async function convertUsdToArs(params: {
    usdAmount: number;
    cardBrand: 'visa' | 'mastercard' | 'amex' | 'unknown';
}) {
    const { usdAmount, cardBrand } = params;

    if (usdAmount <= 0) {
        return {
            arsAmount: 0,
            rateUsed: 0,
            source: 'none',
            taxesAppliedPercent: 0,
            cardBrand,
        };
    }

    const cardRateResponse = await fetchJsonWithTimeout('https://dolarapi.com/v1/dolares/tarjeta');
    const apiCardRate = Number(cardRateResponse?.venta);
    const cardExtra = cardSpecificExtraPercent(cardBrand);

    if (Number.isFinite(apiCardRate) && apiCardRate > 0) {
        const effectiveRate = apiCardRate * (1 + cardExtra / 100);
        return {
            arsAmount: usdAmount * effectiveRate,
            rateUsed: effectiveRate,
            source: 'dolarapi_tarjeta',
            taxesAppliedPercent: cardExtra,
            cardBrand,
        };
    }

    const officialRateResponse = await fetchJsonWithTimeout('https://dolarapi.com/v1/dolares/oficial');
    const apiOfficialRate = Number(officialRateResponse?.venta);
    const fallbackOfficialRate = parseEnvNumber(process.env.ARG_USD_OFFICIAL_RATE, 1250);
    const officialRate = Number.isFinite(apiOfficialRate) && apiOfficialRate > 0
        ? apiOfficialRate
        : fallbackOfficialRate;

    const taxesPercent = getDefaultTaxPercent() + cardExtra;
    const effectiveRate = officialRate * (1 + taxesPercent / 100);

    return {
        arsAmount: usdAmount * effectiveRate,
        rateUsed: effectiveRate,
        source: Number.isFinite(apiOfficialRate) && apiOfficialRate > 0 ? 'dolarapi_oficial_plus_taxes' : 'env_fallback_plus_taxes',
        taxesAppliedPercent: taxesPercent,
        cardBrand,
    };
}

async function applyDocumentQuickAction(params: {
    supabase: SupabaseClient;
    userId: string;
    message: string;
    documentContext: AssistantDocumentContext;
}): Promise<AppliedAction[]> {
    const { supabase, userId, message, documentContext } = params;
    const extraction = (documentContext.extraction || {}) as any;
    const entries = parseDocumentEntriesForRegistration(message, extraction);
    if (!entries.length) return [];

    const cardBrand = detectCardBrand(message);
    const requiresUsdConversion = entries.some((entry) => entry.currency === 'USD');
    const usdRateInfo = requiresUsdConversion
        ? await convertUsdToArs({ usdAmount: 1, cardBrand })
        : null;

    const insertPayload: Array<{
        user_id: string;
        type: 'income' | 'expense';
        amount: number;
        category: string;
        description: string;
        date: string;
    }> = [];

    let convertedUsdCount = 0;
    let convertedUsdTotal = 0;

    for (const entry of entries) {
        let amountArs = entry.amount;
        let description = entry.description;

        if (entry.currency === 'USD') {
            const rate = usdRateInfo?.rateUsed || 0;
            if (rate <= 0) continue;
            amountArs = Number((entry.amount * rate).toFixed(2));
            convertedUsdCount += 1;
            convertedUsdTotal += entry.amount;

            description = `${entry.description} | USD ${entry.amount.toFixed(2)} convertido a ARS (TC ${rate.toFixed(2)}${usdRateInfo?.taxesAppliedPercent ? `, imp. ${usdRateInfo.taxesAppliedPercent.toFixed(1)}%` : ''})`;
        }

        insertPayload.push({
            user_id: userId,
            type: entry.type,
            amount: amountArs,
            category: entry.category,
            description,
            date: entry.date,
        });
    }

    if (!insertPayload.length) return [];

    const { data: insertedRows, error } = await supabase
        .from('transactions')
        .insert(insertPayload)
        .select('id, type, amount, category');

    if (error || !insertedRows?.length) {
        throw new Error(`No se pudieron registrar movimientos del documento: ${error?.message || 'sin detalles'}`);
    }

    const incomeTotal = insertedRows
        .filter((row) => row.type === 'income')
        .reduce((acc, row) => acc + parseNumber(row.amount), 0);
    const expenseTotal = insertedRows
        .filter((row) => row.type === 'expense')
        .reduce((acc, row) => acc + parseNumber(row.amount), 0);

    await recordAuditEvent({
        supabase,
        userId,
        entityType: 'transaction_batch',
        entityId: insertedRows[0].id,
        action: 'system',
        metadata: {
            source: 'assistant_document_registration',
            document_name: documentContext.sourceName,
            total_inserted: insertedRows.length,
            income_total: incomeTotal,
            expense_total: expenseTotal,
            usd_rows_converted: convertedUsdCount,
            usd_total_original: Number(convertedUsdTotal.toFixed(2)),
            fx_source: usdRateInfo?.source || null,
            fx_rate: usdRateInfo?.rateUsed || null,
            fx_taxes_percent: usdRateInfo?.taxesAppliedPercent || null,
        },
    });

    const summaries: AppliedAction[] = [{
        type: 'transaction',
        id: insertedRows[0].id,
        summary: `Se registraron ${insertedRows.length} movimientos del archivo (${insertedRows.filter((row) => row.type === 'income').length} ingresos y ${insertedRows.filter((row) => row.type === 'expense').length} gastos).`,
    }];

    if (convertedUsdCount > 0) {
        summaries.push({
            type: 'transaction',
            id: insertedRows[0].id,
            summary: `Conversión USD aplicada: ${convertedUsdCount} fila(s), total original USD ${convertedUsdTotal.toFixed(2)} usando TC ${usdRateInfo?.rateUsed?.toFixed(2) || 'N/A'}.`,
        });
    }

    return summaries;
}

async function applyQuickAction(params: {
    supabase: SupabaseClient;
    userId: string;
    message: string;
}): Promise<AppliedAction[]> {
    const { supabase, userId, message } = params;
    const detectedAction = inferQuickAction(message);
    if (!detectedAction) return [] as AppliedAction[];

    if (detectedAction.type === 'installment_plan') {
        const actions: AppliedAction[] = [];
        const payload = detectedAction.payload;

        const conversion = await convertUsdToArs({
            usdAmount: payload.upfront_usd_amount,
            cardBrand: payload.card_brand,
        });

        const upfrontTotalArs = payload.upfront_ars_amount + conversion.arsAmount;

        if (payload.was_paid_now && upfrontTotalArs > 0) {
            const descriptionSegments = [
                `${payload.plan_name} - pago inicial`,
                payload.upfront_ars_amount > 0 ? `ARS ${payload.upfront_ars_amount.toFixed(2)}` : null,
                payload.upfront_usd_amount > 0
                    ? `USD ${payload.upfront_usd_amount.toFixed(2)} → ARS ${conversion.arsAmount.toFixed(2)} (TC ${conversion.rateUsed.toFixed(2)}${conversion.taxesAppliedPercent ? `, imp. ${conversion.taxesAppliedPercent.toFixed(1)}%` : ''})`
                    : null,
            ]
                .filter(Boolean)
                .join(' | ');

            const { data: transaction, error: transactionError } = await supabase
                .from('transactions')
                .insert({
                    user_id: userId,
                    type: 'expense',
                    amount: Number(upfrontTotalArs.toFixed(2)),
                    category: 'Tarjeta',
                    description: descriptionSegments,
                    date: payload.paid_date,
                })
                .select()
                .single();

            if (transactionError || !transaction) {
                throw new Error(`No se pudo registrar el pago inicial del plan: ${transactionError?.message || 'sin detalles'}`);
            }

            await recordAuditEvent({
                supabase,
                userId,
                entityType: 'transaction',
                entityId: transaction.id,
                action: 'create',
                afterData: transaction,
                metadata: {
                    source: 'assistant_installment_plan',
                    fx_source: conversion.source,
                    fx_rate: conversion.rateUsed,
                    fx_taxes_percent: conversion.taxesAppliedPercent,
                    usd_amount: payload.upfront_usd_amount,
                    ars_amount: payload.upfront_ars_amount,
                },
            });

            actions.push({
                type: 'transaction',
                id: transaction.id,
                summary: `Pago inicial registrado por ${formatMoney(Number(upfrontTotalArs.toFixed(2)))}${payload.upfront_usd_amount > 0 ? ` (incluye USD ${payload.upfront_usd_amount.toFixed(2)})` : ''}.`,
            });
        }

        if (payload.future_installments > 0 && payload.future_installment_amount_ars > 0) {
            const totalFutureAmount = payload.future_installments * payload.future_installment_amount_ars;
            const nextPaymentDate = addMonthsIsoDate(payload.paid_date, 1);

            const { data: debt, error: debtError } = await supabase
                .from('debts')
                .insert({
                    user_id: userId,
                    name: `${payload.plan_name} (cuotas pendientes)`,
                    total_amount: Number(totalFutureAmount.toFixed(2)),
                    monthly_payment: Number(payload.future_installment_amount_ars.toFixed(2)),
                    remaining_installments: payload.future_installments,
                    total_installments: payload.total_installments,
                    category: 'Tarjeta',
                    next_payment_date: nextPaymentDate,
                })
                .select()
                .single();

            if (!debtError && debt) {
                await recordAuditEvent({
                    supabase,
                    userId,
                    entityType: 'debt',
                    entityId: debt.id,
                    action: 'create',
                    afterData: debt,
                    metadata: {
                        source: 'assistant_installment_plan',
                    },
                });

                actions.push({
                    type: 'debt',
                    id: debt.id,
                    summary: `Deuda creada por ${payload.future_installments} cuota(s) de ${formatMoney(payload.future_installment_amount_ars)}.`,
                });
            } else {
                logWarn('assistant_installment_plan_debt_warning', {
                    userId,
                    reason: debtError?.message || 'No se pudo crear deuda',
                });
            }

            const obligationsPayload = Array.from({ length: payload.future_installments }).map((_, index) => ({
                user_id: userId,
                title: `${payload.plan_name} - cuota ${index + 1}/${payload.future_installments}`,
                amount: Number(payload.future_installment_amount_ars.toFixed(2)),
                due_date: addMonthsIsoDate(payload.paid_date, index + 1),
                status: 'pending' as const,
                category: 'Tarjeta',
                minimum_payment: Number(payload.future_installment_amount_ars.toFixed(2)),
            }));

            const { data: obligations, error: obligationsError } = await supabase
                .from('obligations')
                .insert(obligationsPayload)
                .select('id');

            if (!obligationsError && obligations?.length) {
                actions.push({
                    type: 'obligation',
                    id: obligations[0].id,
                    summary: `Se programaron ${obligations.length} vencimientos futuros para ${payload.plan_name}.`,
                });
            } else if (obligationsError) {
                logWarn('assistant_installment_plan_obligations_warning', {
                    userId,
                    reason: obligationsError.message,
                });
            }
        }

        return actions;
    }

    if (detectedAction.type === 'transaction') {
        let persistedAmount = detectedAction.payload.amount;
        let convertedDescriptionSuffix = '';
        let fxMetadata: Record<string, unknown> | null = null;

        if (detectedAction.payload.currency === 'USD') {
            const conversion = await convertUsdToArs({
                usdAmount: detectedAction.payload.amount,
                cardBrand: detectedAction.payload.card_brand || detectCardBrand(message),
            });
            persistedAmount = Number(conversion.arsAmount.toFixed(2));
            convertedDescriptionSuffix = ` | USD ${detectedAction.payload.amount.toFixed(2)} convertido a ARS (TC ${conversion.rateUsed.toFixed(2)}${conversion.taxesAppliedPercent ? `, imp. ${conversion.taxesAppliedPercent.toFixed(1)}%` : ''})`;
            fxMetadata = {
                source: conversion.source,
                rate: conversion.rateUsed,
                taxes_percent: conversion.taxesAppliedPercent,
                card_brand: conversion.cardBrand,
                original_currency: 'USD',
                original_amount: detectedAction.payload.amount,
            };
        }

        const { data, error } = await supabase
            .from('transactions')
            .insert({
                type: detectedAction.payload.type,
                amount: persistedAmount,
                description: `${detectedAction.payload.description}${convertedDescriptionSuffix}`,
                category: detectedAction.payload.category,
                date: detectedAction.payload.date,
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
                ...(fxMetadata || {}),
            },
        });

        return [{
            type: 'transaction' as const,
            id: data.id,
            summary: `${detectedAction.payload.type === 'income' ? 'Ingreso' : 'Gasto'} ${formatMoney(persistedAmount)} en ${detectedAction.payload.category}${detectedAction.payload.currency === 'USD' ? ` (original USD ${detectedAction.payload.amount.toFixed(2)})` : ''}`,
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
    let supabase: SupabaseClient | null = null;
    let userId: string | null = null;
    let userMessage = '';
    let entitlementSnapshot: Awaited<ReturnType<typeof resolveAssistantEntitlement>> | null = null;

    try {
        supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        userId = user.id;

        const body = (await req.json().catch(() => ({}))) as AssistantRequestPayload;
        const message = typeof body.message === 'string' ? body.message.trim() : '';
        if (!message) {
            return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 });
        }
        userMessage = message;

        const documentContext = sanitizeDocumentContext(body.documentContext);
        entitlementSnapshot = await resolveAssistantEntitlement({
            supabase,
            userId: user.id,
            requestContext: logContext,
        });

        if (entitlementSnapshot.blockedReason) {
            await recordAssistantUsageEvent({
                supabase,
                userId: user.id,
                requestId: logContext.requestId as string,
                plan: entitlementSnapshot.plan,
                status: 'blocked',
                blockedReason: entitlementSnapshot.blockedReason,
                metadata: {
                    limitRequests: entitlementSnapshot.limitRequests,
                    usedRequests: entitlementSnapshot.usedRequests,
                    remainingRequests: entitlementSnapshot.remainingRequests,
                },
            });

            logInfo('assistant_usage_blocked', {
                ...logContext,
                userId: user.id,
                reason: entitlementSnapshot.blockedReason,
                usedRequests: entitlementSnapshot.usedRequests,
                limitRequests: entitlementSnapshot.limitRequests,
                durationMs: Date.now() - startedAt,
            });

            return NextResponse.json({
                text: 'Alcanzaste el límite mensual del asistente en tu plan actual. Para seguir usando IA sin restricciones, activa Finansas Pro.',
                actionsApplied: [],
                billing: {
                    plan: entitlementSnapshot.plan,
                    status: entitlementSnapshot.status,
                    provider: entitlementSnapshot.provider,
                    requiresUpgrade: entitlementSnapshot.plan !== 'pro',
                    usage: {
                        usedRequests: entitlementSnapshot.usedRequests,
                        limitRequests: entitlementSnapshot.limitRequests,
                        remainingRequests: entitlementSnapshot.remainingRequests,
                        periodStart: entitlementSnapshot.periodStartIso,
                        periodEnd: entitlementSnapshot.periodEndIso,
                    },
                },
            });
        }

        const geminiApiKey = sanitizeEnv(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);
        if (!geminiApiKey) {
            return NextResponse.json({
                text: 'El sistema de IA no está configurado (falta GEMINI_API_KEY).',
            });
        }

        let actionsApplied: AppliedAction[] = [];
        if (documentContext && shouldRegisterFromMessage(message)) {
            try {
                actionsApplied = await applyDocumentQuickAction({
                    supabase,
                    userId: user.id,
                    message,
                    documentContext,
                });
            } catch (error) {
                logWarn('assistant_document_registration_failed', {
                    ...logContext,
                    userId: user.id,
                    reason: error instanceof Error ? error.message : String(error),
                });
            }
        } else if (!documentContext) {
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
        }

        await persistChatEvent({
            supabase,
            userId: user.id,
            role: 'user',
            content: message,
            actionsApplied,
            documentContext,
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
            attachedDocument: documentContext,
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
Si "attachedDocument" existe, inclúyelo en tu análisis como fuente principal de contexto documental.

Prioriza:
- vencimientos próximos o vencidos
- pagos de deudas
- desvíos de presupuesto
- riesgo de liquidez (si balance es bajo frente a obligaciones)
`;

        const generationRequest = `
${systemPrompt}

Fecha de referencia (UTC): ${new Date().toISOString()}

CONTEXTO FINANCIERO:
${JSON.stringify(assistantContext)}

MENSAJE DEL USUARIO:
${message}
`;

        const { text, modelName, usage } = await generateGeminiContentWithFallback({
            apiKey: geminiApiKey,
            request: generationRequest,
        });

        await persistChatEvent({
            supabase,
            userId: user.id,
            role: 'assistant',
            content: text,
            actionsApplied,
            documentContext,
        });

        const promptTokens = usage?.promptTokenCount || estimateTokenCount(generationRequest);
        const completionTokens = usage?.candidatesTokenCount || estimateTokenCount(text);
        const totalTokens = usage?.totalTokenCount || (promptTokens + completionTokens);
        await recordAssistantUsageEvent({
            supabase,
            userId: user.id,
            requestId: logContext.requestId as string,
            plan: entitlementSnapshot.plan,
            status: 'completed',
            model: modelName,
            promptTokens,
            completionTokens,
            totalTokens,
            metadata: {
                actionsApplied: actionsApplied.length,
                hasDocumentContext: Boolean(documentContext),
            },
        });

        const usedRequests = entitlementSnapshot.usedRequests + 1;
        const remainingRequests = Math.max(0, entitlementSnapshot.limitRequests - usedRequests);

        logInfo('assistant_response_generated', {
            ...logContext,
            userId: user.id,
            model: modelName,
            actionsApplied: actionsApplied.length,
            plan: entitlementSnapshot.plan,
            usedRequests,
            limitRequests: entitlementSnapshot.limitRequests,
            remindersCount: reminders.length,
            transactionsInContext: transactions.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            text,
            actionsApplied,
            billing: {
                plan: entitlementSnapshot.plan,
                status: entitlementSnapshot.status,
                provider: entitlementSnapshot.provider,
                requiresUpgrade: false,
                usage: {
                    usedRequests,
                    limitRequests: entitlementSnapshot.limitRequests,
                    remainingRequests,
                    periodStart: entitlementSnapshot.periodStartIso,
                    periodEnd: entitlementSnapshot.periodEndIso,
                },
            },
        });
    } catch (error: unknown) {
        if (supabase && userId && entitlementSnapshot) {
            try {
                await recordAssistantUsageEvent({
                    supabase,
                    userId,
                    requestId: logContext.requestId as string,
                    plan: entitlementSnapshot.plan,
                    status: 'failed',
                    promptTokens: estimateTokenCount(userMessage),
                    completionTokens: 0,
                    totalTokens: estimateTokenCount(userMessage),
                    blockedReason: 'runtime_error',
                    metadata: {
                        reason: error instanceof Error ? error.message : String(error),
                    },
                });
            } catch {
                // no-op: fail-soft on usage telemetry
            }
        }

        logError('assistant_exception', error, {
            ...logContext,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({
            text: 'Lo siento, tuve un problema al procesar tu solicitud. Intenta de nuevo más tarde.',
            actionsApplied: [],
            billing: entitlementSnapshot
                ? {
                    plan: entitlementSnapshot.plan,
                    status: entitlementSnapshot.status,
                    provider: entitlementSnapshot.provider,
                    requiresUpgrade: false,
                    usage: {
                        usedRequests: entitlementSnapshot.usedRequests,
                        limitRequests: entitlementSnapshot.limitRequests,
                        remainingRequests: entitlementSnapshot.remainingRequests,
                        periodStart: entitlementSnapshot.periodStartIso,
                        periodEnd: entitlementSnapshot.periodEndIso,
                    },
                }
                : null,
        });
    }
}
