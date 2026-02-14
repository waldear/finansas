import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

type PreviewRow = {
    date: string;
    type: 'income' | 'expense';
    category: string;
    description: string;
    amount: number;
};

function normalizeText(value: string) {
    return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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

function parseLocalizedSignedAmount(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value) && value !== 0) return value;
    if (typeof value !== 'string') return null;

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
    if (!Number.isFinite(amount) || amount === 0) return null;
    return amount;
}

function categoryFromDescription(type: 'income' | 'expense', description: string) {
    const text = normalizeText(description);
    if (type === 'income') {
        if (/sueldo|salario|nomina/.test(text)) return 'Salario';
        if (/freelance|cliente|servicio/.test(text)) return 'Freelance';
        if (/venta|vendi/.test(text)) return 'Ventas';
        return 'Ingresos';
    }

    if (/suscrip|subscription|membresia|membres[ií]a|netflix|spotify|disney|prime video|hbo|max|paramount/.test(text)) {
        return 'Suscripciones';
    }
    if (/super|mercado|almacen/.test(text)) return 'Supermercado';
    if (/comida|almuerzo|cena|desayuno|resto|restaurante/.test(text)) return 'Comida';
    if (/nafta|gasolina|transporte|uber|taxi|subte|colectivo/.test(text)) return 'Transporte';
    if (/luz|agua|gas|internet|telefono|servicio/.test(text)) return 'Servicios';
    if (/salud|farmacia|medico/.test(text)) return 'Salud';
    if (/tecnolog|tecnologia|apple|google|microsoft|steam|playstation|xbox|amazon web services|aws/.test(text)) return 'Tecnología';
    if (/educacion|curso|colegio/.test(text)) return 'Educación';
    if (/ocio|netflix|spotify|cine|entretenimiento/.test(text)) return 'Entretenimiento';
    if (/tarjeta|deuda|prestamo|préstamo/.test(text)) return 'Deudas';
    return 'Gastos';
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

async function getUsdToArsCardRate() {
    const cardRateResponse = await fetchJsonWithTimeout('https://dolarapi.com/v1/dolares/tarjeta');
    const apiCardRate = Number(cardRateResponse?.venta);
    if (Number.isFinite(apiCardRate) && apiCardRate > 0) {
        return { rateUsed: apiCardRate, source: 'dolarapi_tarjeta' as const };
    }

    const officialRateResponse = await fetchJsonWithTimeout('https://dolarapi.com/v1/dolares/oficial');
    const apiOfficialRate = Number(officialRateResponse?.venta);
    const fallbackOfficialRate = Number(process.env.ARG_USD_OFFICIAL_RATE || 1250);
    const officialRate = Number.isFinite(apiOfficialRate) && apiOfficialRate > 0 ? apiOfficialRate : fallbackOfficialRate;

    const taxesPercent = Number(process.env.ARG_TAX_PAIS_PERCENT || 30)
        + Number(process.env.ARG_TAX_GANANCIAS_PERCENT || 30)
        + Number(process.env.ARG_TAX_CARD_EXTRA_PERCENT || 0);

    const effectiveRate = officialRate * (1 + taxesPercent / 100);
    return {
        rateUsed: effectiveRate,
        source: Number.isFinite(apiOfficialRate) && apiOfficialRate > 0 ? 'dolarapi_oficial_plus_taxes' : 'env_fallback_plus_taxes',
        taxesAppliedPercent: taxesPercent,
    };
}

function parseRowsFromExtraction(extraction: any, maxRows: number) {
    const baseDate = extractIsoDateFromText(`${String(extraction?.period_label || '')}\n${String(extraction?.raw_text || '')}`);
    const entries = Array.isArray(extraction?.entries)
        ? extraction.entries
        : Array.isArray(extraction?.items)
            ? extraction.items
            : [];

    const rows: Array<PreviewRow & { currency: 'ARS' | 'USD'; originalAmount: number }> = [];
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

        const signedAmount = parseLocalizedSignedAmount(entry?.amount);
        if (signedAmount == null) continue;

        const amountAbs = Math.abs(signedAmount);
        if (!amountAbs || amountAbs <= 0) continue;

        const currencyRaw = typeof entry?.currency === 'string' ? entry.currency.toUpperCase() : 'ARS';
        const currency: 'ARS' | 'USD' = currencyRaw.includes('USD') ? 'USD' : 'ARS';
        const kind = typeof entry?.kind === 'string' ? normalizeText(entry.kind) : '';

        let type: 'income' | 'expense';
        if (kind === 'income') {
            type = 'income';
        } else if (kind === 'expense' || kind === 'debt' || kind === 'saving') {
            type = 'expense';
        } else if (signedAmount < 0) {
            type = 'expense';
        } else {
            type = /\b(sueldo|salario|ingreso|extra|venta|cobro|deposito|dep[oó]sito)\b/.test(normalizedLabel)
                ? 'income'
                : 'expense';
        }

        const extractedCategory = typeof entry?.category === 'string' && entry.category.trim()
            ? entry.category.trim().slice(0, 40)
            : null;

        const category = extractedCategory
            ? extractedCategory
            : /\b(ahorro|fondo)\b/.test(normalizedLabel)
                ? 'Ahorro'
                : categoryFromDescription(type, label);

        const dateValue = typeof entry?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
            ? entry.date
            : baseDate;

        const key = `${type}|${category}|${label}|${amountAbs.toFixed(2)}|${dateValue}|${currency}`;
        if (dedupe.has(key)) continue;
        dedupe.add(key);

        rows.push({
            date: dateValue,
            type,
            category,
            description: label,
            amount: Number(amountAbs.toFixed(2)),
            currency,
            originalAmount: Number(amountAbs.toFixed(2)),
        });

        if (rows.length >= maxRows) break;
    }

    return rows;
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/transactions/preview', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => null);
        const extraction = body?.extraction ?? body?.documentContext?.extraction ?? null;
        if (!extraction || typeof extraction !== 'object') {
            return NextResponse.json({ error: 'Falta extraction para generar el preview.' }, { status: 400 });
        }

        const maxRows = Number.isFinite(Number(body?.maxRows)) ? Math.min(Math.max(Number(body.maxRows), 1), 250) : 120;
        const rawRows = parseRowsFromExtraction(extraction, maxRows);
        if (rawRows.length === 0) {
            return NextResponse.json({ rows: [], warnings: ['No se detectaron movimientos en el adjunto.'] });
        }

        const hasUsd = rawRows.some((row) => row.currency === 'USD');
        let usdRateUsed = 0;
        let usdSource: string | null = null;
        let taxesAppliedPercent: number | null = null;

        if (hasUsd) {
            const rateInfo = await getUsdToArsCardRate();
            usdRateUsed = rateInfo.rateUsed;
            usdSource = rateInfo.source;
            taxesAppliedPercent = 'taxesAppliedPercent' in rateInfo ? (rateInfo.taxesAppliedPercent ?? null) : null;
        }

        const convertedRows: PreviewRow[] = rawRows.map((row) => {
            if (row.currency !== 'USD') return row;
            const rate = usdRateUsed || 0;
            const amountArs = rate > 0 ? Number((row.amount * rate).toFixed(2)) : row.amount;
            const suffix = rate > 0
                ? ` | USD ${row.originalAmount.toFixed(2)} convertido a ARS (TC ${rate.toFixed(2)}${taxesAppliedPercent ? `, imp. ${taxesAppliedPercent.toFixed(1)}%` : ''})`
                : ` | USD ${row.originalAmount.toFixed(2)} (sin conversion)`;

            return {
                ...row,
                amount: amountArs,
                description: `${row.description}${suffix}`,
            };
        });

        logInfo('transactions_preview_generated', {
            ...context,
            userId: session.user.id,
            count: convertedRows.length,
            usdRateUsed,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            rows: convertedRows,
            meta: {
                count: convertedRows.length,
                usdRateUsed,
                usdSource,
                taxesAppliedPercent,
            },
        });
    } catch (error) {
        logError('transactions_preview_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo generar el preview.' }, { status: 500 });
    }
}
