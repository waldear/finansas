import { generateGeminiContentWithFallback } from './gemini';

const extractionSchema = `
{
  "total_amount": number,
  "currency": string (e.g., "ARS", "USD"),
  "due_date": string (YYYY-MM-DD),
  "minimum_payment": number (nullable),
  "period_label": string (nullable, e.g. "FEBRERO 2026"),
  "raw_text": string (nullable, plain OCR text),
  "items": [
    {
      "description": string,
      "amount": number,
      "date": string (YYYY-MM-DD)
    }
  ],
  "entries": [
    {
      "label": string,
      "amount": number,
      "currency": string ("ARS" | "USD"),
      "kind": string ("income" | "expense" | "saving" | "debt" | "summary" | "other"),
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
            currency: typeof entry?.currency === 'string' && entry.currency.trim()
                ? entry.currency.trim().toUpperCase()
                : 'ARS',
            kind: typeof entry?.kind === 'string' && entry.kind.trim()
                ? entry.kind.trim().toLowerCase()
                : 'other',
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
            date: normalizeDate(item?.date),
        }))
        .filter((item: any) => item.amount > 0);

    const derivedItems = normalizedEntries
        .filter((entry: any) => !['summary'].includes(entry.kind))
        .slice(0, 20)
        .map((entry: any) => ({
            description: entry.label,
            amount: entry.amount,
            date: entry.date || normalizeDate(undefined),
        }));

    return {
        total_amount: parseNumber(parsed?.total_amount, 0),
        currency: typeof parsed?.currency === 'string' && parsed.currency.trim()
            ? parsed.currency.trim().toUpperCase()
            : 'ARS',
        due_date: normalizeDate(parsed?.due_date),
        minimum_payment: parsed?.minimum_payment == null ? null : parseNumber(parsed.minimum_payment, 0),
        period_label: typeof parsed?.period_label === 'string' && parsed.period_label.trim()
            ? parsed.period_label.trim().slice(0, 80)
            : null,
        raw_text: typeof parsed?.raw_text === 'string' && parsed.raw_text.trim()
            ? parsed.raw_text.trim().slice(0, 4000)
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
      Analyze this document (image or PDF) and extract the key financial information.
      Return ONLY a valid JSON object matching this schema:
      ${extractionSchema}

      If a field is not found, use null.
      For "items", include up to 20 key movements.
      For "entries", if the document is a table/spreadsheet/budget snapshot, extract each meaningful row (income/expense/saving/debt/summary).
      Include "period_label" if available (for example, "FEBRERO 2026").
      Include "raw_text" with compact OCR text when possible.
      Ensure the currency is correct (default to ARS if not specified but looks like Argentine Peso).
      Date format must be YYYY-MM-DD.
    `;

    const { text, modelName } = await generateGeminiContentWithFallback({
        apiKey,
        generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
        },
        request: [
            prompt,
            {
                inlineData: {
                    data: base64Data,
                    mimeType,
                },
            },
        ],
    });

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

            const repaired = await generateGeminiContentWithFallback({
                apiKey,
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0,
                },
                request: repairPrompt,
            });

            return parseExtraction(repaired.text);
        } catch (repairError) {
            const repairMessage = repairError instanceof Error ? repairError.message : String(repairError);
            throw new Error(
                `No se pudo interpretar la respuesta del modelo (${modelName}): ${message} | Repair: ${repairMessage}`
            );
        }
    }
}
