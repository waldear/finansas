import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';

const BodySchema = z.object({
    spaceId: z.string().uuid(),
    expiresInDays: z.coerce.number().int().min(1).max(365).optional().nullable(),
});

function generateInviteCode() {
    // ~12 chars base64url (safe for copy/paste)
    return crypto.randomBytes(9).toString('base64url');
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/spaces/invites', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const validated = BodySchema.parse(body);

        const { data: membership, error: membershipError } = await supabase
            .from('space_members')
            .select('role')
            .eq('space_id', validated.spaceId)
            .eq('user_id', session.user.id)
            .maybeSingle();

        if (membershipError) {
            return NextResponse.json({ error: membershipError.message }, { status: 500 });
        }

        const role = String(membership?.role || '');
        if (role !== 'owner' && role !== 'admin') {
            return NextResponse.json({ error: 'Solo admins pueden crear invitaciones.' }, { status: 403 });
        }

        const expiresAt = validated.expiresInDays
            ? new Date(Date.now() + validated.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
            : null;

        let lastError = '';
        for (let attempt = 0; attempt < 3; attempt++) {
            const code = generateInviteCode();
            const { data, error } = await supabase
                .from('space_invites')
                .insert({
                    space_id: validated.spaceId,
                    code,
                    created_by: session.user.id,
                    expires_at: expiresAt,
                })
                .select('id, code, space_id, created_at, expires_at')
                .single();

            if (!error && data) {
                logInfo('space_invite_created', {
                    ...context,
                    userId: session.user.id,
                    spaceId: validated.spaceId,
                    inviteId: data.id,
                    durationMs: Date.now() - startedAt,
                });

                return NextResponse.json({ invite: data });
            }

            lastError = error?.message || 'No se pudo crear la invitación.';
            // Retry only on rare collisions.
            if (!/duplicate key|unique/i.test(lastError)) {
                break;
            }
        }

        return NextResponse.json({ error: lastError || 'No se pudo crear la invitación.' }, { status: 500 });
    } catch (error: any) {
        logError('space_invite_create_exception', error, { ...context, durationMs: Date.now() - startedAt });
        return NextResponse.json({ error: error?.errors || error?.message || 'No se pudo crear la invitación.' }, { status: 400 });
    }
}
