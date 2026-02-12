'use client';

export const dynamic = 'force-dynamic';
import { useTransactions } from '@/hooks/use-transactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { Loader2, RefreshCcw } from 'lucide-react';
import { usePlanning } from '@/hooks/use-planning';
import { BudgetForm } from '@/components/planning/budget-form';
import { RecurringForm } from '@/components/planning/recurring-form';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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
    } = usePlanning(currentMonth());

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Transacciones</h2>
                <Button
                    variant="outline"
                    onClick={() => runRecurring()}
                    disabled={isRunningRecurring}
                    className="gap-2"
                >
                    <RefreshCcw className={cn('h-4 w-4', isRunningRecurring && 'animate-spin')} />
                    Ejecutar Recurrencias
                </Button>
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
                                {transactions.slice(0, 10).map((t: any) => (
                                    <div key={t.id} className="flex justify-between items-center border-b pb-2">
                                        <div>
                                            <p className="font-medium">{t.description}</p>
                                            <p className="text-xs text-muted-foreground">{t.category} • {t.date}</p>
                                        </div>
                                        <p className={`font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {t.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.amount)}
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
                                {recurringTransactions.slice(0, 8).map((rule: any) => (
                                    <div key={rule.id} className="flex justify-between items-center border-b pb-2">
                                        <div>
                                            <p className="font-medium">{rule.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {rule.category} • {rule.frequency} • próximo: {rule.next_run}
                                            </p>
                                        </div>
                                        <p className={`font-bold ${rule.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {rule.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(rule.amount)}
                                        </p>
                                    </div>
                                ))}
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
                                {budgets.map((budget: any) => (
                                    <div key={budget.id} className="space-y-1 border-b pb-3">
                                        <div className="flex items-center justify-between">
                                            <p className="font-medium">{budget.category}</p>
                                            <p className={cn('text-xs font-bold', budget.isAlert ? 'text-destructive' : 'text-emerald-600')}>
                                                {Math.round(budget.usage)}%
                                            </p>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Gastado {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(budget.spent)}
                                            {' '}de{' '}
                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(budget.limit_amount)}
                                        </p>
                                    </div>
                                ))}
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
