import type { Debt, Transaction } from '@/types/finance';

export interface ParsedCardData {
  cardName: string;
  cardType: 'credit_card' | 'debit_card';
  statementDate: string;
  dueDate: string;
  totalBalance: number;
  minimumPayment: number;
  currentPeriodAmount: number;
  previousBalance: number;
  payments: number;
  purchases: number;
  interest: number;
  fees: number;
  availableCredit: number;
  creditLimit: number;
  transactions: ParsedTransaction[];
}

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'purchase' | 'payment' | 'interest' | 'fee';
  installments?: {
    current: number;
    total: number;
  };
}

export interface PaymentRecommendation {
  cardName: string;
  totalBalance: number;
  minimumPayment: number;
  recommendedPayment: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  interestRate?: number;
  estimatedInterestIfMinimum: number;
  savingsIfFull: number;
}

export interface AnalysisResult {
  cards: ParsedCardData[];
  totalDebt: number;
  totalMinimumPayment: number;
  recommendations: PaymentRecommendation[];
  debtsToAdd: Omit<Debt, 'id' | 'createdAt'>[];
  transactionsToAdd: Omit<Transaction, 'id' | 'createdAt'>[];
}

// Simulación de análisis de PDF con IA
// En producción, esto se conectaría a una API de IA
export async function analyzePDF(file: File): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        
        // Análisis simulado del contenido del PDF
        // En producción, aquí iría la llamada a la API de IA
        const result = simulateAIAnalysis(text, file.name);
        resolve(result);
      } catch (error) {
        reject(new Error('Error al analizar el PDF: ' + (error as Error).message));
      }
    };
    
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsText(file);
  });
}

// Función que simula el análisis de IA
function simulateAIAnalysis(text: string, fileName: string): AnalysisResult {
  // Detectar el tipo de tarjeta basado en el nombre del archivo o contenido
  const cardName = detectCardName(fileName, text);
  
  // Extraer montos del texto (simulado)
  const amounts = extractAmounts(text);
  
  // Crear datos parseados
  const parsedCard: ParsedCardData = {
    cardName,
    cardType: 'credit_card',
    statementDate: new Date().toISOString().split('T')[0],
    dueDate: calculateDueDate(15), // 15 días desde hoy
    totalBalance: amounts.totalBalance || 0,
    minimumPayment: amounts.minimumPayment || 0,
    currentPeriodAmount: amounts.currentPeriod || 0,
    previousBalance: amounts.previousBalance || 0,
    payments: amounts.payments || 0,
    purchases: amounts.purchases || 0,
    interest: amounts.interest || 0,
    fees: amounts.fees || 0,
    availableCredit: amounts.availableCredit || 0,
    creditLimit: amounts.creditLimit || 0,
    transactions: generateSampleTransactions(cardName),
  };

  // Generar recomendaciones
  const recommendations = generateRecommendations([parsedCard]);
  
  // Convertir a formato de deudas
  const debtsToAdd = convertToDebts([parsedCard]);
  
  // Convertir transacciones
  const transactionsToAdd = convertToTransactions(parsedCard.transactions);

  return {
    cards: [parsedCard],
    totalDebt: parsedCard.totalBalance,
    totalMinimumPayment: parsedCard.minimumPayment,
    recommendations,
    debtsToAdd,
    transactionsToAdd,
  };
}

function detectCardName(fileName: string, content: string): string {
  const lowerFileName = fileName.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  // Detectar tarjetas argentinas comunes
  if (lowerFileName.includes('naranja') || lowerContent.includes('naranja')) {
    return 'Tarjeta Naranja';
  }
  if (lowerFileName.includes('visa') || lowerContent.includes('visa')) {
    return 'Tarjeta Visa';
  }
  if (lowerFileName.includes('master') || lowerContent.includes('mastercard')) {
    return 'Tarjeta Mastercard';
  }
  if (lowerFileName.includes('amex') || lowerContent.includes('american express')) {
    return 'American Express';
  }
  if (lowerFileName.includes('mercado pago') || lowerContent.includes('mercado pago')) {
    return 'Mercado Pago';
  }
  if (lowerFileName.includes('nativa') || lowerContent.includes('nativa')) {
    return 'Tarjeta Nativa';
  }
  if (lowerFileName.includes('cabal') || lowerContent.includes('cabal')) {
    return 'Tarjeta Cabal';
  }
  
  return 'Tarjeta de Crédito';
}

function extractAmounts(text: string): {
  totalBalance?: number;
  minimumPayment?: number;
  currentPeriod?: number;
  previousBalance?: number;
  payments?: number;
  purchases?: number;
  interest?: number;
  fees?: number;
  availableCredit?: number;
  creditLimit?: number;
} {
  // Buscar patrones de montos en el texto
  // Esto es una simulación - en producción usaría regex más sofisticados
  const amounts: { [key: string]: number } = {};
  
  // Buscar números que parezcan montos (con puntos y comas)
  const amountPattern = /[\d.]+(?:,\d{2})?/g;
  const matches = text.match(amountPattern) || [];
  
  // Convertir a números (formato argentino)
  const numericValues = matches
    .map(m => parseFloat(m.replace(/\./g, '').replace(',', '.')))
    .filter(n => !isNaN(n) && n > 0);
  
  // Asignar valores basados en el contexto (simulado)
  if (numericValues.length > 0) {
    amounts.totalBalance = Math.max(...numericValues);
    amounts.minimumPayment = amounts.totalBalance * 0.1; // 10% aproximado
    amounts.currentPeriod = amounts.totalBalance * 0.3;
    amounts.previousBalance = amounts.totalBalance * 0.7;
    amounts.purchases = amounts.totalBalance * 0.25;
    amounts.interest = amounts.totalBalance * 0.05;
  }
  
  return amounts;
}

