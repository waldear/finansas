import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Obligation } from '@/lib/schemas';
import { toast } from 'sonner';

type UpdateObligationInput = {
    id: string;
    changes: Partial<Omit<Obligation, 'id' | 'user_id'>>;
};

type ConfirmObligationPaymentInput = {
    obligationId: string;
    paymentAmount?: number;
    paymentDate?: string;
    description?: string;
};

export function useObligations() {
    const queryClient = useQueryClient();

    const obligationsQuery = useQuery({
        queryKey: ['obligations'],
        queryFn: async () => {
            const res = await fetch('/api/obligations', { credentials: 'include', cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar obligaciones');
            return (body || []) as Obligation[];
        },
        staleTime: 5 * 60 * 1000,
        refetchOnMount: 'always',
    });

    const updateObligation = useMutation({
        mutationFn: async ({ id, changes }: UpdateObligationInput) => {
            const res = await fetch(`/api/obligations/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(changes),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo actualizar la obligación');
            return body as Obligation;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['obligations'] });
            queryClient.invalidateQueries({ queryKey: ['audit'] });
            toast.success('Obligación actualizada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo actualizar la obligación');
        },
    });

    const deleteObligation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/obligations/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'No se pudo eliminar la obligación');
            return body as { success: boolean; id: string };
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['obligations'] });
            queryClient.invalidateQueries({ queryKey: ['audit'] });
            toast.success('Obligación eliminada');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo eliminar la obligación');
        },
    });

    const confirmObligationPayment = useMutation({
        mutationFn: async (payload: ConfirmObligationPaymentInput) => {
            const { obligationId, paymentAmount, paymentDate, description } = payload;
            const res = await fetch(`/api/obligations/${obligationId}/confirm-payment`, {
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
            return body as { obligation: Obligation; transaction: any; remaining: number };
        },
        onSuccess: (result) => {
            queryClient.invalidateQueries({ queryKey: ['obligations'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['audit'] });
            toast.success(result?.remaining > 0 ? 'Pago registrado. Queda saldo pendiente.' : 'Pago registrado y obligación saldada.');
        },
        onError: (error: any) => {
            toast.error(error.message || 'No se pudo confirmar el pago');
        },
    });

    return {
        obligations: obligationsQuery.data || [],
        isLoadingObligations: obligationsQuery.isLoading,
        obligationsError: obligationsQuery.error instanceof Error ? obligationsQuery.error.message : null,
        updateObligation: updateObligation.mutateAsync,
        deleteObligation: deleteObligation.mutateAsync,
        confirmObligationPayment: confirmObligationPayment.mutateAsync,
        isUpdatingObligation: updateObligation.isPending,
        isDeletingObligation: deleteObligation.isPending,
        isConfirmingObligationPayment: confirmObligationPayment.isPending,
    };
}

