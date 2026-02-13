'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Brain, FileImage, FileText, Loader2, Paperclip, Send, X } from 'lucide-react';
import { FinFlowLogo } from '@/components/ui/finflow-logo';
import { toast } from 'sonner';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const SUPPORTED_ATTACHMENT_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

type AssistantDocumentContext = {
    sourceName: string;
    mimeType: string;
    sizeBytes: number;
    extraction: any;
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
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [input, setInput] = useState('');
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isProcessingAttachment, setIsProcessingAttachment] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);

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

        if (!SUPPORTED_ATTACHMENT_TYPES.has(file.type)) {
            toast.error('Formato no soportado. Usa PDF, JPG, PNG o WEBP.');
            event.target.value = '';
            return;
        }

        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
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
        <div className="flex flex-col h-[calc(100vh-10rem)] max-w-4xl mx-auto space-y-4">
            <Card className="flex-1 flex flex-col min-h-0 border-none shadow-lg">
                <CardHeader className="border-b bg-primary/5">
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-primary" />
                        Asistente Inteligente
                    </CardTitle>
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
                                    <div className="flex flex-wrap items-center justify-center gap-2 px-4">
                                        {quickPrompts.map((prompt) => (
                                            <Button
                                                key={prompt}
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="text-xs"
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
                                    <div className={`max-w-[80%] p-3 rounded-2xl ${m.role === 'user'
                                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                                        : 'bg-muted rounded-tl-none'
                                        }`}>
                                        <p className="text-sm whitespace-pre-wrap">{m.content}</p>
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
                                <div className="flex items-center gap-2 truncate">
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
                                >
                                    <X className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={handleAttachmentSelection}
                                className="hidden"
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
                                className="flex-1 h-11"
                            />
                            <Button type="submit" size="icon" disabled={isLoading || isProcessingAttachment} className="h-11 w-11">
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
