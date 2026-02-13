import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Debt, SavingsGoal } from '@/lib/schemas';
import { toast } from 'sonner';

type ConfirmDebtPaymentInput = {
    debtId: string;
    paymentAmount?: number;
    paymentDate?: string;
    description?: string;
};

export function useFinance() {
    const queryClient = useQueryClient();

    const debtsQuery = useQuery({
        queryKey: ['debts'],
        queryFn: async () => {
            const res = await fetch('/api/debts', { credentials: 'include' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar deudas');
            return (body || []) as Debt[];
        },
        staleTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    const goalsQuery = useQuery({
        queryKey: ['savings'],
        queryFn: async () => {
            const res = await fetch('/api/savings', { credentials: 'include' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar metas');
            return (body || []) as SavingsGoal[];
        },
        staleTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    const addDebt = useMutation({
        mutationFn: async (newDebt: Debt) => {
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
        mutationFn: async (newGoal: SavingsGoal) => {
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
        confirmDebtPayment: confirmDebtPayment.mutateAsync,
        isAddingDebt: addDebt.isPending,
        isAddingGoal: addGoal.isPending,
        isConfirmingDebtPayment: confirmDebtPayment.isPending,
    };
}
