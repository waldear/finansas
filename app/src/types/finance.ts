export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string;
  date: string;
  createdAt: string;
}

export interface Debt {
  id: string;
  name: string;
  totalAmount: number;
  monthlyPayment: number;
  remainingInstallments: number;
  totalInstallments: number;
  category: 'credit_card' | 'loan' | 'other';
  nextPaymentDate: string;
  createdAt: string;
  // Campos específicos para tarjetas
  cardType?: 'naranja' | 'nativa' | 'mastercard' | 'visa' | 'mercado_pago' | 'other';
  paymentPlan?: 'full' | 'z3' | 'z6' | 'z9' | 'z12' | 'minimum';
  hasInterest?: boolean;
  interestRate?: number;
  statementDate?: string;
  dueDate?: string;
  isPaidOff?: boolean;
}

// Planes de pago específicos para tarjetas argentinas
export const PAYMENT_PLANS = {
  naranja: [
    { id: 'z3', name: 'Plan Z 3 (Sin interés)', installments: 3, hasInterest: false },
    { id: 'z6', name: 'Plan Z 6', installments: 6, hasInterest: true },
    { id: 'z9', name: 'Plan Z 9', installments: 9, hasInterest: true },
    { id: 'z12', name: 'Plan Z 12', installments: 12, hasInterest: true },
    { id: 'full', name: '1 Pago (Sin interés)', installments: 1, hasInterest: false },
  ],
  other: [
    { id: 'full', name: 'Pago Total (Sin interés)', installments: 1, hasInterest: false },
    { id: 'minimum', name: 'Pago Mínimo (Con interés)', installments: 1, hasInterest: true },
  ],
} as const;

// Tarjetas específicas de Argentina
export const ARGENTINA_CARDS = [
  { id: 'naranja', name: 'Tarjeta Naranja', color: '#ff6600', hasZPlans: true },
  { id: 'nativa', name: 'Tarjeta Nativa', color: '#00a650', hasZPlans: false },
  { id: 'mastercard', name: 'Mastercard', color: '#eb001b', hasZPlans: false },
  { id: 'visa', name: 'Visa', color: '#1a1f71', hasZPlans: false },
  { id: 'mercado_pago', name: 'Mercado Pago', color: '#00b1ea', hasZPlans: false },
  { id: 'cabal', name: 'Tarjeta Cabal', color: '#9333ea', hasZPlans: false },
  { id: 'other', name: 'Otra Tarjeta', color: '#6b7280', hasZPlans: false },
] as const;

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}

export interface BudgetRecommendation {
  category: string;
  currentAmount: number;
  recommendedAmount: number;
  percentage: number;
  message: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  savingsRate: number;
  debtToIncomeRatio: number;
}

export interface PaymentReminder {
  id: string;
  debtId: string;
  name: string;
  amount: number;
  dueDate: string;
  isPaid: boolean;
}

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'housing', name: 'Vivienda (Alquiler)', type: 'expense', color: '#3b82f6', icon: 'Home' },
  { id: 'utilities', name: 'Servicios (Luz, Agua, Gas)', type: 'expense', color: '#f59e0b', icon: 'Zap' },
  { id: 'internet', name: 'Internet y Telefonía', type: 'expense', color: '#8b5cf6', icon: 'Wifi' },
  { id: 'food', name: 'Alimentación', type: 'expense', color: '#10b981', icon: 'ShoppingCart' },
  { id: 'transport', name: 'Transporte', type: 'expense', color: '#ef4444', icon: 'Car' },
  { id: 'insurance', name: 'Seguros', type: 'expense', color: '#6366f1', icon: 'Shield' },
  { id: 'health', name: 'Salud', type: 'expense', color: '#ec4899', icon: 'Heart' },
  { id: 'education', name: 'Educación', type: 'expense', color: '#14b8a6', icon: 'BookOpen' },
  { id: 'entertainment', name: 'Entretenimiento', type: 'expense', color: '#f97316', icon: 'Film' },
  { id: 'shopping', name: 'Compras', type: 'expense', color: '#84cc16', icon: 'ShoppingBag' },
  { id: 'debt', name: 'Deudas y Cuotas', type: 'expense', color: '#dc2626', icon: 'CreditCard' },
  { id: 'other', name: 'Otros', type: 'expense', color: '#6b7280', icon: 'MoreHorizontal' },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: 'Sueldo', type: 'income', color: '#10b981', icon: 'Briefcase' },
  { id: 'extra', name: 'Ingresos Extra', type: 'income', color: '#3b82f6', icon: 'PlusCircle' },
  { id: 'investment', name: 'Inversiones', type: 'income', color: '#8b5cf6', icon: 'TrendingUp' },
  { id: 'gift', name: 'Regalos/Donaciones', type: 'income', color: '#f59e0b', icon: 'Gift' },
  { id: 'other_income', name: 'Otros Ingresos', type: 'income', color: '#6b7280', icon: 'MoreHorizontal' },
];

export const DEBT_CATEGORIES = [
  { id: 'credit_card', name: 'Tarjeta de Crédito', color: '#dc2626' },
  { id: 'loan', name: 'Préstamo', color: '#f59e0b' },
  { id: 'other', name: 'Otro', color: '#6b7280' },
] as const;

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  category: 'emergency_fund' | 'vacation' | 'home' | 'car' | 'education' | 'retirement' | 'other';
  color: string;
  icon: string;
  createdAt: string;
  isCompleted: boolean;
}

export const SAVINGS_GOAL_TYPES = [
  { id: 'emergency_fund', name: 'Fondo de Emergencia', color: '#ef4444', icon: 'Shield' },
  { id: 'vacation', name: 'Vacaciones', color: '#0ea5e9', icon: 'Plane' },
  { id: 'home', name: 'Casa/Departamento', color: '#8b5cf6', icon: 'Home' },
  { id: 'car', name: 'Auto', color: '#f59e0b', icon: 'Car' },
  { id: 'education', name: 'Educación', color: '#10b981', icon: 'BookOpen' },
  { id: 'retirement', name: 'Jubilación', color: '#6366f1', icon: 'TrendingUp' },
  { id: 'other', name: 'Otro', color: '#6b7280', icon: 'Target' },
] as const;
