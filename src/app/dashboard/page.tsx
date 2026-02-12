'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef } from 'react';
import { useDashboard } from '@/hooks/use-dashboard';
import { usePlanning } from '@/hooks/use-planning';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    CreditCard,
    PiggyBank,
    TrendingUp,
    Wallet,
    Plus,
    ArrowUpRight,
    MoreHorizontal,
    ArrowDownLeft,
    PieChart,
    Activity,
    AlertTriangle
} from 'lucide-react';
import { DashboardSkeleton } from '@/components/layout/dashboard-skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function DashboardPage() {
    const { debts, savingsGoals, transactions, isLoading } = useDashboard();
    const { budgets, recurringTransactions, runRecurring } = usePlanning();
    const recurringRanRef = useRef(false);

    // Memoize expensive calculations
    const financialStats = useMemo(() => {
        const totalIncome = transactions
            .filter((t: any) => t.type === 'income')
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const totalExpenses = transactions
            .filter((t: any) => t.type === 'expense')
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const totalDebt = debts.reduce((acc: number, d: any) => acc + d.total_amount, 0);
        const balance = totalIncome - totalExpenses;

        return { totalIncome, totalExpenses, totalDebt, balance };
    }, [transactions, debts]);

    const weeklyInsights = useMemo(() => {
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const startCurrent = new Date(today);
        startCurrent.setUTCDate(today.getUTCDate() - 6);
        const startPrevious = new Date(startCurrent);
        startPrevious.setUTCDate(startCurrent.getUTCDate() - 7);
        const endPrevious = new Date(startCurrent);
        endPrevious.setUTCDate(startCurrent.getUTCDate() - 1);

        const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
        const inRange = (value: string, start: Date, end: Date) => {
            const date = toDate(value);
            return date >= start && date <= end;
        };

        const currentWeekIncome = transactions
            .filter((t: any) => t.type === 'income' && inRange(t.date, startCurrent, today))
            .reduce((acc: number, t: any) => acc + t.amount, 0);
        const currentWeekExpense = transactions
            .filter((t: any) => t.type === 'expense' && inRange(t.date, startCurrent, today))
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const previousWeekIncome = transactions
            .filter((t: any) => t.type === 'income' && inRange(t.date, startPrevious, endPrevious))
            .reduce((acc: number, t: any) => acc + t.amount, 0);
        const previousWeekExpense = transactions
            .filter((t: any) => t.type === 'expense' && inRange(t.date, startPrevious, endPrevious))
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const currentNet = currentWeekIncome - currentWeekExpense;
        const previousNet = previousWeekIncome - previousWeekExpense;
        const netDelta = currentNet - previousNet;
        const trend = previousNet === 0 ? 100 : (netDelta / Math.abs(previousNet)) * 100;

        const budgetAlerts = budgets
            .filter((budget: any) => budget.isAlert)
            .slice(0, 2)
            .map((budget: any) => `Tu presupuesto de ${budget.category} está en ${Math.round(budget.usage)}%.`);

        const recurringAlerts = recurringTransactions
            .filter((rule: any) => rule.is_active)
            .slice(0, 2)
            .map((rule: any) => `Próxima recurrencia: ${rule.description} (${rule.next_run}).`);

        const recommendations = [
            ...budgetAlerts,
            ...recurringAlerts,
        ];

        if (recommendations.length === 0) {
            recommendations.push('Todo está en rango: no hay alertas críticas esta semana.');
        }

        return {
            currentWeekIncome,
            currentWeekExpense,
            currentNet,
            trend,
            recommendations,
        };
    }, [transactions, budgets, recurringTransactions]);

    useEffect(() => {
        if (recurringRanRef.current) return;
        recurringRanRef.current = true;
        runRecurring().catch(() => {});
    }, [runRecurring]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const actionButtons = [
        { label: 'Ingresar', icon: Plus, color: 'bg-emerald-500', href: '/dashboard/transactions' },
        { label: 'Gastar', icon: ArrowUpRight, color: 'bg-red-500', href: '/dashboard/transactions' },
        { label: 'Copiloto', icon: Activity, color: 'bg-blue-500', href: '/dashboard/copilot' },
        { label: 'Auditoría', icon: MoreHorizontal, color: 'bg-zinc-700', href: '/dashboard/audit' },
    ];

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    const { totalIncome, totalExpenses, totalDebt, balance } = financialStats;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* HERO CARD - NET WORTH */}
            <div className="relative overflow-hidden rounded-[3rem] premium-gradient p-8 text-white neon-glow shadow-2xl transition-transform hover:scale-[1.01] duration-500">
                <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] opacity-80">PATRIMONIO NETO TOTAL</p>
                    <div className="flex items-baseline">
                        <span className="text-6xl font-black tracking-tighter">{formatCurrency(balance - totalDebt).split(',')[0]}</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-1.5 glass rounded-full text-xs font-bold">
                        <TrendingUp className="h-4 w-4" />
                        <span>+12.4% este mes</span>
                    </div>
                </div>

                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl" />
            </div>

            {/* QUICK ACTIONS */}
            <div className="flex justify-between px-2 max-w-md mx-auto w-full">
                {actionButtons.map((btn) => (
                    <div key={btn.label} className="flex flex-col items-center gap-2">
                        <Link href={btn.href}>
                            <div className={cn(
                                "h-16 w-16 rounded-full flex items-center justify-center text-white transition-all shadow-xl hover:scale-110 active:scale-90",
                                btn.color
                            )}>
                                <btn.icon className="h-8 w-8" />
                            </div>
                        </Link>
                        <span className="text-xs font-bold text-muted-foreground">{btn.label}</span>
                    </div>
                ))}
            </div>

            {/* SECONDARY CARDS GRID */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card className="glass-card rounded-[2.5rem] p-6 border-0 overflow-hidden relative group">
                    <div className="flex justify-between items-start mb-6">
                        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                            <Activity className="h-6 w-6" />
                        </div>
                        <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-xs font-bold">+12%</div>
                    </div>
                    <p className="text-sm font-bold text-muted-foreground mb-1">Portfolio</p>
                    <h3 className="text-3xl font-black">{formatCurrency(balance)}</h3>
                    {/* SVG Sparkline Mockup */}
                    <div className="mt-6 h-16 w-full opacity-50 group-hover:opacity-100 transition-opacity">
                        <svg className="w-full h-full" viewBox="0 0 100 20">
                            <path d="M0 15 Q 25 5, 50 12 T 100 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-primary" />
                        </svg>
                    </div>
                </Card>

                <Card className="glass-card rounded-[2.5rem] p-6 border-0 overflow-hidden relative">
                    <div className="flex justify-between items-start mb-6">
                        <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
                            <PieChart className="h-6 w-6" />
                        </div>
                        <div className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                    </div>
                    <p className="text-sm font-bold text-muted-foreground mb-1">Gastos Mensuales</p>
                    <h3 className="text-3xl font-black">{formatCurrency(totalExpenses)}</h3>
                    <div className="mt-6 space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                            <span className="opacity-60">Límite: {formatCurrency(450000)}</span>
                            <span>{Math.round((totalExpenses / 450000) * 100)}%</span>
                        </div>
                        <Progress
                            value={(totalExpenses / 450000) * 100}
                            className="h-2 [&>div]:neon-glow"
                        />
                    </div>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card className="glass-card rounded-[2rem] border-0 p-6">
                    <CardHeader className="p-0 pb-4">
                        <CardTitle>KPIs Semanales</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 space-y-2">
                        <p className="text-sm text-muted-foreground">
                            Ingresos: <span className="font-bold text-emerald-500">{formatCurrency(weeklyInsights.currentWeekIncome)}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Gastos: <span className="font-bold text-red-500">{formatCurrency(weeklyInsights.currentWeekExpense)}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Neto semanal: <span className={cn('font-bold', weeklyInsights.currentNet >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                {formatCurrency(weeklyInsights.currentNet)}
                            </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Tendencia vs semana anterior: <span className={cn('font-bold', weeklyInsights.trend >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                {weeklyInsights.trend.toFixed(1)}%
                            </span>
                        </p>
                    </CardContent>
                </Card>

                <Card className="glass-card rounded-[2rem] border-0 p-6">
                    <CardHeader className="p-0 pb-4">
                        <CardTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Recomendaciones Automáticas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 space-y-2">
                        {weeklyInsights.recommendations.map((recommendation, index) => (
                            <p key={index} className="text-sm text-muted-foreground">
                                • {recommendation}
                            </p>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* RECENT TRANSACTIONS */}
            <div className="space-y-4 pb-12">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-xl font-black tracking-tight">Actividad Reciente</h3>
                    <Link href="/dashboard/history" className="text-sm font-bold text-primary hover:underline">Ver todo</Link>
                </div>

                <div className="space-y-3">
                    {transactions.slice(0, 4).map((t: any) => (
                        <Card key={t.id} className="glass-card rounded-3xl p-4 border-0 flex items-center gap-4 hover:bg-white/[0.05] transition-colors group">
                            <div className={cn(
                                "h-12 w-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform",
                                t.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                            )}>
                                {t.type === 'income' ? <ArrowDownLeft className="h-6 w-6" /> : <ArrowUpRight className="h-6 w-6" />}
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-sm">{t.description}</p>
                                <p className="text-xs text-muted-foreground font-medium">{t.category} • Hoy</p>
                            </div>
                            <div className={cn(
                                "text-sm font-black text-right",
                                t.type === 'income' ? 'text-emerald-500' : 'text-foreground'
                            )}>
                                {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                            </div>
                        </Card>
                    ))}
                    {transactions.length === 0 && (
                        <div className="py-12 text-center text-muted-foreground bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
                            <Wallet className="h-10 w-10 mx-auto mb-2 opacity-20" />
                            <p className="text-sm font-medium">Aún no hay movimientos</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
