import type { Debt, Transaction, FinancialSummary } from '@/types/finance';

export interface AssistantMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actions?: AssistantAction[];
}

export interface AssistantAction {
  id: string;
  label: string;
  action: string;
  data?: unknown;
}

export interface PaymentReminder {
  debtName: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  message: string;
}

export interface ExpensePrediction {
  category: string;
  predictedAmount: number;
  confidence: number;
  basedOn: string;
  trend: 'up' | 'down' | 'stable';
}

export interface MonthlyForecast {
  month: string;
  predictedIncome: number;
  predictedExpenses: number;
  predictedBalance: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

// Generar recordatorios de pagos
export function generatePaymentReminders(debts: Debt[]): PaymentReminder[] {
  const today = new Date();
  const reminders: PaymentReminder[] = [];

  debts.forEach(debt => {
    if (debt.remainingInstallments <= 0 || debt.isPaidOff) return;

    const dueDate = new Date(debt.nextPaymentDate);
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    let urgency: PaymentReminder['urgency'] = 'low';
    let message = '';

    if (daysUntilDue < 0) {
      urgency = 'critical';
      message = `¡VENCIDO! ${debt.name} venció hace ${Math.abs(daysUntilDue)} días. Paga urgentemente para evitar más intereses.`;
    } else if (daysUntilDue === 0) {
      urgency = 'critical';
      message = `¡HOY vence ${debt.name}! No olvides realizar el pago de ${formatCurrency(debt.monthlyPayment)}.`;
    } else if (daysUntilDue <= 3) {
      urgency = 'high';
      message = `${debt.name} vence en ${daysUntilDue} días. Monto: ${formatCurrency(debt.monthlyPayment)}`;
    } else if (daysUntilDue <= 7) {
      urgency = 'medium';
      message = `${debt.name} vence el ${dueDate.toLocaleDateString('es-AR')}. Preparate para pagar ${formatCurrency(debt.monthlyPayment)}`;
    } else if (daysUntilDue <= 15) {
      urgency = 'low';
      message = `${debt.name} - Próximo vencimiento: ${dueDate.toLocaleDateString('es-AR')}`;
    }

    if (message) {
      reminders.push({
        debtName: debt.name,
        amount: debt.monthlyPayment,
        dueDate: debt.nextPaymentDate,
        daysUntilDue,
        urgency,
        message,
      });
    }
  });

  return reminders.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

// Predecir gastos del próximo mes
export function predictNextMonthExpenses(
  transactions: Transaction[],
  debts: Debt[]
): ExpensePrediction[] {
  const predictions: ExpensePrediction[] = [];
  const now = new Date();
  const last3Months = new Date(now.getFullYear(), now.getMonth() - 3, 1);

  // Agrupar transacciones por categoría
  const categoryTotals: Record<string, number[]> = {};
  
  transactions
    .filter(t => t.type === 'expense' && new Date(t.date) >= last3Months)
    .forEach(t => {
      if (!categoryTotals[t.category]) {
        categoryTotals[t.category] = [];
      }
      categoryTotals[t.category].push(t.amount);
    });

  // Calcular promedios y tendencias
  Object.entries(categoryTotals).forEach(([category, amounts]) => {
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const lastMonth = amounts.slice(-5).reduce((a, b) => a + b, 0) / Math.min(amounts.length, 5);
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (lastMonth > avg * 1.1) trend = 'up';
    else if (lastMonth < avg * 0.9) trend = 'down';

    const confidence = Math.min(amounts.length / 3, 1) * 100;

    predictions.push({
      category,
      predictedAmount: Math.round(avg),
      confidence,
      basedOn: `${amounts.length} transacciones`,
      trend,
    });
  });

  // Agregar deudas como predicción fija
  debts.forEach(debt => {
    if (debt.remainingInstallments > 0) {
      predictions.push({
        category: 'debt',
        predictedAmount: debt.monthlyPayment,
        confidence: 100,
        basedOn: `Cuota fija de ${debt.name}`,
        trend: 'stable',
      });
    }
  });

  return predictions.sort((a, b) => b.predictedAmount - a.predictedAmount);
}

// Generar pronóstico mensual completo
export function generateMonthlyForecast(
  transactions: Transaction[],
  debts: Debt[],
  summary: FinancialSummary
): MonthlyForecast {
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  
  const predictions = predictNextMonthExpenses(transactions, debts);
  const predictedExpenses = predictions.reduce((sum, p) => sum + p.predictedAmount, 0);
  const predictedIncome = summary.totalIncome; // Asumimos ingresos similares
  const predictedBalance = predictedIncome - predictedExpenses;

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  const recommendations: string[] = [];

  if (predictedBalance < 0) {
    riskLevel = 'high';
    recommendations.push('⚠️ Alerta: Proyectas gastos mayores a tus ingresos. Revisa tus gastos discrecionales.');
  } else if (predictedBalance < predictedIncome * 0.1) {
    riskLevel = 'medium';
    recommendations.push('⚡ Atención: Tu margen de ahorro será muy bajo. Intenta reducir gastos.');
  }

  // Análisis de deudas
  const totalDebtPayments = debts.reduce((sum, d) => sum + d.monthlyPayment, 0);
  if (totalDebtPayments > predictedIncome * 0.3) {
    recommendations.push('💳 Tus pagos de deuda superan el 30% de tus ingresos. Prioriza pagar las de mayor interés.');
  }

  // Recomendaciones basadas en tendencias
  const increasingCategories = predictions.filter(p => p.trend === 'up');
  if (increasingCategories.length > 0) {
    recommendations.push(`📈 Tienes categorías con gastos crecientes: ${increasingCategories.map(c => c.category).join(', ')}`);
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ ¡Buenas noticias! Tus finanzas van por buen camino el próximo mes.');
    recommendations.push('💡 Considera aumentar tu fondo de emergencia o invertir el excedente.');
  }

  return {
    month: nextMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
    predictedIncome,
    predictedExpenses,
    predictedBalance,
    riskLevel,
    recommendations,
  };
}

// Generar respuesta del asistente
export function generateAssistantResponse(
  userMessage: string,
  context: {
    debts: Debt[];
    transactions: Transaction[];
    summary: FinancialSummary;
  }
): string {
  const lowerMessage = userMessage.toLowerCase();
  const { debts, summary } = context;

  // Saludos
  if (lowerMessage.includes('hola') || lowerMessage.includes('buenos días') || lowerMessage.includes('buenas')) {
    return `¡Hola! 👋 Soy tu asistente financiero. ¿En qué puedo ayudarte hoy?

Puedo:
• 📅 Recordarte vencimientos de tarjetas
• 📊 Predecir tus gastos del próximo mes
• 💡 Darte consejos para salir de deudas
• 📈 Analizar tu situación financiera

¿Qué necesitas?`;
  }

  // Consulta de deudas
  if (lowerMessage.includes('deuda') || lowerMessage.includes('debo') || lowerMessage.includes('debo pagar')) {
    const totalDebt = debts.reduce((sum, d) => sum + d.totalAmount, 0);
    const monthlyPayments = debts.reduce((sum, d) => sum + d.monthlyPayment, 0);
    
    if (debts.length === 0) {
      return '¡Excelente! 🎉 No tienes deudas registradas. Sigue así manteniendo tus finanzas saludables.';
    }

    let response = `📊 **Resumen de tus deudas:**\n\n`;
    response += `• Total adeudado: ${formatCurrency(totalDebt)}\n`;
    response += `• Pago mensual total: ${formatCurrency(monthlyPayments)}\n`;
    response += `• Tarjetas activas: ${debts.length}\n\n`;
    
    response += `**Detalle por tarjeta:**\n`;
    debts.forEach(debt => {
      const remaining = debt.monthlyPayment * debt.remainingInstallments;
      response += `• ${debt.name}: ${formatCurrency(remaining)} restantes (${debt.remainingInstallments} cuotas)\n`;
    });

    response += `\n💡 **Consejo:** `;
    if (monthlyPayments > summary.totalIncome * 0.3) {
      response += 'Tus pagos de deuda superan el 30% de tus ingresos. Considera consolidar o renegociar.';
    } else {
      response += 'Tus deudas están bajo control. Prioriza pagar las de mayor interés primero.';
    }

    return response;
  }

  // Vencimientos
  if (lowerMessage.includes('vencimiento') || lowerMessage.includes('cuándo') || lowerMessage.includes('cuando pago')) {
    const reminders = generatePaymentReminders(debts);
    
    if (reminders.length === 0) {
      return 'No tienes vencimientos próximos. ¡Qué alivio! 🎉';
    }

    let response = `📅 **Próximos vencimientos:**\n\n`;
    reminders.slice(0, 5).forEach(r => {
      const emoji = r.urgency === 'critical' ? '🔴' : r.urgency === 'high' ? '🟠' : r.urgency === 'medium' ? '🟡' : '🟢';
      response += `${emoji} ${r.message}\n\n`;
    });

    return response;
  }

  // Predicción de gastos
  if (lowerMessage.includes('próximo mes') || lowerMessage.includes('predicción') || lowerMessage.includes('gastos')) {
    const forecast = generateMonthlyForecast(context.transactions, debts, summary);
    
    let response = `🔮 **Pronóstico para ${forecast.month}:**\n\n`;
    response += `📥 Ingresos estimados: ${formatCurrency(forecast.predictedIncome)}\n`;
    response += `📤 Gastos estimados: ${formatCurrency(forecast.predictedExpenses)}\n`;
    response += `💰 Balance proyectado: ${formatCurrency(forecast.predictedBalance)}\n`;
    response += `⚠️ Nivel de riesgo: ${forecast.riskLevel === 'high' ? 'Alto 🔴' : forecast.riskLevel === 'medium' ? 'Medio 🟡' : 'Bajo 🟢'}\n\n`;
    
    response += `**Recomendaciones:**\n`;
    forecast.recommendations.forEach(rec => {
      response += `• ${rec}\n`;
    });

    return response;
  }

  // Consejos para salir de deudas
  if (lowerMessage.includes('salir de deudas') || lowerMessage.includes('pagar deudas') || lowerMessage.includes('eliminar deudas')) {
    return `💡 **Estrategia para salir de deudas:**\n\n` +
      `**1. Método Bola de Nieve 🌨️**\n` +
      `   Paga primero la deuda más pequeña. Te dará motivación ver resultados rápidos.\n\n` +
      `**2. Método Avalancha 🏔️**\n` +
      `   Paga primero la deuda con mayor tasa de interés. Ahorrarás más dinero a largo plazo.\n\n` +
      `**3. Para tu caso específico:**\n` +
      `   • Naranja: Usa el Plan Z 3 sin interés cuando puedas\n` +
      `   • Nativa y Mastercard: Paga el total siempre para evitar intereses\n\n` +
      `**4. Consejos adicionales:**\n` +
      `   • No uses las tarjetas hasta saldarlas\n` +
      `   • Crea un presupuesto estricto\n` +
      `   • Busca ingresos extras para acelerar los pagos\n\n` +
      `¿Quieres que analice cuál método te conviene más?`;
  }

  // Naranja específica
  if (lowerMessage.includes('naranja') || lowerMessage.includes('plan z')) {
    const naranjaDebt = debts.find(d => d.name.toLowerCase().includes('naranja'));
    
    if (!naranjaDebt) {
      return `ℹ️ No tengo registrada una deuda con Tarjeta Naranja.\n\n` +
        `**Consejos para Naranja:**\n` +
        `• Plan Z 3: Sin interés, ideal si podés pagar en 3 cuotas\n` +
        `• Plan Z 6, 9, 12: Tienen interés, usalos solo si es necesario\n` +
        `• 1 pago: Sin interés, la mejor opción si tenés el dinero\n\n` +
        `¿Querés agregar tu deuda de Naranja?`;
    }

    return `💳 **Tu Tarjeta Naranja:**\n\n` +
      `Saldo total: ${formatCurrency(naranjaDebt.totalAmount)}\n` +
      `Cuota mensual: ${formatCurrency(naranjaDebt.monthlyPayment)}\n` +
      `Cuotas restantes: ${naranjaDebt.remainingInstallments}\n\n` +
      `**Recomendación:**\n` +
      `Si no podés pagar en 1 cuota, el Plan Z 3 es tu mejor opción (sin interés).\n` +
      `Evita los planes Z 6, 9 y 12 que tienen intereses altos.\n\n` +
      `¿Necesitás ayuda para decidir cómo pagar?`;
  }

  // Ayuda general
  if (lowerMessage.includes('ayuda') || lowerMessage.includes('qué puedes hacer') || lowerMessage.includes('help')) {
    return `🤖 **Puedo ayudarte con:**\n\n` +
      `📅 **Recordatorios** - "¿Cuándo vence mi tarjeta?"\n` +
      `📊 **Predicciones** - "¿Cuánto gastaré el próximo mes?"\n` +
      `💳 **Deudas** - "¿Cuánto debo en total?"\n` +
      `💡 **Consejos** - "¿Cómo salgo de deudas?"\n` +
      `📈 **Análisis** - "¿Cómo están mis finanzas?"\n\n` +
      `Simplemente escribime lo que necesitás saber. ¡Estoy aquí para ayudarte!`;
  }

  // Respuesta por defecto
  return `Lo siento, no entendí bien tu consulta. 🤔\n\n` +
    `Podés preguntarme:\n` +
    `• "¿Cuándo vencen mis tarjetas?"\n` +
    `• "¿Cuánto debo en total?"\n` +
    `• "¿Cómo salgo de deudas?"\n` +
    `• "¿Cuánto gastaré el próximo mes?"\n\n` +
    `¿En qué más puedo ayudarte?`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(amount);
}
