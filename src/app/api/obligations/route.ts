import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { ObligationSchema } from '@/lib/schemas';
import { recordAuditEvent } from '@/lib/audit';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

export async function GET() {
    const context = createRequestContext('/api/obligations', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data, error } = await supabase
            .from('obligations')
            .select('*')
            .eq('user_id', session.user.id)
            .order('due_date', { ascending: true });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        logInfo('obligations_loaded', {
            ...context,
            userId: session.user.id,
            count: data?.length || 0,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error) {
        logError('obligations_get_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al cargar obligaciones' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/obligations', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const validated = ObligationSchema.parse({
            ...body,
            status: body.status || 'pending',
        });

        const { data, error } = await supabase
            .from('obligations')
            .insert({
                ...validated,
                user_id: session.user.id,
            })
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'obligation',
            entityId: data.id,
            action: 'create',
            afterData: data,
        });

        logInfo('obligation_created', {
            ...context,
            userId: session.user.id,
            obligationId: data.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(data);
    } catch (error: any) {
        logError('obligation_create_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message }, { status: 400 });
    }
}
