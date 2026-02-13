'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase-browser';

export function AuthQuerySync() {
    const queryClient = useQueryClient();
    const currentUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        const supabase = createClient();
        if (!supabase) return;

        let isMounted = true;

        const syncCurrentUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!isMounted) return;

            const nextUserId = user?.id ?? null;
            if (currentUserIdRef.current !== null && currentUserIdRef.current !== nextUserId) {
                queryClient.clear();
            }
            currentUserIdRef.current = nextUserId;
        };

        syncCurrentUser().catch(() => {});

        const { data } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
            const nextUserId = session?.user?.id ?? null;
            if (currentUserIdRef.current !== nextUserId) {
                currentUserIdRef.current = nextUserId;
                queryClient.clear();
            }
        });

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                syncCurrentUser().catch(() => {});
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            isMounted = false;
            data.subscription.unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [queryClient]);

    return null;
}
