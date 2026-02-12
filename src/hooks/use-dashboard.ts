import { keepPreviousData, useQueries } from '@tanstack/react-query';

export function useDashboard() {
    const results = useQueries({
        queries: [
            {
                queryKey: ['debts'],
                queryFn: async () => {
                    const res = await fetch('/api/debts', { credentials: 'include' });
                    if (!res.ok) throw new Error('Error al cargar deudas');
                    return res.json();
                },
                staleTime: 5 * 60 * 1000, // 5 minutes
                placeholderData: keepPreviousData,
            },
            {
                queryKey: ['savings'],
                queryFn: async () => {
                    const res = await fetch('/api/savings', { credentials: 'include' });
                    if (!res.ok) throw new Error('Error al cargar metas');
                    return res.json();
                },
                staleTime: 5 * 60 * 1000,
                placeholderData: keepPreviousData,
            },
            {
                queryKey: ['transactions'],
                queryFn: async () => {
                    const res = await fetch('/api/transactions', { credentials: 'include' });
                    if (!res.ok) throw new Error('Error al cargar transacciones');
                    return res.json();
                },
                staleTime: 2 * 60 * 1000, // 2 minutes (transactions change more often)
                placeholderData: keepPreviousData,
            },
        ],
    });

    const [debtsQuery, savingsQuery, transactionsQuery] = results;

    return {
        debts: debtsQuery.data || [],
        savingsGoals: savingsQuery.data || [],
        transactions: transactionsQuery.data || [],
        isLoading: results.some(r => r.isLoading),
        isError: results.some(r => r.isError),
    };
}
