'use client';

export const dynamic = 'force-dynamic';
import { useTransactions } from '@/hooks/use-transactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, TrendingDown, PieChart as PieIcon, BarChart3 } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    Legend
} from 'recharts';

export default function ChartsPage() {
    const { transactions, isLoading } = useTransactions();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // Process data for charts
    const categoryData: Record<string, number> = {};
    const monthlyData: Record<string, { month: string, income: number, expense: number }> = {};

    transactions.forEach(t => {
        // Category data (expenses only)
        if (t.type === 'expense') {
            categoryData[t.category] = (categoryData[t.category] || 0) + t.amount;
        }

        // Monthly data
        const date = new Date(t.date);
        const monthYear = date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });

        if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { month: monthYear, income: 0, expense: 0 };
        }

        if (t.type === 'income') {
            monthlyData[monthYear].income += t.amount;
        } else {
            monthlyData[monthYear].expense += t.amount;
        }
    });

    const pieData = Object.entries(categoryData).map(([name, value]) => ({ name, value }));
    const barData = Object.values(monthlyData).reverse().slice(-6); // Last 6 months

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Análisis Visual</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Evolution Chart */}
                <Card className="col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-primary" />
                            Evolución Mensual
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={barData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `$${value / 1000}k`} />
                                    <Tooltip
                                        formatter={(value: any) => formatCurrency(Number(value))}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Legend />
                                    <Bar dataKey="income" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="expense" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Categories Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <PieIcon className="w-5 h-5 text-primary" />
                            Distribución de Gastos
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            {pieData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground italic">
                                    No hay gastos para mostrar
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Summary Card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-xl font-bold">Resumen de Periodo</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {Object.entries(categoryData).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat, val], idx) => (
                            <div key={cat} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {/* eslint-disable-next-line react/forbid-dom-props */}
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                    <span className="text-sm font-medium">{cat}</span>
                                </div>
                                <span className="text-sm font-bold">{formatCurrency(val)}</span>
                            </div>
                        ))}
                        {pieData.length === 0 && <p className="text-sm text-muted-foreground text-center">Sin datos disponibles.</p>}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
