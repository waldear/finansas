import type { SupabaseClient, User } from '@supabase/supabase-js';
import { logWarn } from '@/lib/observability';

export type SpaceType = 'personal' | 'family';
export type SpaceRole = 'owner' | 'admin' | 'member';

export type SpaceListItem = {
    id: string;
    name: string;
    type: SpaceType;
    role: SpaceRole;
    created_at?: string | null;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

export async function ensurePersonalSpace(supabase: SupabaseClient, userId: string) {
    const personalSpaceId = userId;

    // Personal space id == user_id, so it is deterministic and easy to backfill.
    await supabase
        .from('spaces')
        .upsert(
            {
                id: personalSpaceId,
                name: 'Personal',
                type: 'personal',
                created_by: userId,
            },
            { onConflict: 'id' }
        );

    await supabase
        .from('space_members')
        .upsert(
            {
                space_id: personalSpaceId,
                user_id: userId,
                role: 'owner',
            },
            { onConflict: 'space_id,user_id' }
        );

    return personalSpaceId;
}

export async function listUserSpaces(supabase: SupabaseClient, userId: string): Promise<SpaceListItem[]> {
    const { data, error } = await supabase
        .from('space_members')
        .select(
            `
            space_id,
            role,
            spaces (
              id,
              name,
              type,
              created_at
            )
        `
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

    if (error) {
        logWarn('spaces_list_failed', { userId, reason: error.message });
        return [];
    }

    const rows = Array.isArray(data) ? (data as any[]) : [];

    return rows
        .map((row) => {
            const space = row?.spaces;
            if (!space?.id || !space?.name) return null;
            return {
                id: String(space.id),
                name: String(space.name),
                type: (space.type === 'family' ? 'family' : 'personal') as SpaceType,
                role: (row?.role === 'owner' || row?.role === 'admin' ? row.role : 'member') as SpaceRole,
                created_at: space.created_at ? String(space.created_at) : null,
            } satisfies SpaceListItem;
        })
        .filter(Boolean) as SpaceListItem[];
}

export async function ensureActiveSpace(
    supabase: SupabaseClient,
    user: User
): Promise<{ activeSpaceId: string; spaces: SpaceListItem[] }> {
    const userId = user.id;
    let spaces = await listUserSpaces(supabase, userId);

    if (spaces.length === 0) {
        await ensurePersonalSpace(supabase, userId);
        spaces = await listUserSpaces(supabase, userId);
    }

    const metaCandidate = (user.user_metadata as any)?.active_space_id;
    const preferred = isUuid(metaCandidate) ? metaCandidate : null;

    const fallback = spaces[0]?.id || userId;
    const activeSpaceId = spaces.some((space) => space.id === preferred) ? preferred! : fallback;

    if (!isUuid(preferred) || preferred !== activeSpaceId) {
        const { error } = await supabase.auth.updateUser({
            data: {
                active_space_id: activeSpaceId,
            },
        });

        if (error) {
            logWarn('active_space_update_failed', { userId, reason: error.message });
        }
    }

    return { activeSpaceId, spaces };
}

