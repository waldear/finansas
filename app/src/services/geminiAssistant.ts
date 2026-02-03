import type { Debt, Transaction, FinancialSummary } from '@/types/finance';

export interface AssistantMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// Verificar si Gemini está configurado (siempre true ahora que está en backend,
// pero mantenemos la función por compatibilidad)
export function isGeminiAvailable(): boolean {
  return true;
}

// Función principal para generar respuestas vía Backend
export async function generateGeminiResponse(
  userMessage: string,
  context: {
    debts: Debt[];
    transactions: Transaction[];
    summary: FinancialSummary;
  }
): Promise<{ text: string; action?: any }> {
  const { debts, transactions, summary } = context;

  const recentTransactions = transactions
    .slice(0, 10)
    .map(t => `${t.date}: ${t.type === 'income' ? '+' : '-'}$${t.amount} - ${t.description} (${t.category})`)
    .join('\n');

  const debtsInfo = debts.map(d =>
    `- ${d.name}: $${d.totalAmount} total, $${d.monthlyPayment}/mes, ${d.remainingInstallments} cuotas restantes`
  ).join('\n');

  const contextPrompt = `
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

INSTRUCCIONES:
ERES "FinAssistant", un asesor experto y amigable.
Responde en español rioplatense (argentino).

CAPACIDADES DE AGENTE (IMPORTANTE):
Si el usuario te pide registrar, gastar, comprar o ingresar dinero, PUEDES EJECUTAR LA ACCIÓN generando un bloque JSON al final.

FORMATO DE RESPUESTA:
Si solo hablas:
"Tu respuesta en texto aquí..."

Si vas a REGISTRAR una transacción:
"Tu respuesta confirmando la acción...
\`\`\`json
{
  "action": "ADD_TRANSACTION",
  "data": {
    "type": "expense" | "income",
    "amount": 1000,
    "description": "Detalle del gasto",
    "category": "food" | "transport" | "utilities" | "entertainment" | "shopping" | "health" | "housing" | "other",
    "date": "YYYY-MM-DD"
  }
}
\`\`\`"

REGLAS:
- Categorías válidas: food, transport, utilities, entertainment, shopping, health, housing, other.
- Si falta la categoría, infiérela.
- Usa emojis y sé conciso.
`;

  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: contextPrompt }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));

        if (response.status === 429 || response.status === 503) {
          console.warn(`Rate limit hit (Attempt ${attempt + 1}/${maxRetries}). Retrying...`);
          attempt++;
          if (attempt === maxRetries) {
            return { text: `⚠️ El sistema de IA está saturado (Error 429). Por favor espera un minuto e intenta de nuevo.` };
          }
          await new Promise(resolve => setTimeout(resolve, 2000 * Math.pow(2, attempt))); // Exponential backoff
          continue;
        }

        console.error('API Error:', response.status, errorData);
        return { text: `⚠️ Error del sistema: ${response.status} - ${errorData.details || errorData.error || response.statusText}` };
      }

      const data = await response.json();
      let fullText = data.text || 'No pude procesar la respuesta.';

      let action = null;
      const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/);

      if (jsonMatch) {
        try {
          const jsonStr = jsonMatch[1];
          const parsed = JSON.parse(jsonStr);
          if (parsed.action) {
            action = parsed;
            fullText = fullText.replace(jsonMatch[0], '').trim();
          }
        } catch (e) {
          console.error('Error parsing agent action:', e);
        }
      }

      return { text: fullText, action };

    } catch (error: any) {
      console.error('Error calling Gemini API:', error);
      return { text: `⚠️ Error de conexión: ${error.message}` };
    }
  }
  return { text: '⚠️ Error desconocido tras varios intentos.' };
}

// Analizar PDF usando el endpoint del backend
export async function analyzePDFWithGemini(file: File, _password?: string): Promise<{
  cardName: string;
  totalBalance: number;
  minimumPayment: number;
  dueDate: string;
  transactions: {
    description: string;
    amount: number;
  }[];
}> {
  try {
    // 1. Extraer texto del PDF en el backend
    const base64 = await fileToBase64(file);

    // El backend espera { fileData: base64_string }
    const extractResponse = await fetch('/api/analyze-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileData: base64 }),
    });

    if (!extractResponse.ok) {
      throw new Error('Error extrayendo texto del PDF');
    }

    const { text } = await extractResponse.json();

    // 2. Enviar texto a Gemini para análisis
    const analysisPrompt = `
    Analiza el siguiente TEXTO extraído de un resumen de tarjeta de crédito (Arg/Latam).
    
    TEXTO:
    "${text.substring(0, 10000)}" 
    // Truncamos por si es muy largo, Gemini soporta mucho pero por seguridad.

    OBJETIVO: Extraer datos a JSON.
    REGLAS:
    - Busca "Saldo Actual", "Pago Total" como totalBalance.
    - Busca "Pago Mínimo".
    - Busca Fechas.
    - Busca nombre de tarjeta (Visa, Master, Naranja).
    - Extrae lista de transacciones.

    Responde SOLO JSON válido:
    {
      "cardName": "Nombre",
      "totalBalance": 0,
      "minimumPayment": 0,
      "dueDate": "YYYY-MM-DD",
      "transactions": [{"description": "Desc", "amount": 0}]
    }
    `;

    const geminiResponse = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: analysisPrompt }),
    });

    if (!geminiResponse.ok) {
      throw new Error('Error analizando datos con IA');
    }

    const geminiData = await geminiResponse.json();
    let jsonStr = geminiData.text;

    // Limpiar markdown si existe
    jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '');
    const result = JSON.parse(jsonStr);

    return {
      cardName: result.cardName || 'Desconocida',
      totalBalance: Number(result.totalBalance) || 0,
      minimumPayment: Number(result.minimumPayment) || 0,
      dueDate: result.dueDate || new Date().toISOString().split('T')[0],
      transactions: Array.isArray(result.transactions) ? result.transactions : [],
    };

  } catch (error) {
    console.error('Error completo de análisis PDF:', error);
    // Fallback local muy básico si falla el server
    return {
      cardName: 'Error Análisis',
      totalBalance: 0,
      minimumPayment: 0,
      dueDate: new Date().toISOString().split('T')[0],
      transactions: []
    };
  }
}

// Helper para convertir File a Base64
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // reader.result es "data:application/pdf;base64,....", necesitamos solo la parte base64
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// Generar consejos personalizados (vía Backend)
export async function generateFinancialAdvice(
  _debts: Debt[],
  summary: FinancialSummary
): Promise<string[]> {
  const prompt = `
    Basándote en:
    - Ingresos: $${summary.totalIncome}
    - Gastos: $${summary.totalExpenses}
    - Balance: $${summary.balance}
    - Tasa de ahorro: ${summary.savingsRate.toFixed(1)}%
    
    Dame 3 consejos financieros cortos y motivadores en español argentino.
    Responde solo las 3 líneas.
    `;

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.text.split('\n').filter((l: string) => l.trim().length > 0).slice(0, 3);
    }
  } catch (e) {
    console.error(e);
  }

  return [
    "💰 Ahorra al menos 10% de tus ingresos.",
    "📊 Revisa tus gastos hormiga.",
    "💳 Mantén tus deudas bajo control."
  ];
}




