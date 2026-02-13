import { useQuery } from '@tanstack/react-query';

export interface AuditEvent {
    id: string;
    entity_type: string;
    entity_id: string;
    action: 'create' | 'update' | 'delete' | 'system';
    metadata: Record<string, unknown> | null;
    created_at: string;
}

export function useAudit(limit = 50) {
    const query = useQuery({
        queryKey: ['audit', limit],
        queryFn: async () => {
            const response = await fetch(`/api/audit?limit=${limit}`, { credentials: 'include', cache: 'no-store' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'Error al cargar auditoría');
            return (body || []) as AuditEvent[];
        },
        staleTime: 60 * 1000,
        refetchOnMount: 'always',
    });

    return {
        events: query.data || [],
        isLoading: query.isLoading,
        error: query.error,
    };
}
