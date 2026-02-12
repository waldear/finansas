import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

function advanceDate(dateValue: string, frequency: 'weekly' | 'biweekly' | 'monthly') {
    const date = new Date(`${dateValue}T00:00:00.000Z`);
    if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
    if (frequency === 'biweekly') date.setUTCDate(date.getUTCDate() + 14);
    if (frequency === 'monthly') date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString().slice(0, 10);
}

export async function POST() {
    const context = createRequestContext('/api/recurring/run', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const today = new Date().toISOString().slice(0, 10);
        const { data: dueRules, error: dueError } = await supabase
            .from('recurring_transactions')
            .select('*')
            .eq('user_id', session.user.id)
            .eq('is_active', true)
            .lte('next_run', today);

        if (dueError) return NextResponse.json({ error: dueError.message }, { status: 500 });
        if (!dueRules || dueRules.length === 0) {
            return NextResponse.json({ generated: 0, updatedRules: 0 });
        }

        let generated = 0;
        const ruleUpdates: { id: string; next_run: string }[] = [];

        for (const rule of dueRules) {
            const transactionsToCreate: any[] = [];
            let nextRun = rule.next_run;

            for (let guard = 0; guard < 24 && nextRun <= today; guard++) {
                transactionsToCreate.push({
                    user_id: session.user.id,
                    type: rule.type,
                    amount: rule.amount,
                    description: `${rule.description} (Recurrente)`,
                    category: rule.category,
                    date: nextRun,
                });
                nextRun = advanceDate(nextRun, rule.frequency);
            }

            if (transactionsToCreate.length > 0) {
                const { error: insertError } = await supabase
                    .from('transactions')
                    .insert(transactionsToCreate);

                if (!insertError) {
                    generated += transactionsToCreate.length;
                    ruleUpdates.push({ id: rule.id, next_run: nextRun });
                }
            }
        }

        for (const update of ruleUpdates) {
            await supabase
                .from('recurring_transactions')
                .update({
                    next_run: update.next_run,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', update.id)
                .eq('user_id', session.user.id);
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'recurring_runner',
            entityId: session.user.id,
            action: 'system',
            metadata: {
                generated,
                updatedRules: ruleUpdates.length,
                runDate: today,
            },
        });

        logInfo('recurring_run_completed', {
            ...context,
            userId: session.user.id,
            generated,
            updatedRules: ruleUpdates.length,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            generated,
            updatedRules: ruleUpdates.length,
        });
    } catch (error) {
        logError('recurring_run_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'Error al ejecutar recurrencias' }, { status: 500 });
    }
}
