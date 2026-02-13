'use client';

export const dynamic = 'force-dynamic';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Brain, Send, Loader2 } from 'lucide-react';
import { FinFlowLogo } from '@/components/ui/finflow-logo';
import { toast } from 'sonner';

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
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
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

    const handleSend = async (forcedMessage?: string) => {
        const userMessage = (forcedMessage ?? input).trim();
        if (!userMessage) return;

        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const res = await fetch('/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    message: userMessage,
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
        } finally {
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
                        className="flex gap-2"
                    >
                        <Input
                            placeholder="Pregúntame sobre tus gastos, deudas o consejos de ahorro..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            disabled={isLoading}
                            className="flex-1 h-11"
                        />
                        <Button type="submit" size="icon" disabled={isLoading} className="h-11 w-11">
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </Card>
        </div>
    );
}
