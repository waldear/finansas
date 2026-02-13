import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Debt, DebtInput, DebtUpdate, SavingsGoal, SavingsGoalInput, SavingsGoalUpdate } from '@/lib/schemas';
import { toast } from 'sonner';

type ConfirmDebtPaymentInput = {
    debtId: string;
    paymentAmount?: number;
    paymentDate?: string;
    description?: string;
};

type UpdateDebtInput = {
    debtId: string;
    changes: DebtUpdate;
};

type UpdateGoalInput = {
    goalId: string;
    changes: SavingsGoalUpdate;
};

export function useFinance() {
    const queryClient = useQueryClient();

    const debtsQuery = useQuery({
        queryKey: ['debts'],
        queryFn: async () => {
            const res = await fetch('/api/debts', { credentials: 'include', cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar deudas');
            return (body || []) as Debt[];
        },
        staleTime: 5 * 60 * 1000,
        refetchOnMount: 'always',
    });

    const goalsQuery = useQuery({
        queryKey: ['savings'],
        queryFn: async () => {
            const res = await fetch('/api/savings', { credentials: 'include', cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar metas');
            return (body || []) as SavingsGoal[];
        },
        staleTime: 5 * 60 * 1000,
        refetchOnMount: 'always',
    });

    const addDebt = useMutation({
        mutationFn: async (newDebt: DebtInput) => {
            const res = await fetch('/api/debts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newDebt),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al agregar deuda');
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] });
            toast.success('Deuda agregada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al agregar deuda');
        },
    });

    const addGoal = useMutation({
        mutationFn: async (newGoal: SavingsGoalInput) => {
            const res = await fetch('/api/savings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newGoal),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al agregar meta');
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings'] });
            toast.success('Meta de ahorro agregada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al agregar meta');
        },
    });

    const updateDebt = useMutation({
        mutationFn: async ({ debtId, changes }: UpdateDebtInput) => {
            const res = await fetch(`/api/debts/${debtId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(changes),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo actualizar la deuda');
            return body as Debt;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] });
            toast.success('Deuda actualizada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo actualizar la deuda');
        },
    });

    const deleteDebt = useMutation({
        mutationFn: async (debtId: string) => {
            const res = await fetch(`/api/debts/${debtId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo eliminar la deuda');
            return body as { success: boolean; id: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['debts'] });
            toast.success('Deuda eliminada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo eliminar la deuda');
        },
    });

    const updateGoal = useMutation({
        mutationFn: async ({ goalId, changes }: UpdateGoalInput) => {
            const res = await fetch(`/api/savings/${goalId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(changes),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo actualizar la meta');
            return body as SavingsGoal;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings'] });
            toast.success('Meta actualizada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo actualizar la meta');
        },
    });

    const deleteGoal = useMutation({
        mutationFn: async (goalId: string) => {
            const res = await fetch(`/api/savings/${goalId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo eliminar la meta');
            return body as { success: boolean; id: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['savings'] });
            toast.success('Meta eliminada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo eliminar la meta');
        },
    });

    const confirmDebtPayment = useMutation({
        mutationFn: async (payload: ConfirmDebtPaymentInput) => {
            const { debtId, paymentAmount, paymentDate, description } = payload;
            const res = await fetch(`/api/debts/${debtId}/confirm-payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    payment_amount: paymentAmount,
                    payment_date: paymentDate,
                    description,
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo confirmar el pago');
            return body;
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['debts'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['obligations'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });

            if (result?.obligationUpdated) {
                toast.success('Pago confirmado y obligación marcada como pagada');
                return;
            }

            toast.success('Pago confirmado correctamente');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo confirmar el pago');
        },
    });

    return {
        debts: debtsQuery.data || [],
        isLoadingDebts: debtsQuery.isLoading,
        debtsError: debtsQuery.error instanceof Error ? debtsQuery.error.message : null,
        savingsGoals: goalsQuery.data || [],
        isLoadingGoals: goalsQuery.isLoading,
        goalsError: goalsQuery.error instanceof Error ? goalsQuery.error.message : null,
        addDebt: addDebt.mutateAsync,
        addGoal: addGoal.mutateAsync,
        updateDebt: updateDebt.mutateAsync,
        deleteDebt: deleteDebt.mutateAsync,
        updateGoal: updateGoal.mutateAsync,
        deleteGoal: deleteGoal.mutateAsync,
        confirmDebtPayment: confirmDebtPayment.mutateAsync,
        isAddingDebt: addDebt.isPending,
        isAddingGoal: addGoal.isPending,
        isUpdatingDebt: updateDebt.isPending,
        isDeletingDebt: deleteDebt.isPending,
        isUpdatingGoal: updateGoal.isPending,
        isDeletingGoal: deleteGoal.isPending,
        isConfirmingDebtPayment: confirmDebtPayment.isPending,
    };
}
