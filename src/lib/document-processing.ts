import { generateGeminiContentWithFallback } from './gemini';

const extractionSchema = `
{
  "issuer": string (nullable, bank/emisor),
  "card_brand": string (nullable, e.g., "VISA", "MASTERCARD", "AMEX", "NARANJA"),
  "card_last4": string (nullable, last 4 digits only),
  "total_amount": number,
  "currency": string (e.g., "ARS", "USD"),
  "due_date": string (YYYY-MM-DD),
  "closing_date": string (YYYY-MM-DD, nullable),
  "minimum_payment": number (nullable),
  "totals_by_currency": {
    "ARS": number (nullable),
    "USD": number (nullable)
  },
  "interest_rates": {
    "tna": number (nullable, percent),
    "tea": number (nullable, percent),
    "cft": number (nullable, percent)
  },
  "available_credit_limit": number (nullable),
  "spending_by_category": [
    { "category": string, "amount": number, "currency": string ("ARS" | "USD") }
  ],
  "installments": [
    {
      "description": string,
      "merchant": string (nullable),
      "total_installments": number (nullable),
      "remaining_installments": number (nullable),
      "installment_amount": number (nullable),
      "currency": string ("ARS" | "USD"),
      "next_due_date": string (YYYY-MM-DD, nullable)
    }
  ],
  "fees": [
    {
      "description": string,
      "amount": number,
      "currency": string ("ARS" | "USD"),
      "kind": string ("insurance" | "maintenance" | "commission" | "interest" | "tax" | "other")
    }
  ],
  "alerts": [
    { "kind": string, "description": string, "amount": number (nullable), "currency": string (nullable) }
  ],
  "installment_projection": [
    { "month": string (YYYY-MM), "amount_ars": number, "amount_usd": number }
  ],
  "period_label": string (nullable, e.g. "FEBRERO 2026"),
  "raw_text": string (nullable, redacted OCR text),
  "items": [
    {
      "description": string,
      "amount": number,
      "currency": string ("ARS" | "USD", nullable),
      "date": string (YYYY-MM-DD),
      "category": string (nullable)
    }
  ],
  "entries": [
    {
      "label": string,
      "amount": number,
      "currency": string ("ARS" | "USD"),
      "kind": string ("income" | "expense" | "saving" | "debt" | "summary" | "other"),
      "category": string (nullable),
      "date": string (YYYY-MM-DD, nullable)
    }
  ],
  "type": string ("credit_card", "invoice", "bank_statement", "other"),
  "merchant": string (nullable)
}
`;

export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

export const VALID_DOCUMENT_TYPES = new Set(['credit_card', 'invoice', 'bank_statement', 'other']);

function parseNumber(value: unknown, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return fallback;

    const stripped = value.replace(/[^\d,.-]/g, '');
    const hasComma = stripped.includes(',');
    const hasDot = stripped.includes('.');
    let normalized = stripped;

    if (hasComma && hasDot) {
        if (stripped.lastIndexOf(',') > stripped.lastIndexOf('.')) {
            normalized = stripped.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = stripped.replace(/,/g, '');
        }
    } else if (hasComma) {
        normalized = stripped.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value: unknown) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
        }
    }

    return new Date().toISOString().split('T')[0];
}

function normalizeOptionalDate(value: unknown) {
    if (value == null) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
        }
    }
    return null;
}

function normalizeCurrency(value: unknown, fallback = 'ARS') {
    if (typeof value === 'string' && value.trim()) {
        return value.trim().toUpperCase().slice(0, 6);
    }
    return fallback;
}

function normalizeCurrencyArsUsd(value: unknown, fallback: 'ARS' | 'USD' = 'ARS') {
    const raw = normalizeCurrency(value, fallback);
    if (!raw) return fallback;
    if (raw.includes('USD') || raw.includes('US$') || raw.includes('U$S')) return 'USD';
    if (raw.includes('ARS')) return 'ARS';
    return (raw === 'U$S' || raw === 'US$') ? 'USD' : fallback;
}

function normalizeCardBrand(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const raw = value.trim();
    const normalized = raw.toUpperCase();
    if (normalized.includes('MASTERCARD')) return 'MASTERCARD';
    if (normalized.includes('MASTER')) return 'MASTERCARD';
    if (normalized.includes('VISA')) return 'VISA';
    if (normalized.includes('AMEX') || normalized.includes('AMERICAN')) return 'AMEX';
    if (normalized.includes('NARANJA')) return 'NARANJA';
    return normalized.slice(0, 30);
}

