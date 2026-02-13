import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { sanitizeEnv } from '@/lib/utils';

export function createServiceClient() {
    const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const serviceRoleKey = sanitizeEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!url || !serviceRoleKey) {
        return null;
    }

    return createSupabaseClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });
}
