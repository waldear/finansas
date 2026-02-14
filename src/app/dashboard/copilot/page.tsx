
'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FinFlowLogo } from '@/components/ui/finflow-logo';
import { ReceiptUploader } from '@/components/copilot/receipt-uploader';
import { ExtractionVerifier } from '@/components/copilot/extraction-verifier';
import { SetupCheck } from '@/components/copilot/setup-check';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Brain } from 'lucide-react';
import { toast } from 'sonner';
import { useAssistantAttachment } from '@/components/providers/assistant-attachment-provider';

type CopilotStep = 'upload' | 'verify' | 'success';

function toSafeNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function CopilotPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { consumePendingFile, setPendingDocumentContext } = useAssistantAttachment();
    const [isReady, setIsReady] = useState(false);
    const [step, setStep] = useState<CopilotStep>('upload');
    const [extractedData, setExtractedData] = useState<any>(null);
    const [prefillFile, setPrefillFile] = useState<File | null>(null);

    useEffect(() => {
        const file = consumePendingFile();
        if (file) {
            setPrefillFile(file);
        }
    }, [consumePendingFile]);

    const handleExtractionComplete = (data: any) => {
        setExtractedData(data);
        setStep('verify');
    };

    const handleAnalyzeWithAssistant = () => {
        if (!extractedData) {
            toast.info('Primero procesá un documento.');
            return;
        }

        const sourceNameCandidate = typeof extractedData?._sourceName === 'string' ? extractedData._sourceName.trim() : '';
        const merchantCandidate = typeof extractedData?.merchant === 'string' ? extractedData.merchant.trim() : '';
        const sourceName = sourceNameCandidate || merchantCandidate || 'Documento';
        const mimeType = typeof extractedData?._sourceMimeType === 'string' && extractedData._sourceMimeType.trim()
            ? extractedData._sourceMimeType.trim()
            : 'application/octet-stream';
        const sizeBytes = Number(extractedData?._sourceSizeBytes || 0);

        setPendingDocumentContext({
            sourceName,
            mimeType,
            sizeBytes,
            extraction: extractedData,
        });

        router.push('/dashboard/assistant');
    };

    const handleVerificationConfirm = async (formData: any) => {
        try {
            const isDebtLikeDocument = extractedData?.type === 'credit_card' || extractedData?.type === 'invoice';
            const confirmationResponse = await fetch('/api/copilot/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    title: formData.title,
                    amount: toSafeNumber(formData.amount),
                    due_date: formData.due_date,
                    category: formData.category || 'Varios',
                    minimum_payment: formData.minimum_payment || null,
                    document_type: extractedData?.type || 'other',
                    document_id: extractedData?._documentId || null,
                    extraction_id: extractedData?._extractionId || null,
                    create_debt: isDebtLikeDocument,
                    mark_paid: Boolean(formData.mark_paid),
                    payment_date: formData.mark_paid ? formData.payment_date : null,
                }),
            });

            const confirmationBody = await confirmationResponse.json().catch(() => null);
            if (!confirmationResponse.ok) {
                throw new Error(confirmationBody?.error || 'No se pudo guardar la confirmación del documento');
            }

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['obligations'] }),
                queryClient.invalidateQueries({ queryKey: ['debts'] }),
                queryClient.invalidateQueries({ queryKey: ['transactions'] }),
                queryClient.invalidateQueries({ queryKey: ['budgets'] }),
            ]);

            if (confirmationBody?.transaction?.id) {
                toast.success('Pago registrado: se actualizó obligación y transacción.');
            } else if (confirmationBody?.debt?.id) {
                toast.success('Obligación y deuda registradas correctamente.');
            } else {
                toast.success('Obligación guardada correctamente.');
            }

            setStep('success');

        } catch (error: any) {
            console.error('Error saving obligation:', error);
            toast.error('Error al guardar: ' + error.message);
        }
    };

    const handleReset = () => {
        setStep('upload');
        setExtractedData(null);
        setPrefillFile(null);
    };

    if (!isReady) {
        return (
            <div className="container max-w-4xl py-6 space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                    <FinFlowLogo className="w-16 h-16" />
                    <h1 className="text-3xl font-bold tracking-tight">Adjuntar documento</h1>
                </div>
                <SetupCheck onReady={() => setIsReady(true)} />
            </div>
        );
    }

    return (
        <div className="container max-w-4xl py-6 space-y-6">
            <div className="flex flex-col items-center text-center space-y-3">
                <FinFlowLogo className="w-14 h-14" />
                <h1 className="text-3xl font-bold tracking-tight">Adjuntar documento</h1>
                <p className="text-muted-foreground max-w-xl text-sm">
                    Subí un PDF o una foto. Después podés confirmar vencimientos/pagos o enviarlo al Asistente para interpretarlo.
                </p>
            </div>

            <div className="transition-all duration-500 ease-in-out">
                {step === 'upload' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <ReceiptUploader onUploadComplete={handleExtractionComplete} prefillFile={prefillFile} />
                    </div>
                )}

                {step === 'verify' && extractedData && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-500">
                        <div className="mb-3 flex justify-end">
                            <button
                                type="button"
                                onClick={handleAnalyzeWithAssistant}
                                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                                title="Abrir el Asistente con este documento"
                            >
                                <Brain className="h-4 w-4" />
                                Analizar con asistente
                            </button>
                        </div>
                        <ExtractionVerifier
                            data={extractedData}
                            onConfirm={handleVerificationConfirm}
                            onCancel={handleReset}
                        />
                    </div>
                )}

                {step === 'success' && (
                    <Card className="max-w-md mx-auto animate-in zoom-in duration-300 border-green-500/20 bg-green-50/50 dark:bg-green-900/10">
                        <CardContent className="pt-6 text-center space-y-4">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto">
                                <span className="text-3xl">🎉</span>
                            </div>
                            <h3 className="text-xl font-bold text-green-700 dark:text-green-400">¡Guardado con éxito!</h3>
                            <p className="text-muted-foreground">
                                Hemos añadido esta obligación a tu lista. Tu plan financiero se está actualizando...
                            </p>
                            <button
                                type="button"
                                onClick={handleAnalyzeWithAssistant}
                                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
                                title="Abrir el Asistente con este documento"
                            >
                                <Brain className="h-4 w-4" />
                                Analizar con asistente
                            </button>
                            <button
                                onClick={handleReset}
                                className="inline-flex items-center text-primary font-medium hover:underline mt-4"
                            >
                                Procesar otro documento <ArrowRight className="w-4 h-4 ml-1" />
                            </button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
