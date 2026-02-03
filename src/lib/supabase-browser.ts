import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        // Return a mock or null if env vars are missing during build/SSR
        return null as any;
    }

    return createBrowserClient(url, key);
}
