import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sanitizeEnv } from '@/lib/utils';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const requestedNext = requestUrl.searchParams.get('next') ?? '/dashboard';
    const next = requestedNext.startsWith('/') ? requestedNext : '/dashboard';

    if (code) {
        const cookieStore = await cookies();

        const supabase = createServerClient(
            sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
            sanitizeEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet: { name: string, value: string, options: CookieOptions }[]) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // The `setAll` method was called from a Server Component.
                            // This can be ignored if you have middleware refreshing
                            // user sessions.
                        }
                    },
                },
            }
        );

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
            console.error('Auth callback error:', error.message);
            return NextResponse.redirect(`${requestUrl.origin}/auth?error=callback`);
        }
    }

    // URL to redirect to after sign in process completes
    const origin = process.env.NEXT_PUBLIC_SITE_URL || requestUrl.origin;
    return NextResponse.redirect(`${origin}${next}`);
}