function generateSampleTransactions(_cardName: string): ParsedTransaction[] {
  const now = new Date();
  const transactions: ParsedTransaction[] = [];
  
  // Generar algunas transacciones de ejemplo
  const sampleDescriptions = [
    'Supermercado Carrefour',
    'YPF Serviclub',
    'Farmacia',
    'Restaurante',
    'Uber',
    'Netflix',
    'Spotify',
    'Mercado Libre',
  ];
  
  for (let i = 0; i < 5; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - Math.floor(Math.random() * 30));
    
    transactions.push({
      date: date.toISOString().split('T')[0],
      description: sampleDescriptions[Math.floor(Math.random() * sampleDescriptions.length)],
      amount: Math.floor(Math.random() * 50000) + 5000,
      type: 'purchase',
    });
  }
  
  return transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function calculateDueDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

function generateRecommendations(cards: ParsedCardData[]): PaymentRecommendation[] {
  return cards.map(card => {
    const interestRate = 8; // TNA aproximada del 8% mensual
    const estimatedInterestIfMinimum = card.totalBalance * (interestRate / 100);
    
    let recommendedPayment = card.totalBalance;
    let reason = 'Te recomendamos pagar el total para evitar intereses.';
    let priority: 'high' | 'medium' | 'low' = 'high';
    
    if (card.totalBalance > 500000) {
      // Balance alto - prioridad máxima
      recommendedPayment = card.totalBalance;
      reason = 'Tienes un saldo elevado. Pagar el total evitará intereses significativos.';
      priority = 'high';
    } else if (card.interest > 50000) {
      // Intereses altos
      recommendedPayment = card.totalBalance;
      reason = 'Estás pagando muchos intereses. Liquidar la deuda te ahorrará dinero.';
      priority = 'high';
    } else if (card.totalBalance < 100000) {
      // Balance bajo - puede pagar mínimo si es necesario
      recommendedPayment = Math.max(card.minimumPayment * 2, card.totalBalance * 0.5);
      reason = 'Balance manejable. Intenta pagar al menos el 50% si no puedes el total.';
      priority = 'medium';
    }
    
    return {
      cardName: card.cardName,
      totalBalance: card.totalBalance,
      minimumPayment: card.minimumPayment,
      recommendedPayment,
      reason,
      priority,
      interestRate,
      estimatedInterestIfMinimum,
      savingsIfFull: estimatedInterestIfMinimum,
    };
  });
}

function convertToDebts(cards: ParsedCardData[]): Omit<Debt, 'id' | 'createdAt'>[] {
  return cards.map(card => ({
    name: card.cardName,
    totalAmount: card.totalBalance,
    monthlyPayment: card.minimumPayment,
    remainingInstallments: 1, // Se actualizará según el plan de pagos
    totalInstallments: 1,
    category: 'credit_card' as const,
    nextPaymentDate: card.dueDate,
  }));
}

function convertToTransactions(parsedTransactions: ParsedTransaction[]): Omit<Transaction, 'id' | 'createdAt'>[] {
  return parsedTransactions
    .filter(t => t.type === 'purchase')
    .map(t => ({
      type: 'expense' as const,
      amount: t.amount,
      description: t.description,
      category: 'debt',
      date: t.date,
    }));
}

// Función para analizar múltiples PDFs
export async function analyzeMultiplePDFs(files: File[]): Promise<AnalysisResult> {
  const results = await Promise.all(files.map(file => analyzePDF(file)));
  
  // Combinar resultados
  const combined: AnalysisResult = {
    cards: [],
    totalDebt: 0,
    totalMinimumPayment: 0,
    recommendations: [],
    debtsToAdd: [],
    transactionsToAdd: [],
  };
  
  results.forEach(result => {
    combined.cards.push(...result.cards);
    combined.totalDebt += result.totalDebt;
    combined.totalMinimumPayment += result.totalMinimumPayment;
    combined.recommendations.push(...result.recommendations);
    combined.debtsToAdd.push(...result.debtsToAdd);
    combined.transactionsToAdd.push(...result.transactionsToAdd);
  });
  
  // Reordenar recomendaciones por prioridad
  combined.recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
  
  return combined;
}

// Función para obtener consejos de pago estratégico
export function getStrategicPaymentAdvice(
  recommendations: PaymentRecommendation[],
  availableFunds: number
): string {
  const totalRecommended = recommendations.reduce((sum, r) => sum + r.recommendedPayment, 0);
  const totalMinimum = recommendations.reduce((sum, r) => sum + r.minimumPayment, 0);
  
  if (availableFunds >= totalRecommended) {
    return `¡Excelente! Tienes fondos suficientes para pagar todas tus tarjetas al contado. Esto te ahorrará aproximadamente ${new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(recommendations.reduce((sum, r) => sum + r.savingsIfFull, 0))} en intereses.`;
  }
  
  if (availableFunds >= totalMinimum) {
    const highPriorityCards = recommendations.filter(r => r.priority === 'high');
    return `Puedes cubrir los pagos mínimos. Prioriza pagar ${highPriorityCards.length > 0 
      ? highPriorityCards.map(c => c.cardName).join(', ')
      : 'las tarjetas con mayor interés'} para minimizar costos.`;
  }
  
  return 'Tus fondos son insuficientes para cubrir los pagos mínimos. Considera contactar a tus bancos para renegociar o buscar alternativas de financiamiento.';
}
