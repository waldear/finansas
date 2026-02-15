import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-server';
import { sanitizeEnv } from '@/lib/utils';
import { extractFinancialDocument, VALID_DOCUMENT_TYPES } from '@/lib/document-processing';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

function isRlsViolation(message: string) {
    return /row-level security|row level security/i.test(message);
}

function createSupabaseServiceRoleClient() {
    const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!url || !key) return null;

    return createServiceClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}

async function addNextAttempt(supabase: any, jobId: string, userId: string, attempts: number) {
    await supabase
        .from('document_jobs')
        .update({
            status: 'processing',
            attempts: attempts + 1,
            error_message: null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('user_id', userId);
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const context = createRequestContext('/api/documents/jobs/[id]/run', 'POST');
    const startedAt = Date.now();
    let supabase: any = null;
    let userId: string | null = null;

    try {
        const apiKey = sanitizeEnv(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);
        if (!apiKey) {
            return NextResponse.json({ error: 'Falta GEMINI_API_KEY en el entorno' }, { status: 500 });
        }

        supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        userId = user.id;

        const { data: job, error: jobError } = await supabase
            .from('document_jobs')
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single();

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });
        }

        if (job.status === 'completed') {
            return NextResponse.json({
                id: job.id,
                status: 'completed',
                data: job.extraction_json,
                documentId: job.document_id,
            });
        }

        if (job.status === 'processing') {
            return NextResponse.json({
                id: job.id,
                status: 'processing',
                attempts: job.attempts,
            });
        }

        await addNextAttempt(supabase, job.id, user.id, job.attempts || 0);

        const { data: fileData, error: downloadError } = await supabase.storage
            .from('documents')
            .download(job.file_path);

        if (downloadError || !fileData) {
            await supabase
                .from('document_jobs')
                .update({
                    status: 'failed',
                    error_message: downloadError?.message || 'No se pudo descargar el archivo',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id)
                .eq('user_id', user.id);

            return NextResponse.json(
                { error: 'No se pudo descargar el documento del storage.' },
                { status: 500 }
            );
        }

        const arrayBuffer = await fileData.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');

        let extractionData: any;
        try {
            extractionData = await extractFinancialDocument({
                apiKey,
                mimeType: job.mime_type,
                base64Data,
            });
        } catch (extractionError) {
            const message = extractionError instanceof Error ? extractionError.message : String(extractionError);

            await supabase
                .from('document_jobs')
                .update({
                    status: 'failed',
                    error_message: message.slice(0, 800),
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id)
                .eq('user_id', user.id);

            return NextResponse.json(
                {
                    error: 'El análisis del documento falló.',
                    details: message,
                    hint: 'Prueba con una imagen más nítida o un PDF más liviano (menos páginas).',
                },
                { status: 500 }
            );
        }

        const documentType = VALID_DOCUMENT_TYPES.has(extractionData.type) ? extractionData.type : 'other';
        const spaceId = job.space_id || user.id;
        const { data: docData, error: docError } = await supabase
            .from('documents')
            .insert({
                user_id: user.id,
                space_id: spaceId,
                url: `documents://${job.file_path}`,
                type: documentType,
                status: 'processed',
            })
            .select()
            .single();

        if (docError) {
            await supabase
                .from('document_jobs')
                .update({
                    status: 'failed',
                    error_message: docError.message,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', job.id)
                .eq('user_id', user.id);

            return NextResponse.json(
                {
                    error: 'No se pudo guardar el documento en la base.',
                    details: docError.message,
                },
                { status: 500 }
            );
        }

        let extractionId: string | null = null;
        let warning: string | null = null;

        const { data: extractionRecord, error: extractionError } = await supabase
            .from('extractions')
            .insert({
                document_id: docData.id,
                raw_json: extractionData,
                confidence_score: 1.0,
                manual_verification_needed: false,
            })
            .select('id')
            .single();

        if (extractionError) {
            const message = extractionError.message || 'No se pudo guardar la extracción.';

            // If the user DB setup is missing INSERT policy on extractions, don't block the whole flow.
            if (isRlsViolation(message)) {
                const serviceRoleClient = createSupabaseServiceRoleClient();

                if (serviceRoleClient) {
                    const { data: serviceExtraction, error: serviceExtractionError } = await serviceRoleClient
                        .from('extractions')
                        .insert({
                            document_id: docData.id,
                            raw_json: extractionData,
                            confidence_score: 1.0,
                            manual_verification_needed: false,
                        })
                        .select('id')
                        .single();

                    if (!serviceExtractionError && serviceExtraction?.id) {
                        extractionId = serviceExtraction.id;
                    }
                }

                if (!extractionId) {
                    warning =
                        'Analizamos el documento, pero no pudimos guardar la extracción en la base por una policy de seguridad (RLS) en la tabla `extractions`. ' +
                        'Solución: ejecuta el patch de RLS (ver `supabase-advanced.sql`) o agrega una policy INSERT para `extractions`.';
                }
            } else {
                await supabase
                    .from('document_jobs')
                    .update({
                        status: 'failed',
                        error_message: message.slice(0, 800),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', job.id)
                    .eq('user_id', user.id);

                return NextResponse.json(
                    {
                        error: 'No se pudo guardar la extracción en la base.',
                        details: message,
                    },
                    { status: 500 }
                );
            }
        } else {
            extractionId = extractionRecord?.id || null;
        }

        await supabase
            .from('document_jobs')
            .update({
                status: 'completed',
                extraction_json: extractionData,
                document_id: docData.id,
                error_message: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
            .eq('user_id', user.id);

        await recordAuditEvent({
            supabase,
            userId: user.id,
            spaceId,
            entityType: 'document_job',
            entityId: job.id,
            action: 'system',
            beforeData: null,
            afterData: {
                documentId: docData.id,
                extractionId,
                status: 'completed',
            },
            metadata: {
                originalName: job.original_name,
            },
        });

        logInfo('document_job_processed', {
            ...context,
            userId: user.id,
            jobId: job.id,
            documentId: docData.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            id: job.id,
            status: 'completed',
            data: extractionData,
            documentId: docData.id,
            extractionId,
            warning,
        });
    } catch (error) {
        // Ensure jobs don't get stuck in processing forever.
        try {
            const message = error instanceof Error ? error.message : String(error);
            if (supabase && userId) {
                await supabase
                    .from('document_jobs')
                    .update({
                        status: 'failed',
                        error_message: message.slice(0, 800),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', id)
                    .eq('user_id', userId);
            }
        } catch {
            // no-op
        }
        logError('document_job_run_exception', error, {
            ...context,
            jobId: id,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
            {
                error: 'No pudimos procesar el documento.',
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}