function normalizeIssuer(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    return value.trim().slice(0, 80);
}

function redactSensitiveText(value: string) {
    let text = value;

    // Redact emails
    text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted_email]');

    // Redact long digit sequences (e.g., card numbers, CBU/CVU) keeping last 4
    text = text.replace(/(?:\d[ -]?){13,30}/g, (match) => {
        const digits = match.replace(/[^\d]/g, '');
        if (digits.length < 13) return match;
        const last4 = digits.slice(-4);
        return `****${last4}`;
    });

    return text;
}

function isoMonthKey(dateValue: string) {
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue.slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
}

function addMonths(dateValue: string, monthsToAdd: number) {
    const base = new Date(`${dateValue}T00:00:00.000Z`);
    if (Number.isNaN(base.getTime())) return new Date().toISOString().split('T')[0];

    const day = base.getUTCDate();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + monthsToAdd);
    const monthLastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(day, monthLastDay));
    return base.toISOString().split('T')[0];
}

function monthDiff(fromIso: string, toIso: string) {
    const from = new Date(`${fromIso}T00:00:00.000Z`);
    const to = new Date(`${toIso}T00:00:00.000Z`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
    return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

function parseExtraction(rawText: string) {
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonCandidate = cleaned.match(/\{[\s\S]*\}/)?.[0];

    if (!jsonCandidate) {
        throw new Error('La respuesta de IA no contiene JSON válido.');
    }

    let parsed: any;
    try {
        parsed = JSON.parse(jsonCandidate);
    } catch {
        throw new Error('No se pudo interpretar el JSON devuelto por la IA.');
    }

    const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
    const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : [];

    const normalizedEntries = rawEntries
        .slice(0, 120)
        .map((entry: any) => ({
            label: typeof entry?.label === 'string' && entry.label.trim()
                ? entry.label.trim()
                : 'Concepto detectado',
            amount: parseNumber(entry?.amount, 0),
            currency: normalizeCurrencyArsUsd(entry?.currency, 'ARS'),
            kind: typeof entry?.kind === 'string' && entry.kind.trim()
                ? entry.kind.trim().toLowerCase()
                : 'other',
            category: typeof entry?.category === 'string' && entry.category.trim()
                ? entry.category.trim().slice(0, 40)
                : null,
            date: entry?.date ? normalizeDate(entry.date) : null,
        }))
        .filter((entry: any) => entry.amount > 0);

    const normalizedItems = rawItems
        .slice(0, 20)
        .map((item: any) => ({
            description: typeof item?.description === 'string' && item.description.trim()
                ? item.description.trim()
                : 'Movimiento detectado',
            amount: parseNumber(item?.amount, 0),
            currency: item?.currency == null ? null : normalizeCurrencyArsUsd(item.currency, 'ARS'),
            date: normalizeDate(item?.date),
            category: typeof item?.category === 'string' && item.category.trim()
                ? item.category.trim().slice(0, 40)
                : null,
        }))
        .filter((item: any) => item.amount > 0);

    const derivedItems = normalizedEntries
        .filter((entry: any) => !['summary'].includes(entry.kind))
        .slice(0, 20)
        .map((entry: any) => ({
            description: entry.label,
            amount: entry.amount,
            currency: entry.currency || null,
            date: entry.date || normalizeDate(undefined),
            category: entry.category || null,
        }));

    const totalsByCurrencyRaw = parsed?.totals_by_currency;
    const totals_by_currency = {
        ARS: null as number | null,
        USD: null as number | null,
    };

    if (totalsByCurrencyRaw && typeof totalsByCurrencyRaw === 'object' && !Array.isArray(totalsByCurrencyRaw)) {
        const arsValue = (totalsByCurrencyRaw as any).ARS ?? (totalsByCurrencyRaw as any).ars;
        const usdValue = (totalsByCurrencyRaw as any).USD ?? (totalsByCurrencyRaw as any).usd;
        const arsAmount = arsValue == null ? null : parseNumber(arsValue, 0);
        const usdAmount = usdValue == null ? null : parseNumber(usdValue, 0);
        totals_by_currency.ARS = arsAmount != null && arsAmount > 0 ? arsAmount : null;
        totals_by_currency.USD = usdAmount != null && usdAmount > 0 ? usdAmount : null;
    } else if (Array.isArray(totalsByCurrencyRaw)) {
        for (const item of totalsByCurrencyRaw.slice(0, 10)) {
            const currency = normalizeCurrencyArsUsd(item?.currency, 'ARS');
            const amount = parseNumber(item?.amount, 0);
            if (!currency || amount <= 0) continue;
            if (currency === 'ARS') totals_by_currency.ARS = amount;
            if (currency === 'USD') totals_by_currency.USD = amount;
        }
    }

    const interestRaw = parsed?.interest_rates;
    const interest_rates = {
        tna: null as number | null,
        tea: null as number | null,
        cft: null as number | null,
    };
    if (interestRaw && typeof interestRaw === 'object' && !Array.isArray(interestRaw)) {
        const tnaValue = (interestRaw as any).tna;
        const teaValue = (interestRaw as any).tea;
        const cftValue = (interestRaw as any).cft ?? (interestRaw as any).cftna ?? (interestRaw as any).cft_tea;
        const tna = tnaValue == null ? null : parseNumber(tnaValue, 0);
        const tea = teaValue == null ? null : parseNumber(teaValue, 0);
        const cft = cftValue == null ? null : parseNumber(cftValue, 0);
        interest_rates.tna = tna && tna > 0 ? tna : null;
        interest_rates.tea = tea && tea > 0 ? tea : null;
        interest_rates.cft = cft && cft > 0 ? cft : null;
    }

    const rawSpending = Array.isArray(parsed?.spending_by_category) ? parsed.spending_by_category : [];
    const spending_by_category = rawSpending
        .slice(0, 30)
        .map((row: any) => ({
            category: typeof row?.category === 'string' && row.category.trim() ? row.category.trim().slice(0, 40) : 'Otros',
            amount: parseNumber(row?.amount, 0),
            currency: normalizeCurrencyArsUsd(row?.currency, 'ARS'),
        }))
        .filter((row: any) => row.amount > 0);

    const rawInstallments = Array.isArray(parsed?.installments) ? parsed.installments : [];
    const installments = rawInstallments
        .slice(0, 60)
        .map((row: any) => ({
            description: typeof row?.description === 'string' && row.description.trim()
                ? row.description.trim().slice(0, 120)
                : 'Cuota detectada',
            merchant: typeof row?.merchant === 'string' && row.merchant.trim() ? row.merchant.trim().slice(0, 80) : null,
            total_installments: row?.total_installments == null ? null : Math.max(1, Math.trunc(parseNumber(row.total_installments, 0))),
            remaining_installments: row?.remaining_installments == null ? null : Math.max(0, Math.trunc(parseNumber(row.remaining_installments, 0))),
            installment_amount: row?.installment_amount == null ? null : parseNumber(row.installment_amount, 0),
            currency: normalizeCurrencyArsUsd(row?.currency, 'ARS'),
            next_due_date: normalizeOptionalDate(row?.next_due_date),
        }))
        .filter((row: any) => (row.installment_amount || 0) > 0);

    const rawFees = Array.isArray(parsed?.fees) ? parsed.fees : [];
    const fees = rawFees
        .slice(0, 40)
        .map((row: any) => ({
            description: typeof row?.description === 'string' && row.description.trim()
                ? row.description.trim().slice(0, 140)
                : 'Cargo detectado',
            amount: parseNumber(row?.amount, 0),
            currency: normalizeCurrencyArsUsd(row?.currency, 'ARS'),
            kind: typeof row?.kind === 'string' && row.kind.trim()
                ? row.kind.trim().toLowerCase()
                : 'other',
        }))
        .filter((row: any) => row.amount > 0);

    const rawAlerts = Array.isArray(parsed?.alerts) ? parsed.alerts : [];
    const alerts = rawAlerts
        .slice(0, 40)
        .map((row: any) => ({
            kind: typeof row?.kind === 'string' && row.kind.trim() ? row.kind.trim().slice(0, 30) : 'alert',
            description: typeof row?.description === 'string' && row.description.trim() ? row.description.trim().slice(0, 160) : 'Alerta detectada',
            amount: row?.amount == null ? null : parseNumber(row.amount, 0),
            currency: row?.currency == null ? null : normalizeCurrency(row.currency, 'ARS'),
        }));

    // Derive basic alerts for common card statement charges when missing.
    const derivedAlerts: Array<{ kind: string; description: string; amount: number | null; currency: string | null }> = [];
    const suspiciousMatchers = [
        { kind: 'insurance', re: /\b(seguro|seg\.|insurance)\b/i },
        { kind: 'maintenance', re: /\b(mantenimiento|manten\.|membres[ií]a)\b/i },
        { kind: 'commission', re: /\b(comisi[oó]n|comision|cargo admin|administraci[oó]n)\b/i },
        { kind: 'interest', re: /\b(inter[eé]s|financ|refinanciaci[oó]n)\b/i },
        { kind: 'tax', re: /\b(iva|impuesto|percepci[oó]n|retenci[oó]n)\b/i },
    ];

    for (const fee of fees.slice(0, 20)) {
        const match = suspiciousMatchers.find((item) => item.re.test(fee.description));
        if (!match) continue;
        derivedAlerts.push({
            kind: match.kind,
            description: fee.description,
            amount: fee.amount,
            currency: fee.currency,
        });
    }

    const mergedAlerts = [...alerts, ...derivedAlerts].slice(0, 60);

    const due_date = normalizeDate(parsed?.due_date);
    const projectionSeed = due_date;
    const months = Array.from({ length: 6 }).map((_, idx) => {
        const dateValue = addMonths(projectionSeed, idx);
        return {
            month: isoMonthKey(dateValue),
            amount_ars: 0,
            amount_usd: 0,
        };
    });

    for (const plan of installments.slice(0, 60)) {
        const remaining = plan.remaining_installments ?? plan.total_installments ?? 0;
        const perAmount = Number(plan.installment_amount || 0);
        if (!remaining || remaining <= 0 || perAmount <= 0) continue;

        const startDate = plan.next_due_date || due_date;
        const offset = Math.max(0, monthDiff(due_date, startDate));
        const maxMonths = months.length - offset;
        const effectiveCount = Math.min(remaining, Math.max(0, maxMonths));
        if (effectiveCount <= 0) continue;

        for (let idx = 0; idx < effectiveCount; idx++) {
            const target = months[offset + idx];
            if (!target) continue;
            if (plan.currency === 'USD') {
                target.amount_usd += perAmount;
            } else {
                target.amount_ars += perAmount;
            }
        }
    }

    const installment_projection = months.map((row) => ({
        month: row.month,
        amount_ars: Number(row.amount_ars.toFixed(2)),
        amount_usd: Number(row.amount_usd.toFixed(2)),
    }));

    const issuer = normalizeIssuer(parsed?.issuer);
    const card_brand = normalizeCardBrand(parsed?.card_brand);
    const card_last4 = typeof parsed?.card_last4 === 'string' && parsed.card_last4.trim()
        ? parsed.card_last4.trim().replace(/[^\d]/g, '').slice(-4) || null
        : null;

    const available_credit_limit = parsed?.available_credit_limit == null
        ? null
        : parseNumber(parsed.available_credit_limit, 0) > 0
            ? parseNumber(parsed.available_credit_limit, 0)
            : null;

    const closing_date = normalizeOptionalDate(parsed?.closing_date);

    // Keep backward-compat fields stable while exposing multi-currency totals.
    const fallbackCurrency = normalizeCurrencyArsUsd(parsed?.currency, 'ARS');
    const fallbackTotal = parseNumber(parsed?.total_amount, 0);

    let currency = fallbackCurrency;
    let total_amount = fallbackTotal;
    if (totals_by_currency.ARS && totals_by_currency.ARS > 0) {
        currency = 'ARS';
        total_amount = totals_by_currency.ARS;
    } else if (totals_by_currency.USD && totals_by_currency.USD > 0) {
        currency = 'USD';
        total_amount = totals_by_currency.USD;
    }

    return {
        issuer,
        card_brand,
        card_last4,
        closing_date,
        total_amount,
        currency,
        totals_by_currency,
        interest_rates,
        available_credit_limit,
        spending_by_category,
        installments,
        fees,
        alerts: mergedAlerts,
        installment_projection,
        due_date,
        minimum_payment: parsed?.minimum_payment == null ? null : parseNumber(parsed.minimum_payment, 0),
        period_label: typeof parsed?.period_label === 'string' && parsed.period_label.trim()
            ? parsed.period_label.trim().slice(0, 80)
            : null,
        raw_text: typeof parsed?.raw_text === 'string' && parsed.raw_text.trim()
            ? redactSensitiveText(parsed.raw_text.trim()).slice(0, 4000)
            : null,
        items: normalizedItems.length > 0 ? normalizedItems : derivedItems,
        entries: normalizedEntries,
        type: VALID_DOCUMENT_TYPES.has(parsed?.type) ? parsed.type : 'other',
        merchant: typeof parsed?.merchant === 'string' && parsed.merchant.trim() ? parsed.merchant.trim() : null,
    };
}

export async function extractFinancialDocument(params: {
    apiKey: string;
    mimeType: string;
    base64Data: string;
}) {
    const { apiKey, mimeType, base64Data } = params;

    const prompt = `
      You are a financial data extraction expert.
      Analyze this document (image or PDF) and extract key information.
      Return ONLY a valid JSON object matching this schema (no markdown, no commentary):
      ${extractionSchema}

      Privacy & safety rules (very important):
      - NEVER output full card numbers, CBU/CVU, DNI, addresses, or full names. If present, only include last 4 digits in "card_last4".
      - "raw_text" must be REDACTED and compact, or null.

      General rules:
      - If a field is not found, use null.
      - For "items", include up to 20 key movements with dates when possible.
      - For "entries", if the document is a table/spreadsheet/budget snapshot, extract each meaningful row (income/expense/saving/debt/summary).
      - For credit card statements ("type": "credit_card"), try to fill: issuer, card_brand, totals_by_currency (ARS/USD), minimum_payment, interest_rates (TNA/TEA/CFT), available_credit_limit, fees, installments, spending_by_category.
      - Categorize spending in Spanish (e.g., "Suscripciones", "Salud", "Supermercado", "Tecnología", "Servicios", "Transporte", "Comida", "Entretenimiento", "Otros").
      - Ensure currency is correct (default to ARS if not specified but looks like Argentine Peso).
      - Date format must be YYYY-MM-DD.
    `;

    const requestPayload = [
        prompt,
        {
            inlineData: {
                data: base64Data,
                mimeType,
            },
        },
    ];

    // Some Gemini models/environments can fail with responseMimeType. Try strict JSON first, then fall back.
    const primaryConfig = { responseMimeType: 'application/json', temperature: 0.1 };
    const fallbackConfig = { temperature: 0.1 };

    let text = '';
    let modelName = '';
    try {
        const primary = await generateGeminiContentWithFallback({
            apiKey,
            generationConfig: primaryConfig,
            request: requestPayload,
        });
        text = primary.text;
        modelName = primary.modelName;
    } catch {
        const secondary = await generateGeminiContentWithFallback({
            apiKey,
            generationConfig: fallbackConfig,
            request: requestPayload,
        });
        text = secondary.text;
        modelName = secondary.modelName;
    }

    try {
        return parseExtraction(text);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // One repair attempt: ask Gemini to output a strict JSON object matching the schema.
        try {
            const repairPrompt = `
You are a strict JSON fixer.
Convert the following content into a VALID JSON object that matches this schema exactly:
${extractionSchema}
Return ONLY the JSON object. No markdown, no code fences, no commentary.
CONTENT:
${String(text || '').slice(0, 20000)}
`;

            let repairedText = '';
            try {
                const repaired = await generateGeminiContentWithFallback({
                    apiKey,
                    generationConfig: {
                        responseMimeType: 'application/json',
                        temperature: 0,
                    },
                    request: repairPrompt,
                });
                repairedText = repaired.text;
            } catch {
                const repaired = await generateGeminiContentWithFallback({
                    apiKey,
                    generationConfig: { temperature: 0 },
                    request: repairPrompt,
                });
                repairedText = repaired.text;
            }

            return parseExtraction(repairedText);
        } catch (repairError) {
            const repairMessage = repairError instanceof Error ? repairError.message : String(repairError);
            throw new Error(
                `No se pudo interpretar la respuesta del modelo (${modelName}): ${message} | Repair: ${repairMessage}`
            );
        }
    }
}
