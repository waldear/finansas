
'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FinFlowLogo } from '@/components/ui/finflow-logo';
import { ReceiptUploader } from '@/components/copilot/receipt-uploader';
import { ExtractionVerifier } from '@/components/copilot/extraction-verifier';
import { WeeklyPlan } from '@/components/copilot/weekly-plan';
import { SetupCheck } from '@/components/copilot/setup-check';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

type CopilotStep = 'upload' | 'verify' | 'success';

export default function CopilotPage() {
    const queryClient = useQueryClient();
    const [isReady, setIsReady] = useState(false);
    const [step, setStep] = useState<CopilotStep>('upload');
    const [extractedData, setExtractedData] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleExtractionComplete = (data: any) => {
        setExtractedData(data);
        setStep('verify');
    };

    const handleVerificationConfirm = async (formData: any) => {
        setIsSaving(true);

        try {
            const obligationResponse = await fetch('/api/obligations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    title: formData.title,
                    amount: formData.amount,
                    due_date: formData.due_date,
                    status: 'pending',
                    category: formData.category || 'Varios',
                    minimum_payment: formData.minimum_payment || null,
                }),
            });

            const obligationBody = await obligationResponse.json().catch(() => null);
            if (!obligationResponse.ok) {
                throw new Error(obligationBody?.error || 'No se pudo guardar la obligación');
            }

            const isDebtLikeDocument = extractedData?.type === 'credit_card' || extractedData?.type === 'invoice';
            let debtWarning: string | null = null;

            if (isDebtLikeDocument) {
                const normalizedAmount = Number(formData.amount || 0);
                const normalizedMinimumPayment = Number(formData.minimum_payment || 0);
                const monthlyPayment = normalizedMinimumPayment > 0 ? normalizedMinimumPayment : normalizedAmount;

                const debtResponse = await fetch('/api/debts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        name: formData.title,
                        total_amount: normalizedAmount,
                        monthly_payment: monthlyPayment,
                        remaining_installments: 1,
                        total_installments: 1,
                        category: formData.category || 'Deuda',
                        next_payment_date: formData.due_date,
                    }),
                });

                const debtBody = await debtResponse.json().catch(() => null);
                if (!debtResponse.ok) {
                    debtWarning = debtBody?.error || 'No se pudo registrar automáticamente en deudas.';
                }
            }

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['obligations'] }),
                queryClient.invalidateQueries({ queryKey: ['debts'] }),
            ]);

            if (debtWarning) {
                toast.warning(`Obligación guardada. ${debtWarning}`);
            } else if (isDebtLikeDocument) {
                toast.success('¡Obligación y deuda guardadas correctamente!');
            } else {
                toast.success('¡Obligación guardada correctamente!');
            }

            setStep('success');

        } catch (error: any) {
            console.error('Error saving obligation:', error);
            toast.error('Error al guardar: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        setStep('upload');
        setExtractedData(null);
    };

    if (!isReady) {
        return (
            <div className="container max-w-4xl py-6 space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                    <FinFlowLogo className="w-16 h-16" />
                    <h1 className="text-3xl font-bold tracking-tight">Tu Copiloto Financiero</h1>
                </div>
                <SetupCheck onReady={() => setIsReady(true)} />
            </div>
        );
    }

    return (
        <div className="container max-w-4xl py-6 space-y-8">
            <div className="flex flex-col items-center text-center space-y-4">
                <FinFlowLogo className="w-16 h-16" />
                <h1 className="text-3xl font-bold tracking-tight">Tu Copiloto Financiero</h1>
                <p className="text-muted-foreground max-w-lg">
                    Sube tus facturas, resúmenes de tarjeta o tickets.
                    Yo extraigo los datos y tú solo confirmas.
                </p>
            </div>

            <div className="max-w-2xl mx-auto">
                <WeeklyPlan />
            </div>

            <div className="mt-8 transition-all duration-500 ease-in-out">
                {step === 'upload' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <ReceiptUploader onUploadComplete={handleExtractionComplete} />
                    </div>
                )}

                {step === 'verify' && extractedData && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-500">
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
                                onClick={handleReset}
                                className="inline-flex items-center text-primary font-medium hover:underline mt-4"
                            >
                                Procesar otro documento <ArrowRight className="w-4 h-4 ml-1" />
                            </button>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Fun Fact / Tip Section */}
            <div className="mt-12 p-4 rounded-lg bg-muted/30 text-center text-sm text-muted-foreground">
                <p>💡 <strong>Tip Copiloto:</strong> Subir tus gastos apenas ocurren ayuda a predecir tu fin de mes con un 40% más de precisión.</p>
            </div>
        </div>
    );
}
