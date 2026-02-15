import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { ensureActiveSpace } from '@/lib/spaces';

export async function GET(req: Request) {
    const context = createRequestContext('/api/audit', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const url = new URL(req.url);
        const limit = Math.min(Number(url.searchParams.get('limit') || 200), 2000);
        const from = url.searchParams.get('from');
        const to = url.searchParams.get('to');
        const entityType = url.searchParams.get('entity_type');
        const action = url.searchParams.get('action');

        let query = supabase
            .from('audit_events')
            .select('*')
            .eq('space_id', activeSpaceId)
            .order('created_at', { ascending: false });

        if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
            query = query.gte('created_at', `${from}T00:00:00.000Z`);
        }

        if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
            query = query.lte('created_at', `${to}T23:59:59.999Z`);
        }

        if (entityType) {
            query = query.eq('entity_type', entityType);
        }

        if (action) {
            query = query.eq('action', action);
        }

        const { data, error } = await query.limit(limit);

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
