import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Transaction } from '@/lib/schemas';
import { toast } from 'sonner';

export function useTransactions() {
    const queryClient = useQueryClient();

    const transactionsQuery = useQuery({
        queryKey: ['transactions'],
        queryFn: async () => {
            const res = await fetch('/api/transactions');
            if (!res.ok) throw new Error('Error al cargar transacciones');
            return res.json() as Promise<Transaction[]>;
        },
    });

    const addTransaction = useMutation({
        mutationFn: async (newTransaction: Transaction) => {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTransaction),
            });
            if (!res.ok) throw new Error('Error al agregar transacción');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            toast.success('Transacción agregada correctamente');
        },
        onError: (error: any) => {
            toast.error(error.message || 'Error al agregar transacción');
        },
    });

    return {
        transactions: transactionsQuery.data || [],
        isLoading: transactionsQuery.isLoading,
        addTransaction: addTransaction.mutate,
        isAdding: addTransaction.isPending,
    };
}
