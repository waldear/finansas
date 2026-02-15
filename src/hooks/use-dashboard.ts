import { useQueries } from '@tanstack/react-query';
import { useSpace } from '@/components/providers/space-provider';

export function useDashboard() {
    const { activeSpaceId, isLoading: isLoadingSpaces, error: spacesError } = useSpace();
    const results = useQueries({
        queries: [
            {
                queryKey: ['debts', activeSpaceId],
                queryFn: async () => {
                    const res = await fetch('/api/debts', { credentials: 'include', cache: 'no-store' });
                    if (!res.ok) throw new Error('Error al cargar deudas');
                    return res.json();
                },
                staleTime: 5 * 60 * 1000, // 5 minutes
                refetchOnMount: 'always',
                enabled: Boolean(activeSpaceId),
            },
            {
                queryKey: ['savings', activeSpaceId],
                queryFn: async () => {
                    const res = await fetch('/api/savings', { credentials: 'include', cache: 'no-store' });
                    if (!res.ok) throw new Error('Error al cargar metas');
                    return res.json();
                },
                staleTime: 5 * 60 * 1000,
                refetchOnMount: 'always',
                enabled: Boolean(activeSpaceId),
            },
            {
                queryKey: ['transactions', activeSpaceId],
                queryFn: async () => {
                    const res = await fetch('/api/transactions', { credentials: 'include', cache: 'no-store' });
                    if (!res.ok) throw new Error('Error al cargar transacciones');
                    return res.json();
                },
                staleTime: 2 * 60 * 1000, // 2 minutes (transactions change more often)
                refetchOnMount: 'always',
                enabled: Boolean(activeSpaceId),
            },
        ],
    });

    const [debtsQuery, savingsQuery, transactionsQuery] = results;

    return {
        debts: debtsQuery.data || [],
        savingsGoals: savingsQuery.data || [],
        transactions: transactionsQuery.data || [],
        isLoading: isLoadingSpaces || !activeSpaceId || results.some(r => r.isLoading),
        isError: Boolean(spacesError) || results.some(r => r.isError),
    };
}
