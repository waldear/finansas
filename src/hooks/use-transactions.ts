import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@/lib/schemas';
import { toast } from 'sonner';

export function useTransactions() {
    const queryClient = useQueryClient();

    const transactionsQuery = useQuery({
        queryKey: ['transactions'],
        queryFn: async () => {
            const res = await fetch('/api/transactions', { credentials: 'include' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar transacciones');
            return (body || []) as Transaction[];
        },
        staleTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    const addTransaction = useMutation({
        mutationFn: async (newTransaction: Transaction) => {
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

    return {
        transactions: transactionsQuery.data || [],
        isLoading: transactionsQuery.isLoading,
        error: transactionsQuery.error instanceof Error ? transactionsQuery.error.message : null,
        addTransaction: addTransaction.mutate,
        isAdding: addTransaction.isPending,
    };
}
