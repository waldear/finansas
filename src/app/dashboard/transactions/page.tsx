'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, useState } from 'react';
import { useTransactions } from '@/hooks/use-transactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { Loader2, RefreshCcw, Pencil, Trash2, Save, X } from 'lucide-react';
import { usePlanning } from '@/hooks/use-planning';
import { BudgetForm } from '@/components/planning/budget-form';
import { RecurringForm } from '@/components/planning/recurring-form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { BudgetInput, RecurringTransactionInput } from '@/lib/schemas';
import { toast } from 'sonner';

type EnrichedBudget = BudgetInput & {
    id?: string;
    spent: number;
    remaining: number;
    usage: number;
    isAlert: boolean;
};

type RecurringWithId = RecurringTransactionInput & {
    id?: string;
};

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const emptyBudgetInput: BudgetInput = {
    category: '',
    month: currentMonth(),
    limit_amount: 0,
    alert_threshold: 80,
};

const emptyRecurringInput: RecurringTransactionInput = {
    type: 'expense',
    amount: 0,
    description: '',
    category: '',
    frequency: 'monthly',
    start_date: new Date().toISOString().split('T')[0],
    next_run: new Date().toISOString().split('T')[0],
    is_active: true,
};

export default function TransactionsPage() {
    const { transactions, isLoading, error } = useTransactions();
    const {
        budgets,
        recurringTransactions,
        isLoadingBudgets,
        isLoadingRecurring,
        budgetsError,
        recurringError,
        runRecurring,
        isRunningRecurring,
        updateBudget,
        deleteBudget,
        updateRecurring,
        deleteRecurring,
        isUpdatingBudget,
        isDeletingBudget,
        isUpdatingRecurring,
        isDeletingRecurring,
    } = usePlanning(currentMonth());

    const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
    const [targetBudgetId, setTargetBudgetId] = useState<string | null>(null);
    const [budgetEditForm, setBudgetEditForm] = useState<BudgetInput>(emptyBudgetInput);

    const [editingRecurringId, setEditingRecurringId] = useState<string | null>(null);
    const [targetRecurringId, setTargetRecurringId] = useState<string | null>(null);
    const [recurringEditForm, setRecurringEditForm] = useState<RecurringTransactionInput>(emptyRecurringInput);

    const startBudgetEdit = (budget: EnrichedBudget) => {
        if (!budget.id) {
            toast.error('No se puede editar este presupuesto');
            return;
        }
        setEditingBudgetId(budget.id);
        setBudgetEditForm({
            category: String(budget.category || ''),
            month: String(budget.month || currentMonth()),
            limit_amount: Number(budget.limit_amount || 0),
            alert_threshold: Number(budget.alert_threshold || 80),
        });
    };

    const cancelBudgetEdit = () => {
        setEditingBudgetId(null);
        setBudgetEditForm(emptyBudgetInput);
    };

    const handleSaveBudget = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingBudgetId) return;

        try {
            setTargetBudgetId(editingBudgetId);
            await updateBudget({
                budgetId: editingBudgetId,
                changes: budgetEditForm,
            });
            cancelBudgetEdit();
        } catch {
            // toast handled in hook
        } finally {
            setTargetBudgetId(null);
        }
    };

    const handleDeleteBudget = async (budgetId: string) => {
        const approved = window.confirm('¿Seguro que quieres eliminar este presupuesto?');
        if (!approved) return;

        try {
            setTargetBudgetId(budgetId);
            await deleteBudget(budgetId);
            if (editingBudgetId === budgetId) cancelBudgetEdit();
        } catch {
            // toast handled in hook
        } finally {
            setTargetBudgetId(null);
        }
    };

    const startRecurringEdit = (rule: RecurringWithId) => {
        if (!rule.id) {
            toast.error('No se puede editar esta regla recurrente');
            return;
        }
        setEditingRecurringId(rule.id);
        setRecurringEditForm({
            type: rule.type,
            amount: Number(rule.amount || 0),
            description: String(rule.description || ''),
            category: String(rule.category || ''),
            frequency: rule.frequency,
            start_date: String(rule.start_date || new Date().toISOString().split('T')[0]),
            next_run: String(rule.next_run || rule.start_date || new Date().toISOString().split('T')[0]),
            is_active: Boolean(rule.is_active),
        });
    };

    const cancelRecurringEdit = () => {
        setEditingRecurringId(null);
        setRecurringEditForm(emptyRecurringInput);
    };

    const handleSaveRecurring = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingRecurringId) return;

        try {
            setTargetRecurringId(editingRecurringId);
            await updateRecurring({
                recurringId: editingRecurringId,
                changes: recurringEditForm,
            });
            cancelRecurringEdit();
        } catch {
            // toast handled in hook
        } finally {
            setTargetRecurringId(null);
        }
    };

    const handleDeleteRecurring = async (recurringId: string) => {
        const approved = window.confirm('¿Seguro que quieres eliminar esta regla recurrente?');
        if (!approved) return;

        try {
            setTargetRecurringId(recurringId);
            await deleteRecurring(recurringId);
            if (editingRecurringId === recurringId) cancelRecurringEdit();
        } catch {
            // toast handled in hook
        } finally {
            setTargetRecurringId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Transacciones</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <Button asChild variant="ghost" className="w-full justify-start sm:w-auto sm:justify-center">
                        <Link href="/dashboard/history">Editar / Eliminar Movimientos</Link>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => runRecurring()}
                        disabled={isRunningRecurring}
                        className="w-full gap-2 sm:w-auto"
                    >
                        <RefreshCcw className={cn('h-4 w-4', isRunningRecurring && 'animate-spin')} />
                        <span className="sm:hidden">Recurrencias</span>
                        <span className="hidden sm:inline">Ejecutar Recurrencias</span>
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <TransactionForm />

                <Card>
                    <CardHeader>
                        <CardTitle>Últimos Movimientos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : transactions.length > 0 ? (
                            <div className="space-y-4">
                                {transactions.slice(0, 10).map((transaction: any) => (
                                    <div key={transaction.id} className="flex items-start justify-between gap-3 border-b pb-2">
                                        <div className="min-w-0">
                                            <p className="font-medium break-words">{transaction.description}</p>
                                            <p className="text-xs text-muted-foreground break-words">{transaction.category} • {transaction.date}</p>
                                        </div>
                                        <p className={`shrink-0 font-bold ${transaction.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {transaction.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(transaction.amount)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No hay transacciones registradas</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            {error && <p className="text-sm text-destructive">Error de transacciones: {error}</p>}

            <div className="grid gap-6 md:grid-cols-2">
                <RecurringForm />
                <Card>
                    <CardHeader>
                        <CardTitle>Reglas Recurrentes Activas</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingRecurring ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : recurringTransactions.length > 0 ? (
                            <div className="space-y-4">
                                {(recurringTransactions as RecurringWithId[]).slice(0, 8).map((rule) => {
                                    const isEditing = editingRecurringId === rule.id;
                                    const isTargeting = targetRecurringId === rule.id;
                                    const isMutating = isTargeting && (isUpdatingRecurring || isDeletingRecurring);

                                    return (
                                        <div key={rule.id} className="space-y-2 border-b pb-3">
                                            <div className="flex justify-between items-center gap-3">
                                                <div>
                                                    <p className="font-medium">{rule.description}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {rule.category} • {rule.frequency} • próximo: {rule.next_run}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className={`font-bold ${rule.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        {rule.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(rule.amount)}
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => startRecurringEdit(rule)}
                                                        disabled={!rule.id || isMutating}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => rule.id && handleDeleteRecurring(rule.id)}
                                                        disabled={!rule.id || isMutating}
                                                    >
                                                        {isMutating && isDeletingRecurring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            {isEditing && (
                                                <form onSubmit={handleSaveRecurring} className="grid gap-2 rounded-md border p-3 md:grid-cols-2">
                                                    <Input
                                                        value={recurringEditForm.description}
                                                        onChange={(event) => setRecurringEditForm((prev) => ({ ...prev, description: event.target.value }))}
                                                        placeholder="Descripción"
                                                        required
                                                    />
                                                    <Input
                                                        value={recurringEditForm.category}
                                                        onChange={(event) => setRecurringEditForm((prev) => ({ ...prev, category: event.target.value }))}
                                                        placeholder="Categoría"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        value={recurringEditForm.amount}
                                                        onChange={(event) => setRecurringEditForm((prev) => ({ ...prev, amount: Number(event.target.value) || 0 }))}
                                                        required
                                                    />
                                                    <Input
                                                        type="date"
                                                        value={recurringEditForm.start_date}
                                                        onChange={(event) => setRecurringEditForm((prev) => ({ ...prev, start_date: event.target.value }))}
                                                        required
                                                    />
                                                    <select
                                                        value={recurringEditForm.type}
                                                        onChange={(event) => setRecurringEditForm((prev) => ({ ...prev, type: event.target.value as 'income' | 'expense' }))}
                                                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                                    >
                                                        <option value="expense">Gasto</option>
                                                        <option value="income">Ingreso</option>
                                                    </select>
                                                    <select
                                                        value={recurringEditForm.frequency}
                                                        onChange={(event) => setRecurringEditForm((prev) => ({ ...prev, frequency: event.target.value as 'weekly' | 'biweekly' | 'monthly' }))}
                                                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                                                    >
                                                        <option value="weekly">Semanal</option>
                                                        <option value="biweekly">Quincenal</option>
                                                        <option value="monthly">Mensual</option>
                                                    </select>
                                                    <div className="md:col-span-2 flex gap-2">
                                                        <Button type="submit" size="sm" disabled={isMutating}>
                                                            {isMutating && isUpdatingRecurring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                                            Guardar cambios
                                                        </Button>
                                                        <Button type="button" size="sm" variant="outline" onClick={cancelRecurringEdit} disabled={isMutating}>
                                                            <X className="h-4 w-4 mr-2" />
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No hay reglas recurrentes</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            {recurringError && <p className="text-sm text-destructive">Error de recurrencias: {recurringError}</p>}

            <div className="grid gap-6 md:grid-cols-2">
                <BudgetForm />
                <Card>
                    <CardHeader>
                        <CardTitle>Presupuestos del Mes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingBudgets ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : budgets.length > 0 ? (
                            <div className="space-y-4">
                                {(budgets as EnrichedBudget[]).map((budget) => {
                                    const isEditing = editingBudgetId === budget.id;
                                    const isTargeting = targetBudgetId === budget.id;
                                    const isMutating = isTargeting && (isUpdatingBudget || isDeletingBudget);

                                    return (
                                        <div key={budget.id} className="space-y-2 border-b pb-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="font-medium">{budget.category}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Mes: {budget.month} • Alerta: {budget.alert_threshold}%
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <p className={cn('text-xs font-bold', budget.isAlert ? 'text-destructive' : 'text-emerald-600')}>
                                                        {Math.round(budget.usage)}%
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => startBudgetEdit(budget)}
                                                        disabled={!budget.id || isMutating}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => budget.id && handleDeleteBudget(budget.id)}
                                                        disabled={!budget.id || isMutating}
                                                    >
                                                        {isMutating && isDeletingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Gastado {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(budget.spent)}
                                                {' '}de{' '}
                                                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(budget.limit_amount)}
                                            </p>

                                            {isEditing && (
                                                <form onSubmit={handleSaveBudget} className="grid gap-2 rounded-md border p-3 md:grid-cols-2">
                                                    <Input
                                                        value={budgetEditForm.category}
                                                        onChange={(event) => setBudgetEditForm((prev) => ({ ...prev, category: event.target.value }))}
                                                        placeholder="Categoría"
                                                        required
                                                    />
                                                    <Input
                                                        value={budgetEditForm.month}
                                                        onChange={(event) => setBudgetEditForm((prev) => ({ ...prev, month: event.target.value }))}
                                                        placeholder="YYYY-MM"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        value={budgetEditForm.limit_amount}
                                                        onChange={(event) => setBudgetEditForm((prev) => ({ ...prev, limit_amount: Number(event.target.value) || 0 }))}
                                                        placeholder="Límite"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        max="100"
                                                        value={budgetEditForm.alert_threshold}
                                                        onChange={(event) => setBudgetEditForm((prev) => ({ ...prev, alert_threshold: Number(event.target.value) || 80 }))}
                                                        placeholder="Alerta (%)"
                                                        required
                                                    />
                                                    <div className="md:col-span-2 flex gap-2">
                                                        <Button type="submit" size="sm" disabled={isMutating}>
                                                            {isMutating && isUpdatingBudget ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                                                            Guardar cambios
                                                        </Button>
                                                        <Button type="button" size="sm" variant="outline" onClick={cancelBudgetEdit} disabled={isMutating}>
                                                            <X className="h-4 w-4 mr-2" />
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No hay presupuestos para este mes</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            {budgetsError && <p className="text-sm text-destructive">Error de presupuestos: {budgetsError}</p>}
        </div>
    );
}
