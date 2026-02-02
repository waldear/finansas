import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import type { FinancialSummary } from '@/types/finance';
import { EXPENSE_CATEGORIES } from '@/types/finance';

interface DashboardProps {
  summary: FinancialSummary;
  expensesByCategory: Record<string, number>;
  upcomingPayments: { name: string; amount: number; dueDate: string }[];
}

export function Dashboard({ summary, expensesByCategory, upcomingPayments }: DashboardProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const pieData = Object.entries(expensesByCategory).map(([category, amount]) => {
    const catInfo = EXPENSE_CATEGORIES.find(c => c.id === category);
    return {
      name: catInfo?.name || category,
      value: amount,
      color: catInfo?.color || '#6b7280',
    };
  }).filter(d => d.value > 0);

  const getStatusColor = (rate: number) => {
    if (rate >= 20) return 'text-green-500';
    if (rate >= 10) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getDebtStatus = (ratio: number) => {
    if (ratio <= 20) return { color: 'text-green-500', message: 'Saludable' };
    if (ratio <= 35) return { color: 'text-yellow-500', message: 'Moderado' };
    return { color: 'text-red-500', message: 'Alto Riesgo' };
  };

  const debtStatus = getDebtStatus(summary.debtToIncomeRatio);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:scale-105 transition-transform duration-200 border-none bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 dark:from-indigo-500/20 dark:to-indigo-600/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.totalIncome)}</div>
            <p className="text-xs text-muted-foreground mt-1">Este mes</p>
          </CardContent>
        </Card>

        <Card className="hover:scale-105 transition-transform duration-200 border-none bg-gradient-to-br from-red-500/10 to-red-600/5 dark:from-red-500/20 dark:to-red-600/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gastos Totales</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{formatCurrency(summary.totalExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">Incluye deudas</p>
          </CardContent>
        </Card>

        <Card className="hover:scale-105 transition-transform duration-200 border-none bg-gradient-to-br from-blue-500/10 to-blue-600/5 dark:from-blue-500/20 dark:to-blue-600/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Balance</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.balance >= 0 ? 'text-primary' : 'text-red-600'}`}>
              {formatCurrency(summary.balance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Disponible</p>
          </CardContent>
        </Card>

        <Card className="hover:scale-105 transition-transform duration-200 border-none bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 dark:from-yellow-500/20 dark:to-yellow-600/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasa de Ahorro</CardTitle>
            <PiggyBank className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getStatusColor(summary.savingsRate)}`}>
              {summary.savingsRate.toFixed(1)}%
            </div>
            <Progress value={Math.min(summary.savingsRate, 100)} className="mt-2 h-2" />
            <p className="text-xs text-muted-foreground mt-2">Meta: 20%</p>
          </CardContent>
        </Card>
      </div>

      {/* Debt Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Estado de Deudas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Ratio Deuda/Ingreso</p>
              <p className={`text-3xl font-bold ${debtStatus.color}`}>
                {summary.debtToIncomeRatio.toFixed(1)}%
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Estado</p>
              <p className={`text-xl font-semibold ${debtStatus.color}`}>{debtStatus.message}</p>
            </div>
          </div>
          <Progress
            value={Math.min(summary.debtToIncomeRatio, 100)}
            className="mt-4"
          />
          <p className="text-xs text-muted-foreground mt-2">
            Recomendado: menos del 20% de tus ingresos
          </p>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expenses by Category */}
        <Card>
          <CardHeader>
            <CardTitle>Gastos por Categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No hay gastos registrados
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Payments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              Próximos Pagos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingPayments.length > 0 ? (
              <div className="space-y-4">
                {upcomingPayments.slice(0, 5).map((payment, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">{payment.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Vence: {new Date(payment.dueDate).toLocaleDateString('es-AR')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-red-600">{formatCurrency(payment.amount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                No hay pagos pendientes
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
