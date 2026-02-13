import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const context = createRequestContext('/api/documents/jobs/[id]', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: job, error } = await supabase
            .from('document_jobs')
            .select('id, status, attempts, error_message, extraction_json, document_id, created_at, updated_at')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (error || !job) {
            return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });
        }

        let extractionId: string | null = null;
        if (job.document_id) {
            const { data: extraction } = await supabase
                .from('extractions')
                .select('id')
                .eq('document_id', job.document_id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            extractionId = extraction?.id || null;
        }

        logInfo('document_job_status_checked', {
            ...context,
            userId: user.id,
            jobId: id,
            status: job.status,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            id: job.id,
            status: job.status,
            attempts: job.attempts,
            error: job.error_message,
            data: job.extraction_json,
            documentId: job.document_id,
            extractionId,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
        });
    } catch (error) {
        logError('document_job_status_exception', error, {
            ...context,
            jobId: id,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error consultando el job' }, { status: 500 });
    }
}
