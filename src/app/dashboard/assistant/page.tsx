'use client';

export const dynamic = 'force-dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Brain, Crown, FileImage, FileText, Loader2, Paperclip, Send, Trash2, X } from 'lucide-react';
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

type ImportPreviewRow = {
    id: string;
    date: string;
    type: 'income' | 'expense';
    category: string;
    description: string;
    amount: number;
};

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
    const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[] | null>(null);
    const [importPreviewMeta, setImportPreviewMeta] = useState<any>(null);
    const [isPreparingImport, setIsPreparingImport] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    const attachmentPrompts = [
        { label: 'Resumir', prompt: 'Resumí el documento adjunto en puntos clave y una conclusión.' },
        { label: 'Gastos y categorías', prompt: 'Del documento adjunto, detectá los gastos principales, categorizalos y sugerí 3 recortes.' },
        { label: 'Vencimientos', prompt: 'Del documento adjunto, identificá vencimientos, cuotas o suscripciones y recomendame recordatorios.' },
        { label: 'Movimientos raros', prompt: 'Revisá el documento adjunto y marcá movimientos raros, duplicados o inconsistencias.' },
    ];

    const importTotals = useMemo(() => {
        const rows = importPreviewRows || [];
        const income = rows.filter((r) => r.type === 'income').reduce((acc, r) => acc + Number(r.amount || 0), 0);
        const expense = rows.filter((r) => r.type === 'expense').reduce((acc, r) => acc + Number(r.amount || 0), 0);
        return {
            count: rows.length,
            income,
            expense,
            balance: income - expense,
        };
    }, [importPreviewRows]);

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
        // Reset any pending import preview when changing/clearing the attachment.
        setImportPreviewRows(null);
        setImportPreviewMeta(null);
    }, [attachedFile?.name, attachedFile?.size, attachedFile?.type]);

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

    const handlePrepareImport = async () => {
        if (!attachedFile) return;

        setIsPreparingImport(true);
        try {
            setIsProcessingAttachment(true);
            const documentContext = await processAttachedDocument(attachedFile);
            const response = await fetch('/api/transactions/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    extraction: documentContext.extraction,
                    maxRows: 120,
                }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || 'No se pudo generar el preview de importación.');
            }

            const rows = Array.isArray(payload?.rows) ? payload.rows : [];
            if (!rows.length) {
                const warning = Array.isArray(payload?.warnings) ? payload.warnings[0] : null;
                toast.info(warning || 'No se detectaron movimientos en el adjunto.');
                setImportPreviewRows([]);
                setImportPreviewMeta(payload?.meta ?? null);
                return;
            }

            const hydratedRows: ImportPreviewRow[] = rows
                .slice(0, 250)
                .map((row: any): ImportPreviewRow => ({
                    id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string,
                    date: typeof row?.date === 'string' ? row.date : new Date().toISOString().split('T')[0],
                    type: row?.type === 'income' ? 'income' as const : 'expense' as const,
                    category: typeof row?.category === 'string' ? row.category : 'General',
                    description: typeof row?.description === 'string' ? row.description : 'Movimiento importado',
                    amount: Number(row?.amount || 0),
                }))
                .filter((row: ImportPreviewRow) => row.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(row.date));

            setImportPreviewRows(hydratedRows);
            setImportPreviewMeta(payload?.meta ?? null);
            toast.success(`Preview listo: ${hydratedRows.length} movimientos detectados.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo preparar la importación.');
        } finally {
            setIsProcessingAttachment(false);
            setIsPreparingImport(false);
        }
    };

    const updateImportRow = (rowId: string, changes: Partial<Omit<ImportPreviewRow, 'id'>>) => {
        setImportPreviewRows((prev) => {
            if (!prev) return prev;
            return prev.map((row) => row.id === rowId ? { ...row, ...changes } : row);
        });
    };

    const removeImportRow = (rowId: string) => {
        setImportPreviewRows((prev) => {
            if (!prev) return prev;
            return prev.filter((row) => row.id !== rowId);
        });
    };

    const cancelImportPreview = () => {
        setImportPreviewRows(null);
        setImportPreviewMeta(null);
    };

    const confirmImport = async () => {
        const rows = (importPreviewRows || [])
            .map((row) => ({
                date: String(row.date || '').trim(),
                type: row.type,
                category: String(row.category || '').trim(),
                description: String(row.description || '').trim(),
                amount: Number(row.amount || 0),
            }))
            .filter((row) => row.amount > 0 && row.description && row.category && /^\d{4}-\d{2}-\d{2}$/.test(row.date));

        if (!rows.length) {
            toast.info('No hay filas válidas para importar.');
            return;
        }

        setIsImporting(true);
        try {
            const response = await fetch('/api/transactions/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    source: 'document',
                    rows,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || 'No se pudo importar.');
            }

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['transactions'] }),
                queryClient.invalidateQueries({ queryKey: ['audit'] }),
                queryClient.invalidateQueries({ queryKey: ['budgets'] }),
            ]);

            cancelImportPreview();
            setAttachedFile(null);
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: `Listo. Importé ${payload?.imported ?? rows.length} movimientos desde tu adjunto.`,
                },
            ]);
            toast.success(`Importación lista: ${payload?.imported ?? rows.length} movimientos cargados${payload?.skipped ? `, ${payload.skipped} omitidos` : ''}.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo importar.');
        } finally {
            setIsImporting(false);
        }
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
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-auto w-full justify-start whitespace-normal text-left text-xs leading-snug"
                                        onClick={handlePrepareImport}
                                        disabled={isLoading || isProcessingAttachment || isPreparingImport || isImporting}
                                    >
                                        {isPreparingImport ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Importar movimientos (preview)
                                    </Button>
                                    {attachmentPrompts.map((item) => (
                                        <Button
                                            key={item.label}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-auto w-full justify-start whitespace-normal text-left text-xs leading-snug"
                                            onClick={() => handleSend(item.prompt)}
                                            disabled={isLoading || isProcessingAttachment || isPreparingImport || isImporting}
                                        >
                                            {item.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {importPreviewRows && (
                            <div className="rounded-xl border bg-muted/10 p-3 text-xs space-y-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-0.5">
                                        <p className="text-sm font-semibold">Preview de importación</p>
                                        <p className="text-xs text-muted-foreground">
                                            {importTotals.count} movimientos · Ingresos {importTotals.income.toFixed(0)} · Gastos {importTotals.expense.toFixed(0)} · Balance {importTotals.balance.toFixed(0)}
                                            {Number(importPreviewMeta?.usdRateUsed) > 0 ? ` · TC USD ${Number(importPreviewMeta.usdRateUsed).toFixed(2)}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={cancelImportPreview}
                                            disabled={isImporting || isLoading || isProcessingAttachment}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={confirmImport}
                                            disabled={isImporting || isLoading || isProcessingAttachment || importPreviewRows.length === 0}
                                        >
                                            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                            Importar {importPreviewRows.length}
                                        </Button>
                                    </div>
                                </div>

                                <div className="max-h-[40vh] space-y-2 overflow-auto pr-1">
                                    {importPreviewRows.map((row) => (
                                        <div key={row.id} className="rounded-lg border bg-background/40 p-2">
                                            <div className="grid gap-2 sm:grid-cols-[8.5rem_7rem_1fr_1fr_8.5rem_auto] sm:items-center">
                                                <Input
                                                    type="date"
                                                    value={row.date}
                                                    onChange={(event) => updateImportRow(row.id, { date: event.target.value })}
                                                    disabled={isImporting || isLoading || isProcessingAttachment}
                                                    className="h-9"
                                                />
                                                <select
                                                    value={row.type}
                                                    onChange={(event) => updateImportRow(row.id, { type: event.target.value === 'income' ? 'income' : 'expense' })}
                                                    disabled={isImporting || isLoading || isProcessingAttachment}
                                                    className="h-9 rounded-md border border-input bg-background px-3 text-xs"
                                                >
                                                    <option value="expense">Gasto</option>
                                                    <option value="income">Ingreso</option>
                                                </select>
                                                <Input
                                                    value={row.description}
                                                    onChange={(event) => updateImportRow(row.id, { description: event.target.value })}
                                                    disabled={isImporting || isLoading || isProcessingAttachment}
                                                    className="h-9"
                                                    placeholder="Descripción"
                                                />
                                                <Input
                                                    value={row.category}
                                                    onChange={(event) => updateImportRow(row.id, { category: event.target.value })}
                                                    disabled={isImporting || isLoading || isProcessingAttachment}
                                                    className="h-9"
                                                    placeholder="Categoría"
                                                />
                                                <Input
                                                    type="number"
                                                    inputMode="decimal"
                                                    step="0.01"
                                                    value={Number.isFinite(Number(row.amount)) ? String(row.amount) : ''}
                                                    onChange={(event) => updateImportRow(row.id, { amount: Number(event.target.value || 0) })}
                                                    disabled={isImporting || isLoading || isProcessingAttachment}
                                                    className="h-9"
                                                    placeholder="Monto"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9"
                                                    onClick={() => removeImportRow(row.id)}
                                                    disabled={isImporting || isLoading || isProcessingAttachment}
                                                    title="Quitar fila"
                                                >
                                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </div>
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
