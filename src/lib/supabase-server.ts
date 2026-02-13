import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { sanitizeEnv } from './utils';

export async function createClient() {
    const url = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const key = sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!url || !key) {
        return null as any;
    }

    const cookieStore = await cookies();

    // Use getAll/setAll so Supabase can handle chunked auth cookies reliably.
    return createServerClient(url, key, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set({ name, value, ...options });
                    });
                } catch {
                    // Called from a Server Component: ignore if middleware refreshes sessions.
                }
            },
        },
    });
}
