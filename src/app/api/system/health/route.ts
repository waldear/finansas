
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const supabase = await createClient();

        // Check key
        const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);

        // Check tables - using HEAD request to check existence
        const obligations = await supabase.from('obligations').select('*', { count: 'exact', head: true }).limit(1);
        const documents = await supabase.from('documents').select('*', { count: 'exact', head: true }).limit(1);
        const bucket = await supabase.storage.getBucket('documents');

        return NextResponse.json({
            env: {
                GEMINI_API_KEY: hasGeminiKey
            },
            db: {
                obligations_table: !obligations.error,
                documents_table: !documents.error,
                storage_bucket: !bucket.error
            },
            debug: {
                obligations_error: obligations.error?.message || null,
                documents_error: documents.error?.message || null,
                storage_error: bucket.error?.message || null,
                url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 15) + "..."
            }
        });
    } catch (err: any) {
        return NextResponse.json({
            error: "Health check failed",
            message: err.message
        }, { status: 500 });
    }
}
