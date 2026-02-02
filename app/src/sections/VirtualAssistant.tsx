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
  Calendar,
  Paperclip,
  FileText,
  X
} from 'lucide-react';
import { generateGeminiResponse, generateFinancialAdvice, isGeminiAvailable, analyzePDFWithGemini, type AssistantMessage } from '@/services/geminiAssistant';
import { generatePaymentReminders, generateMonthlyForecast } from '@/services/assistant';
import type { Debt, Transaction, FinancialSummary } from '@/types/finance';
import { toast } from 'sonner';

interface VirtualAssistantProps {
  debts: Debt[];
  transactions: Transaction[];
  summary: FinancialSummary;
}

export function VirtualAssistant({ debts, transactions, summary }: VirtualAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [aiAdvice, setAiAdvice] = useState<string[]>([]);
  const [geminiStatus, setGeminiStatus] = useState<boolean>(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Verificar estado de Gemini al cargar y establecer mensaje de bienvenida
  useEffect(() => {
    const geminiActive = isGeminiAvailable();
    setGeminiStatus(geminiActive);

    if (!geminiActive) {
      toast.warning('API Key de Gemini no encontrada', {
        description: 'El asistente funcionará en modo limitado. Agrega VITE_GEMINI_API_KEY en Vercel/Netlify.',
        duration: 8000,
      });
    }

    setMessages([{
      id: 'welcome',
      type: 'assistant',
      content: geminiActive
        ? '¡Hola! 👋 Soy tu asistente financiero personal con Gemini AI.\n\nPuedo ayudarte con:\n• 📅 Recordarte vencimientos de tarjetas\n• 📊 Predecir tus gastos del próximo mes  \n• 💡 Darte consejos para salir de deudas\n• 📈 Analizar tu situación financiera\n\n¿Qué necesitas saber hoy?'
        : '⚠️ **Modo Limitado activado**\n\nNo detecté tu API Key de Gemini. Para activar la IA real:\n1. Ve a tu panel de Vercel/Netlify\n2. Agrega la variable `VITE_GEMINI_API_KEY`\n3. Redespliega el proyecto\n\nMientras tanto, puedo responder consultas básicas sobre tus datos locales.',
      timestamp: new Date().toISOString(),
    }]);
  }, []);

  // Cargar consejos de IA al inicio
  useEffect(() => {
    const loadAdvice = async () => {
      const advice = await generateFinancialAdvice(debts, summary);
      setAiAdvice(advice);
    };
    loadAdvice();
  }, [debts, summary]);

  // Scroll al final de los mensajes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Enviar mensaje
  const handleSendMessage = async () => {
    const trimmedMessage = inputMessage.trim();

    // Si hay PDF adjunto pero no mensaje, usar mensaje automático
    const finalMessage = attachedFile
      ? (trimmedMessage || '¿Qué información puedes darme sobre este resumen de tarjeta?')
      : trimmedMessage;

    if (!finalMessage && !attachedFile) return;

    // Agregar mensaje del usuario
    const userMessage: AssistantMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: attachedFile
        ? `📎 ${attachedFile.name}\n\n${finalMessage}`
        : finalMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsTyping(true);

    // Generar respuesta
    try {
      let responseText = '';

      // Si hay PDF adjunto, analizarlo primero
      if (attachedFile && attachedFile.type === 'application/pdf') {
        try {
          const pdfData = await analyzePDFWithGemini(attachedFile);

          responseText = `📄 **Análisis del PDF completado**\n\n` +
            `🏦 **Tarjeta:** ${pdfData.cardName}\n` +
            `💳 **Saldo Total:** $${pdfData.totalBalance.toLocaleString('es-AR')}\n` +
            `💰 **Pago Mínimo:** $${pdfData.minimumPayment.toLocaleString('es-AR')}\n` +
            `📅 **Vencimiento:** ${pdfData.dueDate}\n\n`;

          if (pdfData.transactions.length > 0) {
            responseText += `**Transacciones destacadas:**\n`;
            pdfData.transactions.slice(0, 5).forEach(t => {
              responseText += `• ${t.description}: $${t.amount.toLocaleString('es-AR')}\n`;
            });
          }

          responseText += `\n💡 **Consejo:** Te recomiendo pagar más que el mínimo para evitar intereses. ` +
            `¿Querés que agregue esta deuda a tu lista de seguimiento?`;

        } catch (pdfError: any) {
          responseText = `❌ **Error al analizar el PDF**\n\n`;
          if (pdfError.message?.includes('password') || pdfError.message?.includes('encrypted')) {
            responseText += `Este PDF está protegido con contraseña. ` +
              `Por favor, enviá el PDF sin contraseña o con la contraseña removida.\n\n` +
              `💡 **Tip:** La mayoría de los bancos usan tu DNI sin puntos ni espacios.`;
          } else {
            responseText += `No pude leer el PDF. Asegurate de que sea un resumen de tarjeta válido.`;
          }
        }
      } else {
        // Sin PDF, respuesta normal
        responseText = await generateGeminiResponse(finalMessage, { debts, transactions, summary });
      }

      const assistantMessage: AssistantMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: AssistantMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Lo siento, hubo un error. Intenta de nuevo.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setAttachedFile(null); // Limpiar archivo adjunto
    }
  };

  // Acción rápida
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
      const responseText = await generateGeminiResponse(actionText, { debts, transactions, summary });
      const assistantMessage: AssistantMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseText,
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
                onClick={() => handleQuickAction('¿Cuánto gastaré el próximo mes?')}
              >
                <Calendar className="h-3 w-3 mr-1" />
                Predicción
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
