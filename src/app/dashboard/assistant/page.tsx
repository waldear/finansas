'use client';

export const dynamic = 'force-dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Brain, Crown, FileImage, FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { FinFlowLogo } from '@/components/ui/finflow-logo';
import { toast } from 'sonner';
import { useAssistantAttachment } from '@/components/providers/assistant-attachment-provider';
import {
    MAX_ASSISTANT_ATTACHMENT_SIZE_BYTES,
    SUPPORTED_ASSISTANT_ATTACHMENT_TYPES,
} from '@/lib/assistant-attachments';

type AssistantDocumentContext = {
    sourceName: string;
    mimeType: string;
    sizeBytes: number;
    extraction: any;
};

type AssistantBilling = {
    plan: 'free' | 'pro';
    status: string;
    provider: string;
    requiresUpgrade: boolean;
    usage: {
        usedRequests: number;
        limitRequests: number;
        remainingRequests: number;
        periodStart: string;
        periodEnd: string;
    };
};

function formatFileSize(bytes: number) {
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${bytes} B`;
}

const quickPrompts = [
    'Dame recordatorios de vencimientos de esta semana',
    '¿Qué pagos debería priorizar hoy?',
    'Analiza mis gastos y sugiere 3 ajustes',
    '¿Cómo voy frente a mis presupuestos?',
    '/gasto 24500 supermercado',
    '/ingreso 320000 salario',
];

export default function AssistantPage() {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const { consumePendingFile } = useAssistantAttachment();
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [input, setInput] = useState('');
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingAttachment, setIsProcessingAttachment] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [billing, setBilling] = useState<AssistantBilling | null>(null);
    const [isStartingCheckout, setIsStartingCheckout] = useState(false);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);

    const attachmentPrompts = [
        { label: 'Resumir', prompt: 'Resumí el documento adjunto en puntos clave y una conclusión.' },
        { label: 'Gastos y categorías', prompt: 'Del documento adjunto, detectá los gastos principales, categorizalos y sugerí 3 recortes.' },
        { label: 'Vencimientos', prompt: 'Del documento adjunto, identificá vencimientos, cuotas o suscripciones y recomendame recordatorios.' },
        { label: 'Movimientos raros', prompt: 'Revisá el documento adjunto y marcá movimientos raros, duplicados o inconsistencias.' },
    ];

    const loadBilling = useCallback(async () => {
        try {
            const response = await fetch('/api/billing/entitlement', {
                credentials: 'include',
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload) return;
            setBilling({
                plan: payload.plan === 'pro' ? 'pro' : 'free',
                status: String(payload.status || 'active'),
                provider: String(payload.provider || 'none'),
                requiresUpgrade: Boolean(payload.plan !== 'pro' && payload.usage?.remainingRequests === 0),
                usage: {
                    usedRequests: Number(payload.usage?.usedRequests || 0),
                    limitRequests: Number(payload.usage?.limitRequests || 0),
                    remainingRequests: Number(payload.usage?.remainingRequests || 0),
                    periodStart: String(payload.usage?.periodStart || ''),
                    periodEnd: String(payload.usage?.periodEnd || ''),
                },
            });
        } catch {
            // no-op
        }
    }, []);

    useEffect(() => {
        const loadHistory = async () => {
            try {
                setIsLoadingHistory(true);
                const response = await fetch('/api/assistant/history', { credentials: 'include' });
                const payload = await response.json().catch(() => null);

                if (!response.ok) {
                    return;
                }

                if (Array.isArray(payload)) {
                    const hydratedMessages: { role: 'user' | 'assistant'; content: string }[] = payload
                        .map((item: any) => ({
                            role: item?.role === 'assistant' ? 'assistant' as const : 'user' as const,
                            content: typeof item?.content === 'string' ? item.content : '',
                        }))
                        .filter((item) => item.content);

                    setMessages(hydratedMessages);
                }
            } catch {
                // no-op: fail soft
            } finally {
                setIsLoadingHistory(false);
            }
        };

        loadHistory();
    }, []);

    useEffect(() => {
        void loadBilling();
    }, [loadBilling]);

    useEffect(() => {
        const pending = consumePendingFile();
        if (!pending) return;

        if (!SUPPORTED_ASSISTANT_ATTACHMENT_TYPES.has(pending.type)) {
            toast.error('Formato no soportado. Usa PDF, JPG, PNG o WEBP.');
            return;
        }

        if (pending.size > MAX_ASSISTANT_ATTACHMENT_SIZE_BYTES) {
            toast.error('El archivo supera 10MB. Sube uno más liviano.');
            return;
        }

        setAttachedFile(pending);
    }, [consumePendingFile]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const billingState = params.get('billing');
        if (!billingState) return;

        if (billingState === 'success') {
            toast.success('Suscripción Pro activada. Actualizando estado...');
            void loadBilling();
        } else if (billingState === 'cancelled') {
            toast.info('Checkout cancelado.');
        } else if (billingState === 'portal') {
            toast.success('Estado de suscripción actualizado.');
            void loadBilling();
        }

        params.delete('billing');
        const nextQuery = params.toString();
        const nextUrl = nextQuery ? `/dashboard/assistant?${nextQuery}` : '/dashboard/assistant';
        window.history.replaceState({}, '', nextUrl);
    }, [loadBilling]);

    const handleStartCheckout = async () => {
        setIsStartingCheckout(true);
        try {
            const response = await fetch('/api/billing/checkout', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                if (response.status === 409) {
                    toast.info(payload?.error || 'Tu suscripción Pro ya está activa.');
                    await loadBilling();
                    return;
                }
                throw new Error(payload?.error || 'No se pudo iniciar el checkout.');
            }

            if (!payload?.url) {
                throw new Error('Stripe no devolvió URL de checkout.');
            }

            window.location.assign(payload.url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo iniciar el checkout.');
        } finally {
            setIsStartingCheckout(false);
        }
    };

    const handleOpenPortal = async () => {
        setIsOpeningPortal(true);
        try {
            const response = await fetch('/api/billing/portal', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || 'No se pudo abrir el portal de suscripción.');
            }

            if (!payload?.url) {
                throw new Error('Stripe no devolvió URL del portal.');
            }

            window.location.assign(payload.url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo abrir el portal de suscripción.');
        } finally {
            setIsOpeningPortal(false);
        }
    };

    const processAttachedDocument = async (file: File): Promise<AssistantDocumentContext> => {
        const formData = new FormData();
        formData.append('file', file);

        const enqueueResponse = await fetch('/api/documents/process', {
            method: 'POST',
            credentials: 'include',
            body: formData,
        });

        const enqueueBody = await enqueueResponse.json().catch(() => null);
        if (!enqueueResponse.ok) {
            const composedError = [enqueueBody?.error, enqueueBody?.details, enqueueBody?.hint]
                .filter(Boolean)
                .join(' · ');
            throw new Error(composedError || 'No se pudo procesar el archivo adjunto.');
        }

        if (enqueueBody?.warning) {
            toast.warning(enqueueBody.warning);
        }

        if (!enqueueBody?.jobId) {
            if (!enqueueBody?.data) {
                throw new Error('No se obtuvo extracción del archivo adjunto.');
            }
            return {
                sourceName: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                extraction: enqueueBody.data,
            };
        }

        await fetch(`/api/documents/jobs/${enqueueBody.jobId}/run`, {
            method: 'POST',
            credentials: 'include',
        });

        for (let attempt = 0; attempt < 45; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const statusResponse = await fetch(`/api/documents/jobs/${enqueueBody.jobId}`, {
                credentials: 'include',
            });
            const statusBody = await statusResponse.json().catch(() => null);

            if (!statusResponse.ok) {
                throw new Error(statusBody?.error || 'No se pudo consultar el estado del documento.');
            }

            if (statusBody?.status === 'completed') {
                if (statusBody?.warning) {
                    toast.warning(statusBody.warning);
                }
                return {
                    sourceName: file.name,
                    mimeType: file.type,
                    sizeBytes: file.size,
                    extraction: statusBody?.data,
                };
            }

            if (statusBody?.status === 'failed') {
                throw new Error(statusBody?.error || 'El análisis del adjunto falló.');
            }
        }

        throw new Error('El análisis del adjunto tardó demasiado. Inténtalo nuevamente.');
    };

    const handleAttachmentSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!SUPPORTED_ASSISTANT_ATTACHMENT_TYPES.has(file.type)) {
            toast.error('Formato no soportado. Usa PDF, JPG, PNG o WEBP.');
            event.target.value = '';
            return;
        }

        if (file.size > MAX_ASSISTANT_ATTACHMENT_SIZE_BYTES) {
            toast.error('El archivo supera 10MB. Sube uno más liviano.');
            event.target.value = '';
            return;
        }

        setAttachedFile(file);
        event.target.value = '';
    };

    const handleSend = async (forcedMessage?: string) => {
        const userMessage = (forcedMessage ?? input).trim();
        const fileToAnalyze = attachedFile;
        if (!userMessage && !fileToAnalyze) return;

        setInput('');
        setAttachedFile(null);
        setMessages((prev) => [
            ...prev,
            {
                role: 'user',
                content: userMessage || `Adjunté ${fileToAnalyze?.name}. Analízalo y recomiéndame acciones.`,
            },
        ]);
        setIsLoading(true);

        try {
            let documentContext: AssistantDocumentContext | undefined;
            if (fileToAnalyze) {
                setIsProcessingAttachment(true);
                documentContext = await processAttachedDocument(fileToAnalyze);
                toast.success('Adjunto procesado. Generando recomendaciones...');
            }

            const res = await fetch('/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    message: userMessage || `Analiza este documento (${fileToAnalyze?.name}) y dame conclusiones.`,
                    documentContext,
                }),
            });

            const data = await res.json().catch(() => null);
            if (!res.ok) {
                throw new Error(data?.error || 'No se pudo obtener respuesta del asistente.');
            }

            setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
            if (data?.billing) {
                setBilling(data.billing as AssistantBilling);
            }

            if (Array.isArray(data?.actionsApplied) && data.actionsApplied.length > 0) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: ['transactions'] }),
                    queryClient.invalidateQueries({ queryKey: ['debts'] }),
                    queryClient.invalidateQueries({ queryKey: ['obligations'] }),
                    queryClient.invalidateQueries({ queryKey: ['savings'] }),
                ]);
                toast.success(`Se registraron ${data.actionsApplied.length} cambios automáticamente.`);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, hubo un error al procesar tu solicitud.' }]);
            if (fileToAnalyze) {
                setAttachedFile(fileToAnalyze);
            }
            toast.error(error instanceof Error ? error.message : 'No se pudo procesar el adjunto.');
        } finally {
            setIsProcessingAttachment(false);
            setIsLoading(false);
        }
    };

    return (
        <div className="mx-auto flex h-[calc(100dvh-11.5rem)] min-h-[32rem] w-full max-w-4xl flex-col space-y-4 md:h-[calc(100vh-10rem)]">
            <Card className="flex-1 flex flex-col min-h-0 border-none shadow-lg">
                <CardHeader className="border-b bg-primary/5">
                    <CardTitle className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Asistente Inteligente
                        </span>
                        {billing && (
                            <span className="text-xs font-medium text-muted-foreground">
                                {billing.plan.toUpperCase()} · {billing.usage.remainingRequests}/{billing.usage.limitRequests} restantes
                            </span>
                        )}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                        {(billing?.plan !== 'pro') && (
                            <Button
                                type="button"
                                size="sm"
                                className="h-8"
                                onClick={handleStartCheckout}
                                disabled={isStartingCheckout || isOpeningPortal}
                            >
                                {isStartingCheckout ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Crown className="mr-2 h-4 w-4" />
                                )}
                                Pasar a Pro
                            </Button>
                        )}
                        {(billing?.provider === 'stripe' || billing?.plan === 'pro') && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8"
                                onClick={handleOpenPortal}
                                disabled={isOpeningPortal || isStartingCheckout}
                            >
                                {isOpeningPortal ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                Gestionar suscripción
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden p-0">
                    <ScrollArea className="h-full p-4">
                        <div className="space-y-4">
                            {messages.length === 0 && (
                                <div className="text-center py-10 space-y-4">
                                    <FinFlowLogo className="h-20 w-20 mx-auto" />
                                    <div className="space-y-2">
                                        <p className="font-medium">¡Hola! Soy el cerebro financiero de tu app.</p>
                                        <p className="text-sm text-muted-foreground px-4">
                                            Tengo contexto de transacciones, deudas, obligaciones, metas, presupuestos y recurrencias.
                                            Pídeme recordatorios, prioridades de pago y sugerencias concretas.
                                            También puedes registrar rápido con `/gasto`, `/ingreso` o `/deuda`.
                                        </p>
                                    </div>
                                    <div className="grid w-full gap-2 px-4 sm:grid-cols-2">
                                        {quickPrompts.map((prompt) => (
                                            <Button
                                                key={prompt}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-auto w-full justify-start whitespace-normal text-left text-xs leading-snug"
                                                onClick={() => handleSend(prompt)}
                                                disabled={isLoading}
                                            >
                                                {prompt}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {isLoadingHistory && (
                                <div className="flex justify-center py-2 text-xs text-muted-foreground">
                                    Cargando historial...
                                </div>
                            )}
                            {messages.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[92%] sm:max-w-[80%] p-3 rounded-2xl ${m.role === 'user'
                                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                                        : 'bg-muted rounded-tl-none'
                                        }`}>
                                        <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-muted p-3 rounded-2xl rounded-tl-none flex items-center gap-2 text-sm">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Pensando...
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </CardContent>
                <div className="p-4 border-t bg-background">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="space-y-3"
                    >
                        {attachedFile && (
                            <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-xs">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    {attachedFile.type.startsWith('image/') ? (
                                        <FileImage className="h-4 w-4 shrink-0 text-primary" />
                                    ) : (
                                        <FileText className="h-4 w-4 shrink-0 text-primary" />
                                    )}
                                    <span className="truncate">{attachedFile.name}</span>
                                    <span className="text-muted-foreground">({formatFileSize(attachedFile.size)})</span>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => setAttachedFile(null)}
                                    disabled={isLoading || isProcessingAttachment}
                                    title="Quitar archivo adjunto"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}

                        {attachedFile && (
                            <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs">
                                <p className="font-medium">¿Qué querés hacer con el adjunto?</p>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    {attachmentPrompts.map((item) => (
                                        <Button
                                            key={item.label}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-auto w-full justify-start whitespace-normal text-left text-xs leading-snug"
                                            onClick={() => handleSend(item.prompt)}
                                            disabled={isLoading || isProcessingAttachment}
                                        >
                                            {item.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={handleAttachmentSelection}
                                className="hidden"
                                title="Seleccionar archivo"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11 shrink-0"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isLoading || isProcessingAttachment}
                                title="Adjuntar resumen o imagen"
                            >
                                <Paperclip className="h-4 w-4" />
                            </Button>
                            <Input
                                placeholder="Pregúntame sobre tus gastos, deudas o consejos de ahorro..."
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                disabled={isLoading || isProcessingAttachment}
                                className="h-11 min-w-0 flex-1 basis-[12rem]"
                            />
                            <Button type="submit" size="icon" disabled={isLoading || isProcessingAttachment} className="h-11 w-11" title="Enviar mensaje">
                                {(isLoading || isProcessingAttachment) ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Send className="h-4 w-4" />
                                )}
                            </Button>
                        </div>
                    </form>
                </div>
            </Card>
        </div>
    );
}
