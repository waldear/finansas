import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  PieChart, 
  BarChart3, 
  LineChart,
  Wallet,
  Target
} from 'lucide-react';
import { 
  BarChart as ReBarChart, 
  Bar, 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import type { Transaction, Debt } from '@/types/finance';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/types/finance';

interface HistoryChartsProps {
  transactions: Transaction[];
  debts: Debt[];
}

export function HistoryCharts({ transactions, debts }: HistoryChartsProps) {
  const [timeRange, setTimeRange] = useState<'3m' | '6m' | '1y' | 'all'>('6m');
  const [chartType, setChartType] = useState<'trend' | 'category' | 'comparison'>('trend');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Filter transactions by time range
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const ranges = {
      '3m': new Date(now.getFullYear(), now.getMonth() - 3, 1),
      '6m': new Date(now.getFullYear(), now.getMonth() - 6, 1),
      '1y': new Date(now.getFullYear() - 1, now.getMonth(), 1),
      'all': new Date(2000, 0, 1),
    };
    
    return transactions.filter(t => new Date(t.date) >= ranges[timeRange]);
  }, [transactions, timeRange]);

  // Monthly trend data
  const monthlyData = useMemo(() => {
    const data: Record<string, { month: string; income: number; expenses: number; balance: number }> = {};
    
    filteredTransactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
      
      if (!data[monthKey]) {
        data[monthKey] = { month: monthLabel, income: 0, expenses: 0, balance: 0 };
      }
      
      if (t.type === 'income') {
        data[monthKey].income += t.amount;
      } else {
        data[monthKey].expenses += t.amount;
      }
    });

    // Calculate balance
    Object.values(data).forEach(d => {
      d.balance = d.income - d.expenses;
    });

    return Object.entries(data)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, d]) => d);
  }, [filteredTransactions]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const expenses: Record<string, number> = {};
    const income: Record<string, number> = {};

    filteredTransactions.forEach(t => {
      if (t.type === 'expense') {
        expenses[t.category] = (expenses[t.category] || 0) + t.amount;
      } else {
        income[t.category] = (income[t.category] || 0) + t.amount;
      }
    });

    const expenseData = Object.entries(expenses).map(([category, amount]) => {
      const catInfo = EXPENSE_CATEGORIES.find(c => c.id === category);
      return {
        name: catInfo?.name || category,
        value: amount,
        color: catInfo?.color || '#6b7280',
      };
    });

    const incomeData = Object.entries(income).map(([category, amount]) => {
      const catInfo = INCOME_CATEGORIES.find(c => c.id === category);
      return {
        name: catInfo?.name || category,
        value: amount,
        color: catInfo?.color || '#10b981',
      };
    });

    return { expenses: expenseData, income: incomeData };
  }, [filteredTransactions]);

  // Statistics
  const stats = useMemo(() => {
    const totalIncome = filteredTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = filteredTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const avgMonthlyIncome = monthlyData.length > 0 
      ? totalIncome / monthlyData.length 
      : 0;
    
    const avgMonthlyExpenses = monthlyData.length > 0 
      ? totalExpenses / monthlyData.length 
      : 0;

    const savingsRate = totalIncome > 0 
      ? ((totalIncome - totalExpenses) / totalIncome) * 100 
      : 0;

    return {
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      avgMonthlyIncome,
      avgMonthlyExpenses,
      savingsRate,
      transactionCount: filteredTransactions.length,
    };
  }, [filteredTransactions, monthlyData]);

  // Debt evolution
  const debtData = useMemo(() => {
    const data = debts.map(debt => ({
      name: debt.name,
      total: debt.totalAmount,
      paid: debt.totalAmount - (debt.monthlyPayment * debt.remainingInstallments),
      remaining: debt.monthlyPayment * debt.remainingInstallments,
      progress: debt.totalInstallments > 0 
        ? ((debt.totalInstallments - debt.remainingInstallments) / debt.totalInstallments) * 100 
        : 0,
    }));

    return data;
  }, [debts]);

  // const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Ingresos</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalIncome)}</p>
            <p className="text-xs text-muted-foreground">Prom: {formatCurrency(stats.avgMonthlyIncome)}/mes</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Gastos</span>
            </div>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(stats.totalExpenses)}</p>
            <p className="text-xs text-muted-foreground">Prom: {formatCurrency(stats.avgMonthlyExpenses)}/mes</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">Balance</span>
            </div>
            <p className={`text-2xl font-bold ${stats.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(stats.balance)}
            </p>
            <p className="text-xs text-muted-foreground">{stats.transactionCount} transacciones</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">Tasa Ahorro</span>
            </div>
            <p className={`text-2xl font-bold ${stats.savingsRate >= 20 ? 'text-green-600' : stats.savingsRate >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
              {stats.savingsRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">Meta: 20%</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              Análisis Financiero
            </CardTitle>
            <div className="flex gap-2">
              <Select value={timeRange} onValueChange={(v) => setTimeRange(v as typeof timeRange)}>
                <SelectTrigger className="w-32">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3m">3 meses</SelectItem>
                  <SelectItem value="6m">6 meses</SelectItem>
                  <SelectItem value="1y">1 año</SelectItem>
                  <SelectItem value="all">Todo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={chartType} onValueChange={(v) => setChartType(v as typeof chartType)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="trend">
                <LineChart className="h-4 w-4 mr-2" />
                Tendencia
              </TabsTrigger>
              <TabsTrigger value="category">
                <PieChart className="h-4 w-4 mr-2" />
                Categorías
              </TabsTrigger>
              <TabsTrigger value="comparison">
                <BarChart3 className="h-4 w-4 mr-2" />
                Comparación
              </TabsTrigger>
            </TabsList>

            {/* Trend Chart */}
            <TabsContent value="trend" className="h-[400px]">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Area 
                      type="monotone" 
                      dataKey="income" 
                      name="Ingresos" 
                      stroke="#10b981" 
                      fill="#10b981" 
                      fillOpacity={0.3}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="expenses" 
                      name="Gastos" 
                      stroke="#ef4444" 
                      fill="#ef4444" 
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No hay datos suficientes para mostrar la tendencia
                </div>
              )}
            </TabsContent>

            {/* Category Chart */}
            <TabsContent value="category" className="h-[400px]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
                <div>
                  <h4 className="text-sm font-medium mb-2 text-center">Gastos por Categoría</h4>
                  {categoryData.expenses.length > 0 ? (
                    <ResponsiveContainer width="100%" height="90%">
                      <RePieChart>
                        <Pie
                          data={categoryData.expenses}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          dataKey="value"
                        >
                          {categoryData.expenses.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                      </RePieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No hay gastos registrados
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2 text-center">Ingresos por Categoría</h4>
                  {categoryData.income.length > 0 ? (
                    <ResponsiveContainer width="100%" height="90%">
                      <RePieChart>
                        <Pie
                          data={categoryData.income}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          dataKey="value"
                        >
                          {categoryData.income.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatCurrency(v)} />
                        <Legend />
                      </RePieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground">
                      No hay ingresos registrados
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Comparison Chart */}
            <TabsContent value="comparison" className="h-[400px]">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ReBarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Bar dataKey="income" name="Ingresos" fill="#10b981" />
                    <Bar dataKey="expenses" name="Gastos" fill="#ef4444" />
                    <Bar dataKey="balance" name="Balance" fill="#3b82f6" />
                  </ReBarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  No hay datos suficientes para comparar
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Debt Progress */}
      {debts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Progreso de Deudas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {debtData.map((debt, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{debt.name}</span>
                    <div className="flex gap-2 text-sm">
                      <Badge variant="outline" className="text-green-600">
                        Pagado: {formatCurrency(debt.paid)}
                      </Badge>
                      <Badge variant="outline" className="text-red-600">
                        Restante: {formatCurrency(debt.remaining)}
                      </Badge>
                    </div>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
                      style={{ width: `${debt.progress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {debt.progress.toFixed(1)}% completado
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
