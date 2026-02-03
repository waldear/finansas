'use client';

import { useFinance } from '@/hooks/use-finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CreditCard, PiggyBank, TrendingUp, Wallet, Loader2 } from 'lucide-react';
import { useTransactions } from '@/hooks/use-transactions';
import { DashboardSkeleton } from '@/components/layout/dashboard-skeleton';

export default function DashboardPage() {
    const { debts, savingsGoals, isLoadingDebts, isLoadingGoals } = useFinance();
    const { transactions, isLoading: isLoadingTransactions } = useTransactions();

    if (isLoadingTransactions || isLoadingDebts || isLoadingGoals) {
        return <DashboardSkeleton />;
    }

    const totalIncome = transactions
        .filter(t => t.type === 'income')
        .reduce((acc, t) => acc + t.amount, 0);

    const totalExpenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((acc, t) => acc + t.amount, 0);

    const balance = totalIncome - totalExpenses;

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Resumen General</h2>
                <p className="text-muted-foreground">Tu estado financiero en tiempo real.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* ... (rest of the content remains the same but with skeletons handled above) ... */}
                <Card className="bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Ingresos</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalIncome)}</div>
                    </CardContent>
                </Card>

                <Card className="bg-red-50/50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Gastos</CardTitle>
                        <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(totalExpenses)}</div>
                    </CardContent>
                </Card>

                <Card className="bg-blue-50/50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Balance</CardTitle>
                        <Wallet className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${balance >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{formatCurrency(balance)}</div>
                    </CardContent>
                </Card>

                <Card className="bg-purple-50/50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Deuda Total</CardTitle>
                        <CreditCard className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                            {formatCurrency(debts.reduce((acc, d) => acc + d.total_amount, 0))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Historial Reciente</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {transactions.length > 0 ? transactions.slice(0, 5).map((t: any) => (
                                <div key={t.id} className="flex items-center">
                                    <div className="ml-4 space-y-1">
                                        <p className="text-sm font-medium leading-none">{t.description}</p>
                                        <p className="text-sm text-muted-foreground">{t.category}</p>
                                    </div>
                                    <div className={`ml-auto font-medium ${t.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                                    </div>
                                </div>
                            )) : <p className="text-sm text-muted-foreground text-center py-4">No hay movimientos.</p>}
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Metas de Ahorro</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {savingsGoals.length > 0 ? savingsGoals.map((goal) => (
                                <div key={goal.id} className="space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="font-medium">{goal.name}</span>
                                        <span className="text-muted-foreground">
                                            {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                                        </span>
                                    </div>
                                    <Progress value={(goal.current_amount / (goal.target_amount || 1)) * 100} className="h-2" />
                                </div>
                            )) : <p className="text-sm text-muted-foreground text-center py-4">No hay metas activas.</p>}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
