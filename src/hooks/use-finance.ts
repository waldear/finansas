import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Debt, SavingsGoal } from '@/lib/schemas';
import { toast } from 'sonner';

export function useFinance() {
    const queryClient = useQueryClient();

    const debtsQuery = useQuery({
        queryKey: ['debts'],
        queryFn: async () => {
            const res = await fetch('/api/debts', { credentials: 'include' });
            if (!res.ok) throw new Error('Error al cargar deudas');
            return res.json() as Promise<Debt[]>;
        },
    });

    const goalsQuery = useQuery({
        queryKey: ['savings'],
        queryFn: async () => {
            const res = await fetch('/api/savings', { credentials: 'include' });
            if (!res.ok) throw new Error('Error al cargar metas');
            return res.json() as Promise<SavingsGoal[]>;
        },
    });

    const addDebt = useMutation({
        mutationFn: async (newDebt: Debt) => {
            const res = await fetch('/api/debts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newDebt),
            });
            if (!res.ok) throw new Error('Error al agregar deuda');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] });
            toast.success('Deuda agregada');
        },
    });

    const addGoal = useMutation({
        mutationFn: async (newGoal: SavingsGoal) => {
            const res = await fetch('/api/savings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newGoal),
            });
            if (!res.ok) throw new Error('Error al agregar meta');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings'] });
            toast.success('Meta de ahorro agregada');
        },
    });

    return {
        debts: debtsQuery.data || [],
        isLoadingDebts: debtsQuery.isLoading,
        savingsGoals: goalsQuery.data || [],
        isLoadingGoals: goalsQuery.isLoading,
        addDebt: addDebt.mutate,
        addGoal: addGoal.mutate,
    };
}
