import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

const BodySchema = z.object({
    payment_amount: z.coerce.number().positive().optional().nullable(),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    description: z.string().optional().nullable(),
});

function isoToday() {
    return new Date().toISOString().split('T')[0];
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const context = createRequestContext('/api/obligations/[id]/confirm-payment', 'POST');
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

        const body = await req.json().catch(() => ({}));
        const validated = BodySchema.parse(body);

        const { data: obligation, error: obligationError } = await supabase
            .from('obligations')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .single();

        if (obligationError || !obligation) {
            return NextResponse.json({ error: 'Obligación no encontrada' }, { status: 404 });
        }

        const beforeObligation = { ...obligation };
        const obligationAmount = Number(obligation.amount || 0);
        if (!Number.isFinite(obligationAmount) || obligationAmount <= 0) {
            return NextResponse.json({ error: 'Monto de obligación inválido.' }, { status: 409 });
        }

        const paymentAmountRaw = validated.payment_amount ?? obligationAmount;
        const paymentAmount = Math.min(Number(paymentAmountRaw), obligationAmount);
        if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
            return NextResponse.json({ error: 'Monto de pago inválido.' }, { status: 400 });
        }

        const paymentDate = validated.payment_date || isoToday();
        const description = (validated.description || '').trim()
            || `Pago de obligación: ${String(obligation.title || 'Obligación')}`;

        const { data: transaction, error: transactionError } = await supabase
            .from('transactions')
            .insert({
                user_id: session.user.id,
                type: 'expense',
                amount: paymentAmount,
                description,
                category: obligation.category || 'Deudas',
                date: paymentDate,
            })
            .select()
            .single();

        if (transactionError || !transaction) {
            return NextResponse.json(
                { error: transactionError?.message || 'No se pudo registrar la transacción del pago.' },
                { status: 500 }
            );
        }

        const remaining = Math.max(obligationAmount - paymentAmount, 0);
        const nextStatus = remaining <= 0 ? 'paid' : 'pending';
        const updatePayload: Record<string, unknown> = {
            status: nextStatus,
            // For partial payments, reduce the outstanding amount so Copilot/insights remain accurate.
            ...(remaining > 0 ? { amount: Number(remaining.toFixed(2)) } : {}),
        };

        const { data: updatedObligation, error: updateError } = await supabase
            .from('obligations')
            .update(updatePayload)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select()
            .single();

        if (updateError || !updatedObligation) {
            // Best-effort rollback: delete created transaction if obligation update fails.
            await supabase
                .from('transactions')
                .delete()
                .eq('id', transaction.id)
                .eq('user_id', session.user.id);

            return NextResponse.json({ error: updateError?.message || 'No se pudo actualizar la obligación.' }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'transaction',
            entityId: transaction.id,
            action: 'create',
            afterData: transaction,
            metadata: {
                source: 'obligation_confirm_payment',
                obligationId: updatedObligation.id,
            },
        });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'obligation',
            entityId: updatedObligation.id,
            action: 'update',
            beforeData: beforeObligation,
            afterData: updatedObligation,
            metadata: {
                paymentAmount,
                paymentDate,
                transactionId: transaction.id,
            },
        });

        logInfo('obligation_payment_confirmed', {
            ...context,
            userId: session.user.id,
            obligationId: updatedObligation.id,
            transactionId: transaction.id,
            remaining,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            obligation: updatedObligation,
            transaction,
            remaining,
        });
    } catch (error) {
        logError('obligation_payment_confirm_exception', error, {
            ...context,
            obligationId: id,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo confirmar el pago.' }, { status: 500 });
    }
}

