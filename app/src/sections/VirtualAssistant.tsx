import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Badge } from '@/components/ui/badge';
import {
  Bot,
  Send,
  User,
  Sparkles,
  Bell,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  FileText,
  X,
  Trash2
} from 'lucide-react';
import { generateGeminiResponse, generateFinancialAdvice, isGeminiAvailable, analyzePDFWithGemini, type AssistantMessage } from '@/services/geminiAssistant';
import { generatePaymentReminders, generateMonthlyForecast } from '@/services/assistant';
import type { Debt, Transaction, FinancialSummary } from '@/types/finance';
import { toast } from 'sonner';

interface VirtualAssistantProps {
  debts: Debt[];
  transactions: Transaction[];
  summary: FinancialSummary;
  onAddTransaction: (transaction: any) => void;
}

export function VirtualAssistant({ debts, transactions, summary, onAddTransaction }: VirtualAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string[]>([]);
  const [geminiStatus, setGeminiStatus] = useState<boolean>(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cargar estado inicial y persistencia
  useEffect(() => {
    const geminiActive = isGeminiAvailable();
    setGeminiStatus(geminiActive);

    // Cargar historial
    const storedHistory = localStorage.getItem('chat_history');
    if (storedHistory) {
      try {
        setMessages(JSON.parse(storedHistory));
      } catch (e) {
        console.error('Error loading chat history', e);
      }
    } else {
      setMessages([{
        id: 'welcome',
        type: 'assistant',
        content: geminiActive
          ? '¡Hola! 👋 Soy tu asistente financiero personal.\n\nPuedes pedirme:\n• "Agrega un gasto de $5000 en super"\n• "¿Cuánto gasté este mes?"\n• Analizar PDFs o darte consejos.\n\n¿Qué hacemos hoy?'
          : '⚠️ Modo Limitado: Sin conexión a Gemini.',
        timestamp: new Date().toISOString(),
      }]);
    }
  }, []);

  // Persistir mensajes
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chat_history', JSON.stringify(messages));
    }
  }, [messages]);

  // Cargar consejos de IA
  useEffect(() => {
    const loadAdvice = async () => {
      const advice = await generateFinancialAdvice(debts, summary);
      setAiAdvice(advice);
    };
    loadAdvice();
  }, [debts, summary]);

  // Scroll al final
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const clearHistory = () => {
    if (confirm('¿Borrar historial de chat?')) {
      localStorage.removeItem('chat_history');
      setMessages([{
        id: 'new-welcome',
        type: 'assistant',
        content: 'Historial borrado. ¿En qué puedo ayudarte?',
        timestamp: new Date().toISOString()
      }]);
    }
  };

  // Procesar Acción del Agente
  const handleAgentAction = (action: any) => {
    if (action && action.action === 'ADD_TRANSACTION' && action.data) {
      const { amount, description, category, type, date } = action.data;
      onAddTransaction({
        amount: Number(amount),
        description: description || 'Gasto registrado por IA',
        category: category || 'other',
        type: type || 'expense',
        date: date || new Date().toISOString().split('T')[0]
      });
      toast.success(`✅ ${type === 'income' ? 'Ingreso' : 'Gasto'} registrado: $${amount}`);
    }
  };

  // Enviar mensaje
  const handleSendMessage = async () => {
    const trimmedMessage = inputMessage.trim();

    // Lógica de PDF/Password existente...
    if (attachedFile && !trimmedMessage) {
      // ... (Mismo código de pregunta password) ...
      const userMessage: AssistantMessage = {
        id: Date.now().toString(),
        type: 'user',
        content: `📎 ${attachedFile.name}`,
        timestamp: new Date().toISOString(),
      };

      const botMessage: AssistantMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `📄 Recibí **${attachedFile.name}**. Si tiene clave, escríbela. Si no, dime qué analizar.`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMessage, botMessage]);
      setInputMessage('');
      return;
    }

    const isPasswordResponse = attachedFile && trimmedMessage && (
      /^\d{7,8}$/.test(trimmedMessage) ||
      trimmedMessage.toLowerCase().includes('sin contraseña') ||
      trimmedMessage.toLowerCase() === 'no'
    );

    const finalMessage = attachedFile && !isPasswordResponse
      ? (trimmedMessage || 'Analiza este archivo')
      : trimmedMessage;

    if (!finalMessage && !attachedFile) return;

    // Agregar mensaje usuario
    const userMessage: AssistantMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: finalMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    try {
      let responseText = '';

      // ANÁLISIS PDF
      if (attachedFile && attachedFile.type === 'application/pdf') {
        // ... (Lógica PDF existente, asumiendo que analyzePDF devuelve objeto)
        const password = isPasswordResponse && /^\d{7,8}$/.test(trimmedMessage) ? trimmedMessage : '';
        const pdfData = await analyzePDFWithGemini(attachedFile, password);

        responseText = `✅ **Análisis PDF**\nTarjeta: ${pdfData.cardName}\nSaldo: $${pdfData.totalBalance}\nVence: ${pdfData.dueDate}`;
        // Podríamos agregar botón para guardar transacciones aquí en el futuro
      } else {
        // LLAMADA NORMAL A GEMINI (AGENTE)
        const result = await generateGeminiResponse(finalMessage, { debts, transactions, summary });
        responseText = result.text;

        // Ejecutar acción si existe
        if (result.action) {
          handleAgentAction(result.action);
        }
      }

      const assistantMessage: AssistantMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error(error);
      const errMessage: AssistantMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: 'Error al procesar tu solicitud.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errMessage]);
    } finally {
      setIsTyping(false);
      if (!attachedFile || !isPasswordResponse) setAttachedFile(null);
    }
  };

  // Acción rápida reescrita
  const handleQuickAction = async (actionText: string) => {
    const userMessage: AssistantMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: actionText,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const result = await generateGeminiResponse(actionText, { debts, transactions, summary });

      if (result.action) {
        handleAgentAction(result.action);
      }

      const assistantMessage: AssistantMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: result.text,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      toast.error('Error al procesar la consulta');
    } finally {
      setIsTyping(false);
    }
  };

  // Calcular datos para mostrar
  const reminders = generatePaymentReminders(debts);
  const forecast = generateMonthlyForecast(transactions, debts, summary);
  // const predictions = predictNextMonthExpenses(transactions, debts);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Vencimientos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bell className="h-4 w-4 text-yellow-500" />
              Vencimientos Próximos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reminders.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm">Sin vencimientos próximos</span>
              </div>
            ) : (
              <div className="space-y-2">
                {reminders.slice(0, 3).map((reminder, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="truncate flex-1">{reminder.debtName}</span>
                    <Badge
                      variant={reminder.urgency === 'critical' ? 'destructive' : reminder.urgency === 'high' ? 'default' : 'secondary'}
                      className="ml-2 text-xs"
                    >
                      {reminder.daysUntilDue <= 0 ? 'HOY' : `${reminder.daysUntilDue}d`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pronóstico */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Pronóstico {forecast.month}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Gastos estimados:</span>
                <span className="font-medium">{formatCurrency(forecast.predictedExpenses)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance:</span>
                <span className={`font-medium ${forecast.predictedBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(forecast.predictedBalance)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <AlertTriangle className={`h-4 w-4 ${forecast.riskLevel === 'high' ? 'text-red-500' : forecast.riskLevel === 'medium' ? 'text-yellow-500' : 'text-green-500'}`} />
                <span className="text-xs text-muted-foreground">
                  Riesgo: {forecast.riskLevel === 'high' ? 'Alto' : forecast.riskLevel === 'medium' ? 'Medio' : 'Bajo'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Consejos IA */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-purple-500" />
              {geminiStatus ? 'Consejos de Gemini AI' : 'Consejos Financieros'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {aiAdvice.length > 0 ? (
                aiAdvice.map((advice, idx) => (
                  <p key={idx} className="text-sm">{advice}</p>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Cargando consejos...</p>
              )}
            </div>
            {!geminiStatus && (
              <p className="text-xs text-muted-foreground mt-3 border-t pt-2">
                💡 Para respuestas más inteligentes con IA, configurá tu VITE_GEMINI_API_KEY
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chat */}
      <Card className="flex flex-col" style={{ height: '500px' }}>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Asistente {geminiStatus ? 'con Gemini AI' : 'Financiero'}
            {geminiStatus ? (
              <Sparkles className="h-4 w-4 text-yellow-500" />
            ) : (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full ml-2">
                Modo local
              </span>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {/* Mensajes - Con scroll funcional */}
          <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '350px' }}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${message.type === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                      }`}
                  >
                    {message.type === 'user' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${message.type === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                      }`}
                  >
                    <p className="text-sm whitespace-pre-line">{message.content}</p>
                    <span className="text-xs opacity-50 mt-1 block">
                      {new Date(message.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="px-4 py-2 border-t bg-muted/30">
            <div className="flex gap-2 overflow-x-auto pb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction('¿Cuándo vencen mis tarjetas?')}
              >
                <Bell className="h-3 w-3 mr-1" />
                Vencimientos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction('¿Cuánto debo en total?')}
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                Mis deudas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction('¿Cómo salgo de deudas?')}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                Consejos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickAction('¿Cuántos ingresos tuve?')}
              >
                <TrendingUp className="h-3 w-3 mr-1" />
                Ingresos
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                title="Borrar historial"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t">
            {/* File attachment preview */}
            {attachedFile && (
              <div className="mb-2 flex items-center gap-2 p-2 bg-muted rounded-lg">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm flex-1">{attachedFile.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setAttachedFile(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex gap-2"
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setAttachedFile(file);
                    toast.success(`PDF adjunto: ${file.name}`);
                  }
                }}
              />

              {/* Attach button */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                title="Adjuntar PDF"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              <Input
                placeholder={attachedFile ? "Pregunta algo sobre el PDF..." : "Escribe tu consulta..."}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={(!inputMessage.trim() && !attachedFile) || isTyping}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
