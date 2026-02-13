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

export const TransactionInputSchema = TransactionSchema.omit({
    id: true,
    user_id: true,
    created_at: true,
});

export const TransactionUpdateSchema = TransactionInputSchema.partial().refine(
    (payload) => Object.keys(payload).length > 0,
    {
        message: 'Debes enviar al menos un campo para actualizar',
    }
);

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

export const DebtInputSchema = DebtSchema.omit({
    id: true,
    user_id: true,
});

export const DebtUpdateSchema = DebtInputSchema.partial().refine(
    (payload) => Object.keys(payload).length > 0,
    {
        message: 'Debes enviar al menos un campo para actualizar',
    }
);

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

export const SavingsGoalInputSchema = SavingsGoalSchema.omit({
    id: true,
    user_id: true,
});

export const SavingsGoalUpdateSchema = SavingsGoalInputSchema.partial().refine(
    (payload) => Object.keys(payload).length > 0,
    {
        message: 'Debes enviar al menos un campo para actualizar',
    }
);

export const BudgetSchema = z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid().optional(),
    category: z.string().min(1, 'La categoría es requerida'),
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de mes inválido (YYYY-MM)'),
    limit_amount: z.coerce.number().positive('El límite debe ser mayor a 0'),
    alert_threshold: z.coerce.number().min(1).max(100).default(80),
});

export const BudgetInputSchema = BudgetSchema.omit({
    id: true,
    user_id: true,
});

export const BudgetUpdateSchema = BudgetInputSchema.partial().refine(
    (payload) => Object.keys(payload).length > 0,
    {
        message: 'Debes enviar al menos un campo para actualizar',
    }
);

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

export const RecurringTransactionInputSchema = RecurringTransactionSchema.omit({
    id: true,
    user_id: true,
});

export const RecurringTransactionUpdateSchema = RecurringTransactionInputSchema.partial().refine(
    (payload) => Object.keys(payload).length > 0,
    {
        message: 'Debes enviar al menos un campo para actualizar',
    }
);

export type Transaction = z.infer<typeof TransactionSchema>;
export type TransactionInput = z.infer<typeof TransactionInputSchema>;
export type TransactionUpdate = z.infer<typeof TransactionUpdateSchema>;
export type Obligation = z.infer<typeof ObligationSchema>;
export type Debt = z.infer<typeof DebtSchema>;
export type DebtInput = z.infer<typeof DebtInputSchema>;
export type DebtUpdate = z.infer<typeof DebtUpdateSchema>;
export type SavingsGoal = z.infer<typeof SavingsGoalSchema>;
export type SavingsGoalInput = z.infer<typeof SavingsGoalInputSchema>;
export type SavingsGoalUpdate = z.infer<typeof SavingsGoalUpdateSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type BudgetInput = z.infer<typeof BudgetInputSchema>;
export type BudgetUpdate = z.infer<typeof BudgetUpdateSchema>;
export type RecurringTransaction = z.infer<typeof RecurringTransactionSchema>;
export type RecurringTransactionInput = z.infer<typeof RecurringTransactionInputSchema>;
export type RecurringTransactionUpdate = z.infer<typeof RecurringTransactionUpdateSchema>;
