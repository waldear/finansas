import { GoogleGenerativeAI } from '@google/generative-ai';
import { sanitizeEnv } from './utils';

const DEFAULT_MODEL_CANDIDATES = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-2.5-flash-lite',
];

type GenerateWithFallbackParams = {
    apiKey: string;
    request: string | Array<unknown>;
    generationConfig?: {
        temperature?: number;
        responseMimeType?: string;
    };
};

export function getGeminiModelCandidates() {
    const preferredModel = sanitizeEnv(process.env.GEMINI_MODEL);
    return Array.from(
        new Set(([preferredModel, ...DEFAULT_MODEL_CANDIDATES].filter(Boolean) as string[]))
    );
}

export async function generateGeminiContentWithFallback(params: GenerateWithFallbackParams) {
    const { apiKey, request, generationConfig } = params;
    const genAI = new GoogleGenerativeAI(apiKey);
    const candidates = getGeminiModelCandidates();
    const failures: string[] = [];

    for (const modelName of candidates) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig,
            });
            const result = await model.generateContent(request as any);
            const response = await result.response;
            return {
                modelName,
                text: response.text(),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failures.push(`${modelName}: ${message}`);
        }
    }

    throw new Error(
        `No se pudo generar contenido con Gemini. ${failures.join(' | ')}`
    );
}
