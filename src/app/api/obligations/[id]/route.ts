import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { ObligationSchema } from '@/lib/schemas';
import { recordAuditEvent } from '@/lib/audit';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { ensureActiveSpace } from '@/lib/spaces';

const ObligationUpdateSchema = ObligationSchema.omit({ id: true, user_id: true })
    .partial()
    .refine((payload) => Object.keys(payload).length > 0, {
        message: 'Debes enviar al menos un campo para actualizar',
    });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const context = createRequestContext('/api/obligations/[id]', 'PUT');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data: before, error: beforeError } = await supabase
            .from('obligations')
            .select('*')
            .eq('id', id)
            .eq('space_id', activeSpaceId)
            .single();

        if (beforeError || !before) {
            return NextResponse.json({ error: 'Obligación no encontrada' }, { status: 404 });
        }

        const body = await req.json().catch(() => ({}));
        const changes = ObligationUpdateSchema.parse(body);

        const { data: updated, error: updateError } = await supabase
            .from('obligations')
            .update(changes)
            .eq('id', id)
            .eq('space_id', activeSpaceId)
            .select()
            .single();

        if (updateError || !updated) {
            return NextResponse.json({ error: updateError?.message || 'No se pudo actualizar la obligación.' }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'obligation',
            entityId: updated.id,
            action: 'update',
            beforeData: before,
            afterData: updated,
        });

        logInfo('obligation_updated', {
            ...context,
            userId: session.user.id,
            obligationId: updated.id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json(updated);
    } catch (error) {
        const zodError = error as z.ZodError;
        logError('obligation_update_exception', error, {
            ...context,
            obligationId: id,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
            { error: (zodError as any)?.errors || (error instanceof Error ? error.message : 'Datos inválidos') },
            { status: 400 }
        );
    }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const context = createRequestContext('/api/obligations/[id]', 'DELETE');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) {
            return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const { data: before, error: beforeError } = await supabase
            .from('obligations')
            .select('*')
            .eq('id', id)
            .eq('space_id', activeSpaceId)
            .single();

        if (beforeError || !before) {
            return NextResponse.json({ error: 'Obligación no encontrada' }, { status: 404 });
        }

        const { error: deleteError } = await supabase
            .from('obligations')
            .delete()
            .eq('id', id)
            .eq('space_id', activeSpaceId);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message || 'No se pudo eliminar la obligación.' }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'obligation',
            entityId: id,
            action: 'delete',
            beforeData: before,
        });

        logInfo('obligation_deleted', {
            ...context,
            userId: session.user.id,
            obligationId: id,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({ success: true, id });
    } catch (error) {
        logError('obligation_delete_exception', error, {
            ...context,
            obligationId: id,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo eliminar la obligación.' }, { status: 500 });
    }
}
