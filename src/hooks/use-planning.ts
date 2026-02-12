import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Budget, RecurringTransaction } from '@/lib/schemas';

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function usePlanning(month = currentMonth()) {
    const queryClient = useQueryClient();

    const budgetsQuery = useQuery({
        queryKey: ['budgets', month],
        queryFn: async () => {
            const response = await fetch(`/api/budgets?month=${month}`, { credentials: 'include' });
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
        placeholderData: keepPreviousData,
    });

    const recurringQuery = useQuery({
        queryKey: ['recurring'],
        queryFn: async () => {
            const response = await fetch('/api/recurring', { credentials: 'include' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al cargar recurrencias');
            return (body || []) as RecurringTransaction[];
        },
        staleTime: 2 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    const addBudget = useMutation({
        mutationFn: async (budget: Budget) => {
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
        mutationFn: async (rule: RecurringTransaction) => {
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
        isLoadingBudgets: budgetsQuery.isLoading,
        isLoadingRecurring: recurringQuery.isLoading,
        budgetsError: budgetsQuery.error instanceof Error ? budgetsQuery.error.message : null,
        recurringError: recurringQuery.error instanceof Error ? recurringQuery.error.message : null,
        addBudget: addBudget.mutateAsync,
        addRecurring: addRecurring.mutateAsync,
        runRecurring: runRecurring.mutateAsync,
        isRunningRecurring: runRecurring.isPending,
        isAddingBudget: addBudget.isPending,
        isAddingRecurring: addRecurring.isPending,
    };
}
