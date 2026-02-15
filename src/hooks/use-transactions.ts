import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction, TransactionInput, TransactionUpdate } from '@/lib/schemas';
import { toast } from 'sonner';
import { useSpace } from '@/components/providers/space-provider';

type UpdateTransactionInput = {
    id: string;
    changes: TransactionUpdate;
};

export function useTransactions() {
    const queryClient = useQueryClient();
    const { activeSpaceId, isLoading: isLoadingSpaces, error: spacesError } = useSpace();

    const transactionsQuery = useQuery({
        queryKey: ['transactions', activeSpaceId],
        queryFn: async () => {
            const res = await fetch('/api/transactions', { credentials: 'include', cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar transacciones');
            return (body || []) as Transaction[];
        },
        staleTime: 5 * 60 * 1000,
        refetchOnMount: 'always',
        enabled: Boolean(activeSpaceId),
    });

    const addTransaction = useMutation({
        mutationFn: async (newTransaction: TransactionInput) => {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(newTransaction),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al agregar transacción');
            return body;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            toast.success('Transacción agregada correctamente');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al agregar transacción');
        },
    });

    const updateTransaction = useMutation({
        mutationFn: async ({ id, changes }: UpdateTransactionInput) => {
            const res = await fetch(`/api/transactions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(changes),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo actualizar la transacción');
            return body as Transaction;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            toast.success('Transacción actualizada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo actualizar la transacción');
        },
    });

    const deleteTransaction = useMutation({
        mutationFn: async (transactionId: string) => {
            const res = await fetch(`/api/transactions/${transactionId}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo eliminar la transacción');
            return body as { success: boolean; id: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            toast.success('Transacción eliminada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo eliminar la transacción');
        },
    });

    return {
        transactions: transactionsQuery.data || [],
        isLoading: isLoadingSpaces || !activeSpaceId || transactionsQuery.isLoading,
        error: spacesError || (transactionsQuery.error instanceof Error ? transactionsQuery.error.message : null),
        addTransaction: addTransaction.mutate,
        addTransactionAsync: addTransaction.mutateAsync,
        isAdding: addTransaction.isPending,
        updateTransaction: updateTransaction.mutateAsync,
        isUpdating: updateTransaction.isPending,
        deleteTransaction: deleteTransaction.mutateAsync,
        isDeleting: deleteTransaction.isPending,
    };
}
