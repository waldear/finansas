import { generateGeminiContentWithFallback } from './gemini';

const extractionSchema = `
{
  "total_amount": number,
  "currency": string (e.g., "ARS", "USD"),
  "due_date": string (YYYY-MM-DD),
  "minimum_payment": number (nullable),
  "items": [
    {
      "description": string,
      "amount": number,
      "date": string (YYYY-MM-DD)
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

    return {
        total_amount: parseNumber(parsed?.total_amount, 0),
        currency: typeof parsed?.currency === 'string' && parsed.currency.trim()
            ? parsed.currency.trim().toUpperCase()
            : 'ARS',
        due_date: normalizeDate(parsed?.due_date),
        minimum_payment: parsed?.minimum_payment == null ? null : parseNumber(parsed.minimum_payment, 0),
        items: rawItems
            .slice(0, 5)
            .map((item: any) => ({
                description: typeof item?.description === 'string' && item.description.trim()
                    ? item.description.trim()
                    : 'Movimiento detectado',
                amount: parseNumber(item?.amount, 0),
                date: normalizeDate(item?.date),
            }))
            .filter((item: any) => item.amount > 0),
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
      For "items", extract the 5 largest transactions if there are many.
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
        throw new Error(`No se pudo interpretar la respuesta del modelo (${modelName}): ${message}`);
    }
}
