import { z } from 'zod';

export const TransactionTypeSchema = z.enum(['income', 'expense']);
export const RecurringFrequencySchema = z.enum(['weekly', 'biweekly', 'monthly']);

export const TransactionSchema = z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    type: TransactionTypeSchema,
    amount: z.number().positive('El monto debe ser positivo'),
    description: z.string().min(1, 'La descripción es requerida'),
    category: z.string().min(1, 'La categoría es requerida'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    created_at: z.string().optional(),
});

export const ObligationSchema = z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    extraction_id: z.string().uuid().optional().nullable(),
    title: z.string().min(1, 'El título es requerido'),
    amount: z.coerce.number().positive('El monto debe ser positivo'),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    status: z.enum(['pending', 'paid', 'overdue']).default('pending'),
    category: z.string().optional().nullable(),
    minimum_payment: z.coerce.number().optional().nullable(),
});

export const DebtSchema = z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    name: z.string().min(1, 'El nombre es requerido'),
    total_amount: z.number().positive(),
    monthly_payment: z.number().positive(),
    remaining_installments: z.number().int().nonnegative(),
    total_installments: z.number().int().positive(),
    category: z.string(),
    next_payment_date: z.string(),
});

export const SavingsGoalSchema = z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    name: z.string().min(1, 'El nombre es requerido'),
    target_amount: z.number().positive(),
    current_amount: z.number().nonnegative().default(0),
    deadline: z.string().optional().nullable(),
    category: z.string(),
    color: z.string(),
    icon: z.string(),
    is_completed: z.boolean().default(false),
});

export const BudgetSchema = z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    category: z.string().min(1, 'La categoría es requerida'),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)'),
    limit_amount: z.coerce.number().positive('El límite debe ser mayor a 0'),
    alert_threshold: z.coerce.number().min(1).max(100).default(80),
});

export const RecurringTransactionSchema = z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    type: TransactionTypeSchema,
    amount: z.coerce.number().positive('El monto debe ser positivo'),
    description: z.string().min(1, 'La descripción es requerida'),
    category: z.string().min(1, 'La categoría es requerida'),
    frequency: RecurringFrequencySchema,
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    next_run: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
    is_active: z.boolean().default(true),
});

export type Transaction = z.infer<typeof TransactionSchema>;
export type Obligation = z.infer<typeof ObligationSchema>;
export type Debt = z.infer<typeof DebtSchema>;
export type SavingsGoal = z.infer<typeof SavingsGoalSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type RecurringTransaction = z.infer<typeof RecurringTransactionSchema>;
