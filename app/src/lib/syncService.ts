import { supabase } from './supabase';
import type { Transaction, Debt, Category, SavingsGoal } from '@/types/finance';

export interface SyncData {
  transactions: Transaction[];
  debts: Debt[];
  reminders: any[];
  customCategories: Category[];
  savingsGoals: SavingsGoal[];
}

export async function syncToCloud(data: SyncData): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'No hay usuario autenticado' };
    }

    const userId = user.id;

    // Sync transactions
    if (data.transactions.length > 0) {
      const { error: txError } = await supabase
        .from('transactions')
        .upsert(
          data.transactions.map(t => ({
            id: t.id,
            user_id: userId,
            type: t.type,
            amount: t.amount,
            description: t.description,
            category: t.category,
            date: t.date,
            created_at: t.createdAt,
          })),
          { onConflict: 'id' }
        );
      if (txError) throw txError;
    }

    // Sync debts
    if (data.debts.length > 0) {
      const { error: debtError } = await supabase
        .from('debts')
        .upsert(
          data.debts.map(d => ({
            id: d.id,
            user_id: userId,
            name: d.name,
            total_amount: d.totalAmount,
            monthly_payment: d.monthlyPayment,
            remaining_installments: d.remainingInstallments,
            total_installments: d.totalInstallments,
            category: d.category,
            next_payment_date: d.nextPaymentDate,
            created_at: d.createdAt,
          })),
          { onConflict: 'id' }
        );
      if (debtError) throw debtError;
    }

    // Sync custom categories
    if (data.customCategories.length > 0) {
      const { error: catError } = await supabase
        .from('custom_categories')
        .upsert(
          data.customCategories.map(c => ({
            id: c.id,
            user_id: userId,
            name: c.name,
            type: c.type,
            color: c.color,
            icon: c.icon,
          })),
          { onConflict: 'id' }
        );
      if (catError) throw catError;
    }

    // Sync savings goals
    if (data.savingsGoals.length > 0) {
      const { error: goalError } = await supabase
        .from('savings_goals')
        .upsert(
          data.savingsGoals.map(g => ({
            id: g.id,
            user_id: userId,
            name: g.name,
            target_amount: g.targetAmount,
            current_amount: g.currentAmount,
            deadline: g.deadline,
            category: g.category,
            color: g.color,
            icon: g.icon,
            is_completed: g.isCompleted,
            created_at: g.createdAt,
          })),
          { onConflict: 'id' }
        );
      if (goalError) throw goalError;
    }

    // Note: reminders are not synced to cloud yet (local only)

    return { success: true };
  } catch (error: any) {
    console.error('Sync error:', error);
    return { success: false, error: error.message };
  }
}

export async function fetchFromCloud(): Promise<{ data?: SyncData; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: 'No hay usuario autenticado' };
    }

    const userId = user.id;

    // Fetch transactions
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (txError) throw txError;

    // Fetch debts
    const { data: debts, error: debtError } = await supabase
      .from('debts')
      .select('*')
      .eq('user_id', userId);
    if (debtError) throw debtError;

    // Fetch custom categories
    const { data: categories, error: catError } = await supabase
      .from('custom_categories')
      .select('*')
      .eq('user_id', userId);
    if (catError) throw catError;

    // Fetch savings goals
    const { data: goals, error: goalError } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('user_id', userId);
    if (goalError) throw goalError;

    return {
      data: {
        transactions: transactions?.map(t => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          description: t.description,
          category: t.category,
          date: t.date,
          createdAt: t.created_at,
        })) || [],
        debts: debts?.map(d => ({
          id: d.id,
          name: d.name,
          totalAmount: d.total_amount,
          monthlyPayment: d.monthly_payment,
          remainingInstallments: d.remaining_installments,
          totalInstallments: d.total_installments,
          category: d.category,
          nextPaymentDate: d.next_payment_date,
          createdAt: d.created_at,
        })) || [],
        reminders: [],
        customCategories: categories?.map(c => ({
          id: c.id,
          name: c.name,
          type: c.type,
          color: c.color,
          icon: c.icon,
        })) || [],
        savingsGoals: goals?.map(g => ({
          id: g.id,
          name: g.name,
          targetAmount: g.target_amount,
          currentAmount: g.current_amount,
          deadline: g.deadline,
          category: g.category,
          color: g.color,
          icon: g.icon,
          isCompleted: g.is_completed,
          createdAt: g.created_at,
        })) || [],
      },
    };
  } catch (error: any) {
    console.error('Fetch error:', error);
    return { error: error.message };
  }
}

export async function deleteFromCloud(type: 'transaction' | 'debt' | 'category' | 'goal', id: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const userId = user.id;
    const tableMap = {
      transaction: 'transactions',
      debt: 'debts',
      category: 'custom_categories',
      goal: 'savings_goals',
    };

    const { error } = await supabase
      .from(tableMap[type])
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
}
