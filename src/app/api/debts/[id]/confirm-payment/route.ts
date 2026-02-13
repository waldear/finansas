import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

function toIsoDate(value?: string | null) {
    if (typeof value !== 'string' || !value.trim()) {
        return new Date().toISOString().split('T')[0];
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString().split('T')[0];
    }

    return parsed.toISOString().split('T')[0];
}

function addMonth(dateValue: string) {
    const base = new Date(`${dateValue}T00:00:00.000Z`);
    if (Number.isNaN(base.getTime())) {
        const fallback = new Date();
        fallback.setUTCMonth(fallback.getUTCMonth() + 1);
        return fallback.toISOString().split('T')[0];
    }

    const day = base.getUTCDate();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + 1);
    const monthLastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
    base.setUTCDate(Math.min(day, monthLastDay));

    return base.toISOString().split('T')[0];
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const context = createRequestContext('/api/debts/[id]/confirm-payment', 'POST');
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
        const paymentDate = toIsoDate(body?.payment_date);

        const { data: debt, error: debtError } = await supabase
            .from('debts')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .single();

        if (debtError || !debt) {
            return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 });
        }

        const previousDebt = { ...debt };
        const currentTotalAmount = Number(debt.total_amount || 0);
        const currentMonthlyPayment = Number(debt.monthly_payment || 0);
        const currentRemainingInstallments = Number(debt.remaining_installments || 0);

        if (currentTotalAmount <= 0 || currentRemainingInstallments <= 0) {
            return NextResponse.json({ error: 'Esta deuda ya está saldada.' }, { status: 409 });
        }

        const fallbackPayment = currentMonthlyPayment > 0 ? currentMonthlyPayment : currentTotalAmount;
        const requestedPayment = Number(body?.payment_amount ?? fallbackPayment);
        if (!Number.isFinite(requestedPayment) || requestedPayment <= 0) {
            return NextResponse.json({ error: 'Monto de pago inválido.' }, { status: 400 });
        }

        const paymentAmount = Math.min(requestedPayment, currentTotalAmount);
        const updatedTotalAmount = Math.max(currentTotalAmount - paymentAmount, 0);
        const updatedRemainingInstallments = Math.max(currentRemainingInstallments - 1, 0);
        const updatedNextPaymentDate =
            updatedTotalAmount > 0 && updatedRemainingInstallments > 0
                ? addMonth(toIsoDate(String(debt.next_payment_date)))
                : paymentDate;

        const { data: updatedDebt, error: updateError } = await supabase
            .from('debts')
            .update({
                total_amount: updatedTotalAmount,
                remaining_installments: updatedRemainingInstallments,
                next_payment_date: updatedNextPaymentDate,
            })
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select()
            .single();

        if (updateError || !updatedDebt) {
            return NextResponse.json({ error: updateError?.message || 'No se pudo actualizar la deuda.' }, { status: 500 });
        }

        const transactionDescription = typeof body?.description === 'string' && body.description.trim()
            ? body.description.trim()
            : `Pago de deuda: ${debt.name}`;

        const { data: paymentTransaction, error: transactionError } = await supabase
            .from('transactions')
            .insert({
                user_id: session.user.id,
                type: 'expense',
                amount: paymentAmount,
                description: transactionDescription,
                category: debt.category || 'Deudas',
                date: paymentDate,
            })
            .select()
            .single();

        if (transactionError || !paymentTransaction) {
            await supabase
                .from('debts')
                .update({
                    total_amount: previousDebt.total_amount,
                    remaining_installments: previousDebt.remaining_installments,
                    next_payment_date: previousDebt.next_payment_date,
                })
                .eq('id', id)
                .eq('user_id', session.user.id);

            return NextResponse.json(
                { error: transactionError?.message || 'No se pudo registrar la transacción del pago.' },
                { status: 500 }
            );
        }

        let matchedObligationId: string | null = null;
        const { data: pendingObligation } = await supabase
            .from('obligations')
            .select('id, status')
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .eq('title', debt.name)
            .order('due_date', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (pendingObligation?.id) {
            const { error: obligationUpdateError } = await supabase
                .from('obligations')
                .update({ status: 'paid' })
                .eq('id', pendingObligation.id)
                .eq('user_id', session.user.id);

            if (!obligationUpdateError) {
                matchedObligationId = pendingObligation.id;
            }
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'debt',
            entityId: updatedDebt.id,
            action: 'update',
            beforeData: previousDebt,
            afterData: updatedDebt,
            metadata: {
                paymentAmount,
                paymentDate,
            },
        });

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'transaction',
            entityId: paymentTransaction.id,
            action: 'create',
            afterData: paymentTransaction,
            metadata: {
                source: 'debt_confirm_payment',
                debtId: updatedDebt.id,
            },
        });

        if (matchedObligationId) {
            await recordAuditEvent({
                supabase,
                userId: session.user.id,
                entityType: 'obligation',
                entityId: matchedObligationId,
                action: 'update',
                metadata: {
                    source: 'debt_confirm_payment',
                    debtId: updatedDebt.id,
                },
            });
        }

        logInfo('debt_payment_confirmed', {
            ...context,
            userId: session.user.id,
            debtId: updatedDebt.id,
            transactionId: paymentTransaction.id,
            matchedObligationId,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            debt: updatedDebt,
            transaction: paymentTransaction,
            obligationUpdated: Boolean(matchedObligationId),
            obligationId: matchedObligationId,
        });
    } catch (error) {
        logError('debt_payment_confirm_exception', error, {
            ...context,
            debtId: id,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
            { error: 'No se pudo confirmar el pago de la deuda.' },
            { status: 500 }
        );
    }
}
