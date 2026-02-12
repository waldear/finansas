
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = await createClient();

    // Check key
    const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);

    // Check tables
    const { error: obligationsError } = await supabase.from('obligations').select('count', { count: 'exact', head: true });
    const { error: documentsError } = await supabase.from('documents').select('count', { count: 'exact', head: true });
    const { error: bucketsError } = await supabase.storage.getBucket('documents');

    return NextResponse.json({
        env: {
            GEMINI_API_KEY: hasGeminiKey
        },
        db: {
            obligations_table: !obligationsError,
            documents_table: !documentsError,
            storage_bucket: !bucketsError?.error
        },
        errors: {
            obligations: obligationsError,
            documents: documentsError,
            storage: bucketsError
        }
    });
}
