import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    Budget,
    BudgetInput,
    BudgetUpdate,
    RecurringTransaction,
    RecurringTransactionInput,
    RecurringTransactionUpdate,
} from '@/lib/schemas';
import { useSpace } from '@/components/providers/space-provider';

type UpdateBudgetInput = {
    budgetId: string;
    changes: BudgetUpdate;
};

type UpdateRecurringInput = {
    recurringId: string;
    changes: RecurringTransactionUpdate;
};

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function usePlanning(month = currentMonth()) {
    const queryClient = useQueryClient();
    const { activeSpaceId, isLoading: isLoadingSpaces, error: spacesError } = useSpace();

    const budgetsQuery = useQuery({
        queryKey: ['budgets', month, activeSpaceId],
        queryFn: async () => {
            const response = await fetch(`/api/budgets?month=${month}`, { credentials: 'include', cache: 'no-store' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al cargar presupuestos');
            return (body || []) as Array<Budget & {
                spent: number;
                remaining: number;
                usage: number;
                isAlert: boolean;
            }>;
        },
        staleTime: 2 * 60 * 1000,
        refetchOnMount: 'always',
        enabled: Boolean(activeSpaceId),
    });

    const recurringQuery = useQuery({
        queryKey: ['recurring', activeSpaceId],
        queryFn: async () => {
            const response = await fetch('/api/recurring', { credentials: 'include', cache: 'no-store' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al cargar recurrencias');
            return (body || []) as RecurringTransaction[];
        },
        staleTime: 2 * 60 * 1000,
        refetchOnMount: 'always',
        enabled: Boolean(activeSpaceId),
    });

    const addBudget = useMutation({
        mutationFn: async (budget: BudgetInput) => {
            const response = await fetch('/api/budgets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(budget),
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al guardar presupuesto');
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            toast.success('Presupuesto guardado');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al guardar presupuesto');
        },
    });

    const addRecurring = useMutation({
        mutationFn: async (rule: RecurringTransactionInput) => {
            const response = await fetch('/api/recurring', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(rule),
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al guardar recurrencia');
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recurring'] });
            toast.success('Regla recurrente creada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al guardar recurrencia');
        },
    });

    const updateBudget = useMutation({
        mutationFn: async ({ budgetId, changes }: UpdateBudgetInput) => {
            const response = await fetch(`/api/budgets/${budgetId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(changes),
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al actualizar presupuesto');
            return body as Budget;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            toast.success('Presupuesto actualizado');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al actualizar presupuesto');
        },
    });

    const deleteBudget = useMutation({
        mutationFn: async (budgetId: string) => {
            const response = await fetch(`/api/budgets/${budgetId}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al eliminar presupuesto');
            return body as { success: boolean; id: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            toast.success('Presupuesto eliminado');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al eliminar presupuesto');
        },
    });

    const updateRecurring = useMutation({
        mutationFn: async ({ recurringId, changes }: UpdateRecurringInput) => {
            const response = await fetch(`/api/recurring/${recurringId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(changes),
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al actualizar recurrencia');
            return body as RecurringTransaction;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recurring'] });
            toast.success('Regla recurrente actualizada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al actualizar recurrencia');
        },
    });

    const deleteRecurring = useMutation({
        mutationFn: async (recurringId: string) => {
            const response = await fetch(`/api/recurring/${recurringId}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al eliminar recurrencia');
            return body as { success: boolean; id: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['recurring'] });
            toast.success('Regla recurrente eliminada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al eliminar recurrencia');
        },
    });

    const runRecurring = useMutation({
        mutationFn: async () => {
            const response = await fetch('/api/recurring/run', {
                method: 'POST',
                credentials: 'include',
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al ejecutar recurrencias');
            return body as { generated: number };
        },
        onSuccess: (result) => {
            if (result.generated > 0) {
                toast.success(`Se generaron ${result.generated} transacciones automáticas`);
            }
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            queryClient.invalidateQueries({ queryKey: ['recurring'] });
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al ejecutar recurrencias');
        },
    });

    return {
        budgets: budgetsQuery.data || [],
        recurringTransactions: recurringQuery.data || [],
        isLoadingBudgets: isLoadingSpaces || !activeSpaceId || budgetsQuery.isLoading,
        isLoadingRecurring: isLoadingSpaces || !activeSpaceId || recurringQuery.isLoading,
        budgetsError: spacesError || (budgetsQuery.error instanceof Error ? budgetsQuery.error.message : null),
        recurringError: spacesError || (recurringQuery.error instanceof Error ? recurringQuery.error.message : null),
        addBudget: addBudget.mutateAsync,
        addRecurring: addRecurring.mutateAsync,
        updateBudget: updateBudget.mutateAsync,
        deleteBudget: deleteBudget.mutateAsync,
        updateRecurring: updateRecurring.mutateAsync,
        deleteRecurring: deleteRecurring.mutateAsync,
        runRecurring: runRecurring.mutateAsync,
        isRunningRecurring: runRecurring.isPending,
        isAddingBudget: addBudget.isPending,
        isAddingRecurring: addRecurring.isPending,
        isUpdatingBudget: updateBudget.isPending,
        isDeletingBudget: deleteBudget.isPending,
        isUpdatingRecurring: updateRecurring.isPending,
        isDeletingRecurring: deleteRecurring.isPending,
    };
}
