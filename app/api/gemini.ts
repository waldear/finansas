
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt } = request.body;

        if (!prompt) {
            return response.status(400).json({ error: 'Prompt is required' });
        }

        const apiKey = (process.env.GEMINI_API_KEY || '').trim();

        if (!apiKey) {
            console.error('Missing GEMINI_API_KEY');
            return response.status(500).json({ error: 'Server configuration error' });
        }

        // Use direct REST API to avoid SDK issues in Vercel environment
        // Using "gemini-2.5-flash" (2026 stable model)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const apiResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            console.error('Gemini API Error:', errorData);

            // Forward 429 errors directly to client so frontend can handle retries or show specific messages
            if (apiResponse.status === 429) {
                return response.status(429).json({
                    error: 'Rate limit exceeded',
                    details: errorData,
                    retryAfter: 3 // Default fallback
                });
            }

            throw new Error(`Google API Error: ${apiResponse.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await apiResponse.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return response.status(200).json({ text });

    } catch (error: any) {
        console.error('Error in Gemini API:', error);

        // Handle custom threw errors (like the 429 re-throw if needed, though we return early above)
        // Check if error message contains 429 just in case
        if (error.message && error.message.includes('429')) {
            return response.status(429).json({
                error: 'Rate limit exceeded',
                details: error.message
            });
        }

        return response.status(500).json({
            error: 'Error processing request',
            details: error.message
        });
    }
}
