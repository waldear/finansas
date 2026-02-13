import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sanitizeEnv } from '@/lib/utils';
import { ALLOWED_DOCUMENT_MIME_TYPES, extractFinancialDocument } from '@/lib/document-processing';
import { createRequestContext, logError, logInfo, logWarn } from '@/lib/observability';

async function extractInline(file: File, apiKey: string) {
    const arrayBuffer = await file.arrayBuffer();
    return extractFinancialDocument({
        apiKey,
        mimeType: file.type,
        base64Data: Buffer.from(arrayBuffer).toString('base64'),
    });
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/documents/process', 'POST');
    const startedAt = Date.now();

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)) {
            return NextResponse.json({ error: 'Tipo de archivo no soportado' }, { status: 400 });
        }

        const apiKey = sanitizeEnv(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);
        if (!apiKey) {
            return NextResponse.json(
                { error: 'Falta GEMINI_API_KEY en el entorno de ejecución' },
                { status: 500 }
            );
        }

        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const safeOriginalName = file.name.replace(/[^\w.-]/g, '_');
        const filePath = `${user.id}/${Date.now()}-${safeOriginalName}`;

        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file, { contentType: file.type, upsert: false });

        if (uploadError) {
            logWarn('document_upload_failed_fallback_inline', {
                ...context,
                userId: user.id,
                reason: uploadError.message,
            });
            try {
                const extractionData = await extractInline(file, apiKey);
                return NextResponse.json({
                    success: true,
                    data: extractionData,
                    warning: `Se analizó el archivo sin Storage (${uploadError.message}).`,
                });
            } catch (inlineError) {
                const inlineMessage = inlineError instanceof Error ? inlineError.message : String(inlineError);
                logError('document_upload_and_inline_extraction_failed', inlineError, {
                    ...context,
                    userId: user.id,
                    uploadError: uploadError.message,
                });
                return NextResponse.json(
                    {
                        error: 'No se pudo procesar el documento.',
                        details: `Storage: ${uploadError.message} | IA: ${inlineMessage}`,
                        hint: 'Revisa bucket/policies de documents, GEMINI_API_KEY y GEMINI_MODEL (recomendado: gemini-2.5-flash).',
                    },
                    { status: 500 }
                );
            }
        }

        const { data: job, error: jobError } = await supabase
            .from('document_jobs')
            .insert({
                user_id: user.id,
                file_path: filePath,
                original_name: file.name,
                mime_type: file.type,
                status: 'queued',
            })
            .select('id, status, created_at')
            .single();

        if (jobError) {
            logWarn('document_job_create_failed_fallback_inline', {
                ...context,
                userId: user.id,
                reason: jobError.message,
            });
            try {
                const extractionData = await extractInline(file, apiKey);
                return NextResponse.json({
                    success: true,
                    data: extractionData,
                    warning: `Se analizó el archivo sin cola asíncrona (${jobError.message}).`,
                });
            } catch (inlineError) {
                const inlineMessage = inlineError instanceof Error ? inlineError.message : String(inlineError);
                logError('document_job_create_and_inline_extraction_failed', inlineError, {
                    ...context,
                    userId: user.id,
                    jobError: jobError.message,
                });
                return NextResponse.json(
                    {
                        error: 'No se pudo crear el job ni procesar en modo directo.',
                        details: `Job: ${jobError.message} | IA: ${inlineMessage}`,
                        hint: 'Revisa políticas de document_jobs y GEMINI_MODEL (recomendado: gemini-2.5-flash).',
                    },
                    { status: 500 }
                );
            }
        }

        logInfo('document_job_enqueued', {
            ...context,
            userId: user.id,
            jobId: job.id,
            mimeType: file.type,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            success: true,
            jobId: job.id,
            status: job.status,
            queuedAt: job.created_at,
        });
    } catch (error) {
        logError('document_process_enqueue_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
            {
                error: 'No pudimos encolar el documento.',
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
