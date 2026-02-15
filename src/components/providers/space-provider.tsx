'use client';

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { SpaceListItem } from '@/lib/spaces';

type SpacesResponse = {
    activeSpaceId: string;
    spaces: SpaceListItem[];
};

type SpaceContextValue = {
    spaces: SpaceListItem[];
    activeSpaceId: string | null;
    activeSpace: SpaceListItem | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
    setActiveSpace: (spaceId: string) => Promise<void>;
};

const EMPTY_SPACES: SpaceListItem[] = [];

const SpaceContext = createContext<SpaceContextValue | null>(null);

export function SpaceProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();

    const spacesQuery = useQuery({
        queryKey: ['spaces'],
        queryFn: async () => {
            const response = await fetch('/api/spaces', {
                credentials: 'include',
                cache: 'no-store',
            });
            const body = (await response.json().catch(() => null)) as SpacesResponse | null;
            if (!response.ok) {
                throw new Error((body as any)?.error || 'No se pudieron cargar los espacios.');
            }
            return body as SpacesResponse;
        },
        staleTime: 30 * 1000,
        refetchOnMount: 'always',
        retry: 1,
    });

    const spaces = spacesQuery.data?.spaces ?? EMPTY_SPACES;
    const activeSpaceId = spacesQuery.data?.activeSpaceId ?? null;
    const spacesError = spacesQuery.error instanceof Error ? spacesQuery.error.message : null;

    const activeSpace = useMemo(() => {
        if (!activeSpaceId) return null;
        return spaces.find((space) => space.id === activeSpaceId) ?? null;
    }, [activeSpaceId, spaces]);

    const refresh = useCallback(async () => {
        await queryClient.invalidateQueries({ queryKey: ['spaces'] });
    }, [queryClient]);

    const setActiveSpace = useCallback(
        async (spaceId: string) => {
            if (!spaceId) return;
            if (spaceId === activeSpaceId) return;

            const response = await fetch('/api/spaces/active', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ spaceId }),
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) {
                toast.error(body?.error || 'No se pudo cambiar el espacio.');
                return;
            }

            // Refresh spaces and invalidate all cached finance queries.
            await queryClient.invalidateQueries({ queryKey: ['spaces'] });
            queryClient.invalidateQueries({ queryKey: ['debts'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['savings'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
            queryClient.invalidateQueries({ queryKey: ['recurring'] });
            queryClient.invalidateQueries({ queryKey: ['obligations'] });
            queryClient.invalidateQueries({ queryKey: ['audit'] });

            toast.success('Espacio actualizado');
        },
        [activeSpaceId, queryClient]
    );

    const value = useMemo<SpaceContextValue>(
        () => ({
            spaces,
            activeSpaceId,
            activeSpace,
            isLoading: spacesQuery.isLoading,
            error: spacesError,
            refresh,
            setActiveSpace,
        }),
        [activeSpace, activeSpaceId, refresh, setActiveSpace, spaces, spacesError, spacesQuery.isLoading]
    );

    return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace() {
    const ctx = useContext(SpaceContext);
    if (!ctx) {
        throw new Error('useSpace must be used within <SpaceProvider>');
    }
    return ctx;
}
