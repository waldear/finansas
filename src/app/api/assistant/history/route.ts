import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logWarn } from '@/lib/observability';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
};

export async function GET() {
    const context = createRequestContext('/api/assistant/history', 'GET');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data, error } = await supabase
            .from('audit_events')
            .select('id, created_at, metadata')
            .eq('user_id', session.user.id)
            .eq('entity_type', 'assistant_chat')
            .eq('entity_id', 'main')
            .order('created_at', { ascending: true })
            .limit(300);

        if (error) {
            logWarn('assistant_history_query_warning', {
                ...context,
                userId: session.user.id,
                reason: error.message,
                durationMs: Date.now() - startedAt,
            });
            return NextResponse.json([]);
        }

        const messages: ChatMessage[] = (data || [])
            .map((row: any) => {
                const role = row?.metadata?.role === 'assistant' ? 'assistant' : 'user';
                const content = typeof row?.metadata?.content === 'string' ? row.metadata.content.trim() : '';
                if (!content) return null;

                return {
                    id: row.id,
                    role,
                    content,
                    createdAt: row.created_at,
                };
            })
            .filter(Boolean) as ChatMessage[];

        return NextResponse.json(messages);
    } catch (error) {
        logError('assistant_history_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo cargar el historial del asistente.' }, { status: 500 });
    }
}
