import { useState, useEffect, useCallback } from 'react';
import type { Transaction, Debt, FinancialSummary, PaymentReminder, BudgetRecommendation, Category, SavingsGoal } from '@/types/finance';
import { syncToCloud, fetchFromCloud, deleteFromCloud } from '@/lib/syncService';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const STORAGE_KEY = 'mi-control-financiero-data';

interface FinanceData {
  transactions: Transaction[];
  debts: Debt[];
  reminders: PaymentReminder[];
  customCategories: Category[];
  savingsGoals: SavingsGoal[];
}

const initialData: FinanceData = {
  transactions: [],
  debts: [],
  reminders: [],
  customCategories: [],
  savingsGoals: [],
};

export function useFinance() {
  const [data, setData] = useState<FinanceData>(initialData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Load data from localStorage and cloud on mount
  useEffect(() => {
    const loadData = async () => {
      // First, load from localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setData(parsed);
        } catch (e) {
          console.error('Error parsing stored data:', e);
        }
      }

      // Then try to fetch from cloud if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: cloudData, error } = await fetchFromCloud();
        if (cloudData && !error) {
          setData(cloudData);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData));
          setLastSync(new Date());
        }
      }

      setIsLoaded(true);
    };

    loadData();
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  }, [data, isLoaded]);

  // Auto-sync to cloud when data changes
  useEffect(() => {
    if (!isLoaded) return;

    const syncData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsSyncing(true);
        const result = await syncToCloud(data);
        if (result.success) {
          setLastSync(new Date());
        }
        setIsSyncing(false);
      }
    };

    // Debounce sync by 2 seconds
    const timeout = setTimeout(syncData, 2000);
    return () => clearTimeout(timeout);
  }, [data, isLoaded]);

  // Manual sync function
  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    const result = await syncToCloud(data);
    if (result.success) {
      setLastSync(new Date());
      toast.success('Datos sincronizados en la nube');
    } else {
      toast.error('Error al sincronizar: ' + result.error);
    }
    setIsSyncing(false);
    return result.success;
  }, [data]);

  // Transactions
  const addTransaction = useCallback((transaction: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTransaction: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setData(prev => ({
      ...prev,
      transactions: [newTransaction, ...prev.transactions],
    }));
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    // Delete from cloud first
    await deleteFromCloud('transaction', id);
    
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id),
    }));
  }, []);

  const editTransaction = useCallback((updatedTransaction: Transaction) => {
    setData(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => 
        t.id === updatedTransaction.id ? updatedTransaction : t
      ),
    }));
  }, []);

  // Debts
  const addDebt = useCallback((debt: Omit<Debt, 'id' | 'createdAt'>) => {
    const newDebt: Debt = {
      ...debt,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setData(prev => ({
      ...prev,
      debts: [...prev.debts, newDebt],
    }));
  }, []);

  const deleteDebt = useCallback(async (id: string) => {
    await deleteFromCloud('debt', id);
    
    setData(prev => ({
      ...prev,
      debts: prev.debts.filter(d => d.id !== id),
    }));
  }, []);

  const updateDebtPayment = useCallback((debtId: string) => {
    setData(prev => ({
      ...prev,
      debts: prev.debts.map(debt => {
        if (debt.id === debtId && debt.remainingInstallments > 0) {
          return {
            ...debt,
            remainingInstallments: debt.remainingInstallments - 1,
            nextPaymentDate: calculateNextPaymentDate(debt.nextPaymentDate),
          };
        }
        return debt;
      }),
    }));
  }, []);

  // Custom Categories
  const addCustomCategory = useCallback((category: Omit<Category, 'id'>) => {
    const newCategory: Category = {
      ...category,
      id: `custom-${crypto.randomUUID()}`,
    };
    setData(prev => ({
      ...prev,
      customCategories: [...prev.customCategories, newCategory],
    }));
  }, []);

  const deleteCustomCategory = useCallback(async (id: string) => {
    await deleteFromCloud('category', id);
    
    setData(prev => ({
      ...prev,
      customCategories: prev.customCategories.filter(c => c.id !== id),
    }));
  }, []);

  const editCustomCategory = useCallback((updatedCategory: Category) => {
    setData(prev => ({
      ...prev,
      customCategories: prev.customCategories.map(c =>
        c.id === updatedCategory.id ? updatedCategory : c
      ),
    }));
  }, []);

  // Savings Goals
  const addSavingsGoal = useCallback((goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => {
    const newGoal: SavingsGoal = {
      ...goal,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setData(prev => ({
      ...prev,
      savingsGoals: [...prev.savingsGoals, newGoal],
    }));
  }, []);

  const deleteSavingsGoal = useCallback(async (id: string) => {
    await deleteFromCloud('goal', id);
    
    setData(prev => {
      const goal = prev.savingsGoals.find(g => g.id === id);
      // Return saved money to available balance
      if (goal) {
        const refundTransaction: Transaction = {
          id: crypto.randomUUID(),
          type: 'income',
          amount: goal.currentAmount,
          description: `Reembolso meta: ${goal.name}`,
          category: 'extra',
          date: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          savingsGoals: prev.savingsGoals.filter(g => g.id !== id),
          transactions: [refundTransaction, ...prev.transactions],
        };
      }
      return {
        ...prev,
        savingsGoals: prev.savingsGoals.filter(g => g.id !== id),
      };
    });
  }, []);

  const contributeToGoal = useCallback((goalId: string, amount: number) => {
    setData(prev => {
      const goal = prev.savingsGoals.find(g => g.id === goalId);
      if (!goal) return prev;

      // Create expense transaction for the contribution
      const contributionTransaction: Transaction = {
        id: crypto.randomUUID(),
        type: 'expense',
        amount,
        description: `Aporte a meta: ${goal.name}`,
        category: 'other',
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
      };

      return {
        ...prev,
        savingsGoals: prev.savingsGoals.map(g =>
          g.id === goalId 
            ? { 
                ...g, 
                currentAmount: g.currentAmount + amount,
                isCompleted: g.currentAmount + amount >= g.targetAmount
              }
            : g
        ),
        transactions: [contributionTransaction, ...prev.transactions],
      };
    });
  }, []);

  // Calculations
  const getSummary = useCallback((): FinancialSummary => {
    const totalIncome = data.transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = data.transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyDebtPayments = data.debts.reduce((sum, d) => sum + d.monthlyPayment, 0);
    const totalExpensesWithDebt = totalExpenses + monthlyDebtPayments;

    const balance = totalIncome - totalExpensesWithDebt;
    const savingsRate = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
    const debtToIncomeRatio = totalIncome > 0 ? (monthlyDebtPayments / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpenses: totalExpensesWithDebt,
      balance,
      savingsRate,
      debtToIncomeRatio,
    };
  }, [data.transactions, data.debts]);

  const getExpensesByCategory = useCallback(() => {
    const expenses: Record<string, number> = {};
    
    // Add transaction expenses
    data.transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        expenses[t.category] = (expenses[t.category] || 0) + t.amount;
      });

    // Add debt payments
    const monthlyDebtPayments = data.debts.reduce((sum, d) => sum + d.monthlyPayment, 0);
    if (monthlyDebtPayments > 0) {
      expenses['debt'] = (expenses['debt'] || 0) + monthlyDebtPayments;
    }

    return expenses;
  }, [data.transactions, data.debts]);

  const getRecommendations = useCallback((): BudgetRecommendation[] => {
    const summary = getSummary();
    const expensesByCategory = getExpensesByCategory();
    const recommendations: BudgetRecommendation[] = [];

    const totalIncome = summary.totalIncome;
    if (totalIncome === 0) return recommendations;

    // 50/30/20 rule recommendations
    const needsCategories = ['housing', 'utilities', 'internet', 'food', 'transport', 'insurance', 'health'];
    const wantsCategories = ['entertainment', 'shopping', 'education'];
    const savingsAndDebt = ['debt'];

    const needsTotal = needsCategories.reduce((sum, cat) => sum + (expensesByCategory[cat] || 0), 0);
    const wantsTotal = wantsCategories.reduce((sum, cat) => sum + (expensesByCategory[cat] || 0), 0);
    const debtTotal = savingsAndDebt.reduce((sum, cat) => sum + (expensesByCategory[cat] || 0), 0);

    // Needs should be ~50%
    const needsPercentage = (needsTotal / totalIncome) * 100;
    if (needsPercentage > 55) {
      recommendations.push({
        category: 'Necesidades Básicas',
        currentAmount: needsTotal,
        recommendedAmount: totalIncome * 0.5,
        percentage: needsPercentage,
        message: `Tus necesidades básicas representan el ${needsPercentage.toFixed(1)}% de tus ingresos. Intenta reducir gastos en vivienda o servicios.`,
      });
    }

    // Wants should be ~30%
    const wantsPercentage = (wantsTotal / totalIncome) * 100;
    if (wantsPercentage > 35) {
      recommendations.push({
        category: 'Deseos y Entretenimiento',
        currentAmount: wantsTotal,
        recommendedAmount: totalIncome * 0.3,
        percentage: wantsPercentage,
        message: `Estás gastando el ${wantsPercentage.toFixed(1)}% en deseos. Considera reducir entretenimiento o compras innecesarias.`,
      });
    }

    // Debt should be manageable
    if (summary.debtToIncomeRatio > 20) {
      recommendations.push({
        category: 'Deudas',
        currentAmount: debtTotal,
        recommendedAmount: totalIncome * 0.2,
        percentage: summary.debtToIncomeRatio,
        message: `Tus deudas consumen el ${summary.debtToIncomeRatio.toFixed(1)}% de tus ingresos. Prioriza pagar deudas con mayor interés.`,
      });
    }

    // Savings recommendation
    if (summary.savingsRate < 20) {
      recommendations.push({
        category: 'Ahorro',
        currentAmount: summary.balance,
        recommendedAmount: totalIncome * 0.2,
        percentage: summary.savingsRate,
        message: `Estás ahorrando solo el ${summary.savingsRate.toFixed(1)}% de tus ingresos. Intenta ahorrar al menos el 20%.`,
      });
    }

    return recommendations;
  }, [getSummary, getExpensesByCategory]);

  const getUpcomingPayments = useCallback((): PaymentReminder[] => {
    const today = new Date();

    return data.debts
      .filter(d => d.remainingInstallments > 0)
      .map(debt => {
        const dueDate = new Date(debt.nextPaymentDate);
        return {
          id: crypto.randomUUID(),
          debtId: debt.id,
          name: debt.name,
          amount: debt.monthlyPayment,
          dueDate: debt.nextPaymentDate,
          isPaid: dueDate < today,
        };
      })
      .filter(r => !r.isPaid)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [data.debts]);

  return {
    transactions: data.transactions,
    debts: data.debts,
    customCategories: data.customCategories,
    savingsGoals: data.savingsGoals,
    isLoaded,
    isSyncing,
    lastSync,
    syncNow,
    addTransaction,
    deleteTransaction,
    editTransaction,
    addDebt,
    deleteDebt,
    updateDebtPayment,
    addCustomCategory,
    deleteCustomCategory,
    editCustomCategory,
    addSavingsGoal,
    deleteSavingsGoal,
    contributeToGoal,
    getSummary,
    getExpensesByCategory,
    getRecommendations,
    getUpcomingPayments,
  };
}

function calculateNextPaymentDate(currentDate: string): string {
  const date = new Date(currentDate);
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().split('T')[0];
}
