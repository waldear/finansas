import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Debt, Transaction, FinancialSummary } from '@/types/finance';

export interface AssistantMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Variable para cachear la instancia de Gemini
let genAI: GoogleGenerativeAI | null = null;
let cachedAPIKey: string | null = null;

// Obtener API key en tiempo real
function getAPIKey(): string {
  return import.meta.env.VITE_GEMINI_API_KEY || '';
}

// Verificar si Gemini está disponible
export function isGeminiAvailable(): boolean {
  const apiKey = getAPIKey();
  return apiKey.length > 10;
}

// Obtener o crear instancia de Gemini
function getGenAI(): GoogleGenerativeAI | null {
  const apiKey = getAPIKey();

  if (!apiKey || apiKey.length <= 10) {
    return null;
  }

  // Si cambió la API key o no hay instancia, crear nueva
  if (apiKey !== cachedAPIKey || !genAI) {
    try {
      genAI = new GoogleGenerativeAI(apiKey);
      cachedAPIKey = apiKey;
      console.log('✅ Gemini AI inicializado correctamente');
    } catch (error) {
      console.error('❌ Error inicializando Gemini:', error);
      return null;
    }
  }

  return genAI;
}

// Función principal para generar respuestas
export async function generateGeminiResponse(
  userMessage: string,
  context: {
    debts: Debt[];
    transactions: Transaction[];
    summary: FinancialSummary;
  }
): Promise<string> {
  // Obtener instancia de Gemini
  const genAI = getGenAI();

  // Si Gemini no está disponible, usar respuesta local
  if (!genAI) {
    console.log('Gemini no configurado, usando respuesta local');
    return generateLocalResponse(userMessage, context);
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    // Preparar contexto financiero
    const { debts, transactions, summary } = context;

    const recentTransactions = transactions
      .slice(0, 10)
      .map(t => `${t.date}: ${t.type === 'income' ? '+' : '-'}$${t.amount} - ${t.description} (${t.category})`)
      .join('\n');

    const debtsInfo = debts.map(d =>
      `- ${d.name}: $${d.totalAmount} total, $${d.monthlyPayment}/mes, ${d.remainingInstallments} cuotas restantes`
    ).join('\n');

    const prompt = `Eres un asesor financiero personal experto, amigable y motivador. Tu nombre es "FinAssistant".

DATOS FINANCIEROS ACTUALES DEL USUARIO:
- Balance total: $${summary.balance}
- Ingresos totales: $${summary.totalIncome}
- Gastos totales: $${summary.totalExpenses}
- Tasa de ahorro: ${summary.savingsRate.toFixed(1)}%
- Ratio deuda/ingreso: ${summary.debtToIncomeRatio.toFixed(1)}%
- Total adeudado: $${debts.reduce((sum, d) => sum + d.totalAmount, 0)}
- Pagos mensuales de deuda: $${debts.reduce((sum, d) => sum + d.monthlyPayment, 0)}

DEUDAS:
${debtsInfo || 'Sin deudas registradas'}

ÚLTIMAS 10 TRANSACCIONES:
${recentTransactions || 'Sin transacciones recientes'}

PREGUNTA DEL USUARIO:
"${userMessage}"

INSTRUCCIONES PARA RESPONDER:
1. Responde en español rioplatense (argentino), de forma amigable y profesional
2. Usa emojis para hacer la respuesta más amigable
3. Base tus consejos en los datos reales proporcionados arriba
4. Sé conciso pero completo (máximo 3-4 párrafos)
5. Si el usuario pregunta sobre deudas, da consejos específicos sobre las tarjetas que tiene
6. Si pregunta sobre ahorro, referencie su tasa de ahorro actual (${summary.savingsRate.toFixed(1)}%)
7. Si pregunta sobre vencimientos, calcula desde las fechas de próximo pago
8. Ofrece consejos accionables, no solo datos
9. Mantén un tono motivador pero realista
10. Si no tienes suficiente información, pide amablemente más detalles

Responde como si estuvieras conversando con un amigo que quiere mejorar sus finanzas.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text || 'Lo siento, no pude generar una respuesta. Intenta de nuevo.';
  } catch (error: any) {
    console.error('Error con Gemini:', error);

    // Si hay error con Gemini, usar respuesta local como fallback
    if (error.message?.includes('API key') || error.message?.includes('permission')) {
      return '⚠️ Error con la API key de Gemini. Por favor, verifica que tu VITE_GEMINI_API_KEY sea correcta en el archivo .env.local';
    }

    return generateLocalResponse(userMessage, context);
  }
}

// Respuesta local (fallback cuando Gemini no está disponible)
function generateLocalResponse(
  userMessage: string,
  context: {
    debts: Debt[];
    transactions: Transaction[];
    summary: FinancialSummary;
  }
): string {
  const lowerMessage = userMessage.toLowerCase();
  const { debts, summary } = context;

  // Respuesta de bienvenida
  if (lowerMessage.includes('hola') || lowerMessage.includes('buenos') || lowerMessage.includes('buenas')) {
    return `¡Hola! 👋 Soy tu asistente financiero personal.

Puedo ayudarte con:
• 📅 Recordarte vencimientos de tarjetas
• 📊 Analizar tus gastos
• 💡 Darte consejos para salir de deudas  
• 📈 Revisar tu situación financiera

¿Qué necesitas saber?`;
  }

  // Consulta de deudas
  if (lowerMessage.includes('debo') || lowerMessage.includes('deuda') || lowerMessage.includes('debo en total')) {
    const totalDebt = debts.reduce((sum, d) => sum + d.totalAmount, 0);
    const monthlyPayments = debts.reduce((sum, d) => sum + d.monthlyPayment, 0);

    if (debts.length === 0) {
      return '🎉 ¡Excelente! No tienes deudas registradas. Sigue así manteniendo tus finanzas saludables.';
    }

    let response = `📊 **Resumen de tus deudas:**\n\n`;
    response += `• Total adeudado: **$${totalDebt.toLocaleString('es-AR')}**\n`;
    response += `• Pago mensual total: **$${monthlyPayments.toLocaleString('es-AR')}**\n`;
    response += `• Tarjetas activas: **${debts.length}**\n\n`;

    response += `**Detalle por tarjeta:**\n`;
    debts.forEach(debt => {
      const remaining = debt.monthlyPayment * debt.remainingInstallments;
      response += `• ${debt.name}: $${remaining.toLocaleString('es-AR')} restantes\n`;
    });

    if (monthlyPayments > summary.totalIncome * 0.3) {
      response += `\n⚠️ **Alerta:** Tus pagos de deuda superan el 30% de tus ingresos.`;
    } else {
      response += `\n✅ Tus deudas están bajo control.`;
    }

    return response;
  }

  // Vencimientos
  if (lowerMessage.includes('vencimiento') || lowerMessage.includes('cuando') || lowerMessage.includes('cuándo pago')) {
    const today = new Date();
    const reminders = debts
      .filter(d => d.remainingInstallments > 0)
      .map(debt => {
        const dueDate = new Date(debt.nextPaymentDate);
        const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { name: debt.name, daysUntil, amount: debt.monthlyPayment, dueDate };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);

    if (reminders.length === 0) {
      return '🎉 No tienes vencimientos próximos. ¡Qué alivio!';
    }

    let response = `📅 **Próximos vencimientos:**\n\n`;
    reminders.forEach(r => {
      if (r.daysUntil < 0) {
        response += `🔴 **${r.name}**: VENCIDO hace ${Math.abs(r.daysUntil)} días - $${r.amount.toLocaleString('es-AR')}\n`;
      } else if (r.daysUntil === 0) {
        response += `🔴 **${r.name}**: **HOY** - $${r.amount.toLocaleString('es-AR')}\n`;
      } else if (r.daysUntil <= 3) {
        response += `🟠 **${r.name}**: En ${r.daysUntil} días - $${r.amount.toLocaleString('es-AR')}\n`;
      } else if (r.daysUntil <= 7) {
        response += `🟡 **${r.name}**: En ${r.daysUntil} días (${r.dueDate.toLocaleDateString('es-AR')})\n`;
      } else {
        response += `🟢 **${r.name}**: ${r.dueDate.toLocaleDateString('es-AR')}\n`;
      }
    });

    return response;
  }

  // Salir de deudas
  if (lowerMessage.includes('salir') || lowerMessage.includes('eliminar') || lowerMessage.includes('pagar deudas')) {
    return `💡 **Estrategias para salir de deudas:**

**1. Método Bola de Nieve 🌨️**
Paga primero la deuda más pequeña. Te dará motivación ver resultados rápidos.

**2. Método Avalancha 🏔️**  
Paga primero la deuda con mayor tasa de interés. Ahorrarás más dinero.

**3. Para tus tarjetas específicas:**
${debts.filter(d => d.name.toLowerCase().includes('naranja')).length > 0 ? '• **Naranja**: Usa Plan Z 3 sin interés cuando puedas\n' : ''}${debts.filter(d => d.name.toLowerCase().includes('nativa') || d.name.toLowerCase().includes('master')).length > 0 ? '• **Nativa/Mastercard**: Paga el total siempre para evitar intereses\n' : ''}
**4. Consejos adicionales:**
• No uses las tarjetas hasta saldarlas
• Crea un presupuesto estricto
• Busca ingresos extras para acelerar pagos`;
  }

  // Naranja específica
  if (lowerMessage.includes('naranja') || lowerMessage.includes('plan z')) {
    const naranjaDebt = debts.find(d => d.name.toLowerCase().includes('naranja'));

    if (!naranjaDebt) {
      return `ℹ️ No tengo registrada una deuda con Tarjeta Naranja.

**Consejos para Naranja:**
• **Plan Z 3**: Sin interés, ideal si podés pagar en 3 cuotas
• **Plan Z 6, 9, 12**: Tienen interés, usalos solo si es necesario
• **1 pago**: Sin interés, la mejor opción si tenés el dinero`;
    }

    return `💳 **Tu Tarjeta Naranja:**

Saldo total: **$${naranjaDebt.totalAmount.toLocaleString('es-AR')}**
Cuota mensual: **$${naranjaDebt.monthlyPayment.toLocaleString('es-AR')}**
Cuotas restantes: **${naranjaDebt.remainingInstallments}**

**Recomendación:**
Si no podés pagar en 1 cuota, el **Plan Z 3 es tu mejor opción** (sin interés).
Evita los planes Z 6, 9 y 12 que tienen intereses altos.

¿Necesitás ayuda para decidir cómo pagar?`;
  }

  // Balance/Resumen general
  if (lowerMessage.includes('balance') || lowerMessage.includes('resumen') || lowerMessage.includes('situación')) {
    return `📊 **Tu situación financiera:**

💰 **Ingresos:** $${summary.totalIncome.toLocaleString('es-AR')}
💸 **Gastos:** $${summary.totalExpenses.toLocaleString('es-AR')}
📈 **Balance:** $${summary.balance.toLocaleString('es-AR')}
💾 **Tasa de ahorro:** ${summary.savingsRate.toFixed(1)}%
💳 **Deuda/Ingreso:** ${summary.debtToIncomeRatio.toFixed(1)}%

${summary.savingsRate >= 20 ? '✅ ¡Excelente! Estás ahorrando más del 20%.' : summary.savingsRate >= 10 ? '⚡ Bien, pero intenta llegar al 20% de ahorro.' : '⚠️ Alerta: Tu tasa de ahorro es baja.'}
${summary.debtToIncomeRatio > 30 ? '⚠️ Tus deudas consumen más del 30% de tus ingresos.' : '✅ Tus deudas están en un nivel manejable.'}`;
  }

  // Predicción de gastos
  if (lowerMessage.includes('próximo mes') || lowerMessage.includes('proximo mes') || lowerMessage.includes('predicción') || lowerMessage.includes('prediccion')) {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentExpenses = context.transactions.filter((t: Transaction) =>
      t.type === 'expense' && new Date(t.date) >= threeMonthsAgo
    );

    const avgMonthlyExpense = recentExpenses.length > 0
      ? recentExpenses.reduce((sum: number, t: Transaction) => sum + t.amount, 0) / 3
      : summary.totalExpenses;

    const monthlyDebtPayments = debts.reduce((sum: number, d: Debt) => sum + d.monthlyPayment, 0);
    const predictedExpenses = avgMonthlyExpense + monthlyDebtPayments;
    const predictedBalance = summary.totalIncome - predictedExpenses;

    return `🔮 **Pronóstico para ${nextMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}:**

📥 Ingresos estimados: **$${summary.totalIncome.toLocaleString('es-AR')}**
📤 Gastos estimados: **$${predictedExpenses.toLocaleString('es-AR')}**
  • Gastos variables: ~$${Math.round(avgMonthlyExpense).toLocaleString('es-AR')}
  • Pagos de deuda: $${monthlyDebtPayments.toLocaleString('es-AR')}
💰 Balance proyectado: **$${predictedBalance.toLocaleString('es-AR')}**

${predictedBalance < 0 ? '⚠️ **Alerta:** Proyectas gastos mayores a ingresos. Revisa tus gastos.' : predictedBalance < summary.totalIncome * 0.1 ? '⚡ Atención: Tu margen de ahorro será muy bajo.' : '✅ Tus finanzas van bien el próximo mes.'}`;
  }

  // Ayuda
  if (lowerMessage.includes('ayuda') || lowerMessage.includes('help') || lowerMessage.includes('qué puedes')) {
    return `🤖 **Puedo ayudarte con:**

📅 **Recordatorios** - "¿Cuándo vence mi tarjeta?"
📊 **Predicciones** - "¿Cuánto gastaré el próximo mes?"
💳 **Deudas** - "¿Cuánto debo en total?"
💡 **Consejos** - "¿Cómo salgo de deudas?"
📈 **Análisis** - "¿Cómo están mis finanzas?"

Simplemente escribime lo que necesitás.`;
  }

  // Respuesta por defecto inteligente
  return `Entiendo que preguntás sobre "${userMessage}".

Basándome en tu situación actual:
• Balance: $${summary.balance.toLocaleString('es-AR')}
• Deudas: ${debts.length} tarjeta(s)
• Tasa de ahorro: ${summary.savingsRate.toFixed(1)}%

¿Podrías ser más específico? Podés preguntarme:
• "¿Cuándo vencen mis tarjetas?"
• "¿Cuánto debo en total?"
• "¿Cómo salgo de deudas?"
• "¿Cuál es mi balance?"`;
}

// Analizar PDF - versión simplificada
export async function analyzePDFWithGemini(file: File): Promise<{
  cardName: string;
  totalBalance: number;
  minimumPayment: number;
  dueDate: string;
  transactions: { description: string; amount: number }[];
}> {
  // Si Gemini está disponible, usarlo para análisis más inteligente
  const genAI = getGenAI();
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      // Leer el archivo como base64 de forma segura (evitando stack overflow en archivos grandes)
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: file.type || 'application/pdf',
          },
        },
        {
          text: `Analiza este resumen de tarjeta de crédito (típico de Argentina/Latam).
          
          OBJETIVO: Extraer datos financieros exactos para JSON.

          REGLAS DE MONEDA:
          - En este documento, $ 10.000,00 significa diez mil. (Punto = miles, Coma = decimales).
          - Para el JSON, conviértelo a formato numérico estándar (punto = decimales, sin separador de miles). 
          - Ejemplo: "$ 1.500,50" -> 1500.50
          - Ejemplo: "12000" -> 12000

          BUSCA ESTOS CAMPOS:
          1. Nombre de la tarjeta (Visa, Mastercard, Naranja, Cabal, etc.).
          2. Saldo TOTAL a pagar (Busca: "Saldo Actual", "Pago Total", "Total a Pagar", "Importe a Pagar", "Saldo del Periodo"). NO confundir con "Pago Mínimo" a menos que sea el único valor.
          3. Pago Mínimo (Busca: "Pago Mínimo", "Mínimo a Pagar").
          4. Fecha de vencimiento (Formato YYYY-MM-DD).
          5. Transacciones (máximo las 10 más relevantes/recientes).

          Responde SOLO en formato JSON válido:
          {
            "cardName": "Nombre Detectado",
            "totalBalance": 0.00,
            "minimumPayment": 0.00,
            "dueDate": "YYYY-MM-DD",
            "transactions": [{"description": "Compra Ejemplo", "amount": 0.00}]
          }
          `,
        },
      ]);

      const response = await result.response;
      const text = response.text();

      console.log('Gemini Raw Response:', text); // Para debugging en consola del usuario

      // Extraer JSON de la respuesta (buscando el primer { y el último })
      const jsonStartIndex = text.indexOf('{');
      const jsonEndIndex = text.lastIndexOf('}') + 1;

      if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
        const jsonString = text.substring(jsonStartIndex, jsonEndIndex);
        const parsed = JSON.parse(jsonString);

        return {
          cardName: parsed.cardName || 'Tarjeta de Crédito',
          totalBalance: typeof parsed.totalBalance === 'number' ? parsed.totalBalance : parseFloat(parsed.totalBalance) || 0,
          minimumPayment: typeof parsed.minimumPayment === 'number' ? parsed.minimumPayment : parseFloat(parsed.minimumPayment) || 0,
          dueDate: parsed.dueDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        };
      }
    } catch (error) {
      console.error('Error analizando PDF con Gemini:', error);
      // Continuar con análisis local como fallback
    }
  }

  // Análisis local fallback
  return analyzePDFFallback(file);
}

// Análisis de PDF local (fallback)
async function analyzePDFFallback(file: File): Promise<{
  cardName: string;
  totalBalance: number;
  minimumPayment: number;
  dueDate: string;
  transactions: { description: string; amount: number }[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const fileName = file.name.toLowerCase();
        let cardName = 'Tarjeta de Crédito';

        if (fileName.includes('naranja')) cardName = 'Tarjeta Naranja';
        else if (fileName.includes('visa')) cardName = 'Visa';
        else if (fileName.includes('master')) cardName = 'Mastercard';
        else if (fileName.includes('nativa')) cardName = 'Tarjeta Nativa';
        else if (fileName.includes('mercado')) cardName = 'Mercado Pago';
        else if (fileName.includes('cabal')) cardName = 'Tarjeta Cabal';

        const result = {
          cardName,
          totalBalance: 0,
          minimumPayment: 0,
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          transactions: [] as { description: string; amount: number }[],
        };

        // Intentar extraer números del contenido
        const content = reader.result as string;
        const numbers = content.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);

        if (numbers && numbers.length > 0) {
          const parsedNumbers = numbers.map(n =>
            parseFloat(n.replace(/\./g, '').replace(',', '.'))
          ).filter(n => !isNaN(n) && n > 0);

          if (parsedNumbers.length > 0) {
            result.totalBalance = Math.max(...parsedNumbers);
            result.minimumPayment = Math.round(result.totalBalance * 0.1);
          }
        }

        resolve(result);
      } catch (error) {
        reject(new Error('Error al leer el PDF'));
      }
    };

    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsText(file);
  });
}

// Generar consejos personalizados
export async function generateFinancialAdvice(
  debts: Debt[],
  summary: FinancialSummary
): Promise<string[]> {
  // Si Gemini está disponible, usarlo para consejos más inteligentes
  const genAI = getGenAI();
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `Basándote en estos datos financieros, genera 3 consejos cortos y accionables:

DATOS:
- Ingresos: $${summary.totalIncome}
- Gastos: $${summary.totalExpenses}
- Balance: $${summary.balance}
- Tasa de ahorro: ${summary.savingsRate.toFixed(1)}%
- Deuda/Ingreso: ${summary.debtToIncomeRatio.toFixed(1)}%
- Deudas: ${debts.map(d => `${d.name} ($${d.totalAmount})`).join(', ') || 'Ninguna'}

Responde solo con los 3 consejos, uno por línea, empezando con emoji.`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      return text.split('\n').filter(line => line.trim().length > 0).slice(0, 3);
    } catch (error) {
      console.error('Error generando consejos con Gemini:', error);
    }
  }

  // Fallback local
  const advice: string[] = [];

  if (summary.savingsRate >= 20) {
    advice.push('✅ ¡Excelente! Estás ahorrando más del 20%. Mantené este hábito.');
  } else if (summary.savingsRate >= 10) {
    advice.push('⚡ Estás ahorrando bien, pero intentá llegar al 20%.');
  } else {
    advice.push('💰 Intentá ahorrar al menos el 10% de tus ingresos.');
  }

  const debtRatio = summary.debtToIncomeRatio;
  if (debtRatio > 40) {
    advice.push('🚨 Tus deudas superan el 40% de tus ingresos. Priorizá pagarlas urgentemente.');
  } else if (debtRatio > 20) {
    advice.push('⚠️ Tus deudas son significativas. Intentá no contraer más.');
  } else {
    advice.push('✅ Tus deudas están bajo control. Seguí así.');
  }

  const naranja = debts.find(d => d.name.toLowerCase().includes('naranja'));
  if (naranja) {
    advice.push('💳 Para Naranja: usá el Plan Z 3 sin interés cuando puedas.');
  }

  return advice.slice(0, 3);
}
