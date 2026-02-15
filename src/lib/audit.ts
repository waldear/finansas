import type { SupabaseClient } from '@supabase/supabase-js';
import { logWarn } from '@/lib/observability';

interface AuditEventInput {
    supabase: SupabaseClient;
    userId: string;
    spaceId?: string;
    entityType: string;
    entityId: string;
    action: 'create' | 'update' | 'delete' | 'system';
    beforeData?: unknown;
    afterData?: unknown;
    metadata?: Record<string, unknown>;
}

export async function recordAuditEvent({
    supabase,
    userId,
    spaceId,
    entityType,
    entityId,
    action,
    beforeData = null,
    afterData = null,
    metadata = {},
}: AuditEventInput) {
    try {
        const { error } = await supabase.from('audit_events').insert({
            user_id: userId,
            ...(spaceId ? { space_id: spaceId } : {}),
            entity_type: entityType,
            entity_id: entityId,
            action,
            before_data: beforeData,
            after_data: afterData,
            metadata,
        });

        if (error) {
            logWarn('audit_event_insert_failed', {
                userId,
                spaceId: spaceId || null,
                entityType,
                entityId,
                action,
                reason: error.message,
            });
        }
    } catch (error) {
        logWarn('audit_event_insert_exception', {
            userId,
            spaceId: spaceId || null,
            entityType,
            entityId,
            action,
            reason: error instanceof Error ? error.message : String(error),
        });
    }
}
