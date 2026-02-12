import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';
import { sanitizeEnv } from '@/lib/utils';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

export async function POST(req: Request) {
  const logContext = createRequestContext('/api/assistant', 'POST');
  const startedAt = Date.now();
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const geminiApiKey = sanitizeEnv(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYY);

  if (!geminiApiKey) {
    return NextResponse.json({
      text: "El sistema de IA no está configurado (Falta la API Key). Por favor, contacta al administrador del sistema o configura la variable GEMINI_API_KEY."
    });
  }

  try {
    const { message, context } = await req.json();

    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = `
      Eres FinFlow AI, un auditor financiero personal inteligente y autónomo.
      Tu misión es analizar la salud financiera del usuario y ofrecer estrategias claras para mejorarla.

      INSTRUCCIONES CLAVE:
      1. Tono: Profesional, directo, empático y motivador (Español Latinoamericano).
      2. Datos: Basa tus respuestas estrictamente en el contexto financiero proporcionado (balance, ingresos, gastos, deudas).
      3. Proactividad: No solo respondas la pregunta, ofrece un consejo adicional breve si detectas algo crítico (ej. gastos altos en una categoría).
      4. Seguridad: No des consejos de inversión de alto riesgo.

      MODO AUDITORÍA AUTOMÁTICA (Cuando el usuario dice "Analiza mi estado" o similar):
      - Revisa el balance general.
      - Identifica la categoría de mayor gasto.
      - Alerta sobre deudas próximas a vencer.
      - Sugiere un monto de ahorro realista.

      Contexto Financiero:
      - Balance Actual: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.summary.balance)}
      - Ingresos Totales: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.summary.totalIncome)}
      - Gastos Totales: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(context.summary.totalExpenses)}
      - Deudas Pendientes: ${JSON.stringify(context.debts)}
      - Últimos Movimientos: ${JSON.stringify(context.transactions.slice(0, 5))}

      Usuario: "${message}"

      Respuesta (Markdown, breve y accionable):
    `;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();

    logInfo('assistant_response_generated', {
      ...logContext,
      userId: user.id,
      messageLength: typeof message === 'string' ? message.length : 0,
      transactionsInContext: Array.isArray(context?.transactions) ? context.transactions.length : 0,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ text });
  } catch (error: any) {
    logError("assistant_exception", error, {
      ...logContext,
      userId: user.id,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ text: "Lo siento, tuve un problema al procesar tu solicitud. Intenta de nuevo más tarde." });
  }
}
