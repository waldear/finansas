import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';
import { ensureActiveSpace } from '@/lib/spaces';

type ObligationRecord = {
    id: string;
    title: string;
    amount: string | number | null;
    due_date: string | null;
    status: 'pending' | 'overdue' | 'paid' | string;
};

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

function toNumericAmount(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLabel(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function dateDistanceInDays(a?: string | null, b?: string | null) {
    if (!a || !b) return 30;
    const first = new Date(`${a}T00:00:00.000Z`);
    const second = new Date(`${b}T00:00:00.000Z`);

    if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return 30;
    return Math.abs(Math.round((first.getTime() - second.getTime()) / (1000 * 60 * 60 * 24)));
}

function pickMatchingObligation(
    obligations: ObligationRecord[],
    debtName: string,
    paymentAmount: number,
    paymentDate: string
) {
    if (!obligations.length) return null;

    const normalizedDebtName = normalizeLabel(debtName);
    const exactTitleMatch = obligations.find((obligation) => normalizeLabel(obligation.title || '') === normalizedDebtName);
    if (exactTitleMatch) return exactTitleMatch;

    const amountTolerance = Math.max(paymentAmount * 0.35, 2500);
    let bestMatch: ObligationRecord | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const obligation of obligations) {
        const obligationAmount = toNumericAmount(obligation.amount);
        const amountDelta = Math.abs(obligationAmount - paymentAmount);
        const normalizedTitle = normalizeLabel(obligation.title || '');
        const titleRelated =
            normalizedDebtName.length > 0 &&
            (normalizedTitle.includes(normalizedDebtName) || normalizedDebtName.includes(normalizedTitle));

        if (!titleRelated && amountDelta > amountTolerance) continue;

        const dueDateDelta = dateDistanceInDays(obligation.due_date, paymentDate);
        const score = amountDelta + dueDateDelta * 12 + (titleRelated ? -1000 : 0);

        if (score < bestScore) {
            bestScore = score;
            bestMatch = obligation;
        }
    }

    return bestMatch;
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

        const { activeSpaceId } = await ensureActiveSpace(supabase as any, session.user);

        const body = await req.json().catch(() => ({}));
        const paymentDate = toIsoDate(body?.payment_date);

        const { data: debt, error: debtError } = await supabase
            .from('debts')
            .select('*')
            .eq('id', id)
            .eq('space_id', activeSpaceId)
            .single();

        if (debtError || !debt) {
            return NextResponse.json({ error: 'Deuda no encontrada' }, { status: 404 });
        }

        const previousDebt = { ...debt };
        const currentTotalAmount = Number(debt.total_amount || 0);
        const currentMonthlyPayment = Number(debt.monthly_payment || 0);
        const currentRemainingInstallments = Number(debt.remaining_installments || 0);

        if (currentTotalAmount <= 0) {
            return NextResponse.json({ error: 'Esta deuda ya está saldada.' }, { status: 409 });
        }

        const effectiveRemainingInstallments = currentRemainingInstallments > 0 ? currentRemainingInstallments : 1;

        const fallbackPayment = currentMonthlyPayment > 0 ? currentMonthlyPayment : currentTotalAmount;
        const requestedPayment = Number(body?.payment_amount ?? fallbackPayment);
        if (!Number.isFinite(requestedPayment) || requestedPayment <= 0) {
            return NextResponse.json({ error: 'Monto de pago inválido.' }, { status: 400 });
        }

        const paymentAmount = Math.min(requestedPayment, currentTotalAmount);
        const updatedTotalAmount = Math.max(currentTotalAmount - paymentAmount, 0);

        // Keep the debt "alive" until the outstanding amount is fully paid.
        // This avoids marking the debt as settled when the last planned installment was paid partially.
        let updatedRemainingInstallments = Math.max(effectiveRemainingInstallments - 1, 0);
        if (updatedTotalAmount > 0 && updatedRemainingInstallments === 0) {
            updatedRemainingInstallments = 1;
        }

        const updatedNextPaymentDate =
            updatedTotalAmount > 0
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
            .eq('space_id', activeSpaceId)
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
                space_id: activeSpaceId,
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
                .eq('space_id', activeSpaceId);

            return NextResponse.json(
                { error: transactionError?.message || 'No se pudo registrar la transacción del pago.' },
                { status: 500 }
            );
        }

        let matchedObligationId: string | null = null;
        const { data: openObligations } = await supabase
            .from('obligations')
            .select('id, title, amount, due_date, status')
            .eq('space_id', activeSpaceId)
            .in('status', ['pending', 'overdue'])
            .order('due_date', { ascending: true })
            .limit(30);

        const matchedObligation = pickMatchingObligation(
            (openObligations || []) as ObligationRecord[],
            String(debt.name || ''),
            paymentAmount,
            paymentDate
        );

        if (matchedObligation?.id) {
            // Only mark an obligation as paid when the payment covers (almost) the full obligation amount.
            // For credit card statements, users often pay partial/minimum payments, and we must not close the obligation.
            const obligationAmount = toNumericAmount(matchedObligation.amount);
            const isFullPaymentForObligation = obligationAmount > 0 && paymentAmount >= obligationAmount * 0.98;

            if (isFullPaymentForObligation) {
                const { error: obligationUpdateError } = await supabase
                    .from('obligations')
                    .update({ status: 'paid' })
                    .eq('id', matchedObligation.id)
                    .eq('space_id', activeSpaceId);

                if (!obligationUpdateError) {
                    matchedObligationId = matchedObligation.id;
                }
            }
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
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
            spaceId: activeSpaceId,
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
                spaceId: activeSpaceId,
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
