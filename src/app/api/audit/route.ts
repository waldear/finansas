import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

export async function GET(req: Request) {
    const context = createRequestContext('/api/audit', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);

        const { data, error } = await supabase
            .from('audit_events')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        logInfo('audit_loaded', {
            ...context,
            userId: session.user.id,
            count: data?.length || 0,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error) {
        logError('audit_get_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al cargar auditoría' }, { status: 500 });
    }
}
