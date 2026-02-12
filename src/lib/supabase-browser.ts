import { createBrowserClient } from '@supabase/ssr';
import { sanitizeEnv } from './utils';

export function createClient() {
    const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!url || !key) {
        // Return a mock or null if env vars are missing during build/SSR
        return null as any;
    }

    return createBrowserClient(url, key);
}
