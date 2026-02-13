
import { createClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

export async function GET() {
    const context = createRequestContext('/api/system/health', 'GET');
    const startedAt = Date.now();
    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        // Check key
        const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);
        const hasSentry = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

        // Check tables - using HEAD request to check existence
        const obligations = await supabase.from('obligations').select('*', { count: 'exact', head: true }).limit(1);
        const documents = await supabase.from('documents').select('*', { count: 'exact', head: true }).limit(1);
        const jobs = await supabase.from('document_jobs').select('*', { count: 'exact', head: true }).limit(1);
        const budgets = await supabase.from('budgets').select('*', { count: 'exact', head: true }).limit(1);
        const recurring = await supabase.from('recurring_transactions').select('*', { count: 'exact', head: true }).limit(1);
        const audit = await supabase.from('audit_events').select('*', { count: 'exact', head: true }).limit(1);
        const bucketProbe = await supabase.storage
            .from('documents')
            .list('', { limit: 1 });

        logInfo('system_health_checked', {
            ...context,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            env: {
                GEMINI_API_KEY: hasGeminiKey,
                SENTRY_DSN: hasSentry,
            },
            db: {
                obligations_table: !obligations.error,
                documents_table: !documents.error,
                document_jobs_table: !jobs.error,
                budgets_table: !budgets.error,
                recurring_table: !recurring.error,
                audit_table: !audit.error,
                storage_bucket: !bucketProbe.error,
            },
            debug: {
                obligations_error: obligations.error?.message || null,
                documents_error: documents.error?.message || null,
                document_jobs_error: jobs.error?.message || null,
                budgets_error: budgets.error?.message || null,
                recurring_error: recurring.error?.message || null,
                audit_error: audit.error?.message || null,
                storage_error: bucketProbe.error?.message || null,
                url: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 15) + "..."
            }
        });
    } catch (err: any) {
        logError('system_health_exception', err, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({
            error: "Health check failed",
            message: err.message
        }, { status: 500 });
    }
}
