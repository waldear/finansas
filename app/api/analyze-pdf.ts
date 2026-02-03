
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

// Disable body parsing to handle multipart/form-data manually if needed, 
// OR assume client sends base64 JSON if file is small enough.
// For simplicity and reliability with text-only PDFs, we'll accept base64 in JSON body 
// to avoid complex multipart parsing logic without extra libs like 'busboy' or 'formidable'.
// Client will convert File -> Base64 -> POST JSON.

export default async function handler(
    request: VercelRequest,
    response: VercelResponse
) {
    if (request.method !== 'POST') {
        return response.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { fileData } = request.body; // Expecting base64 string

        if (!fileData) {
            return response.status(400).json({ error: 'No file data provided' });
        }

        // Convert base64 to Buffer
        const dataBuffer = Buffer.from(fileData, 'base64');

        // Parse PDF
        const data = await pdf(dataBuffer);

        // Return extracted text
        return response.status(200).json({
            text: data.text,
            info: data.info,
            numpages: data.numpages
        });

    } catch (error: any) {
        console.error('Error parsing PDF:', error);
        return response.status(500).json({
            error: 'Error parsing PDF',
            details: error.message
        });
    }
}
