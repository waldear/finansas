import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';
import { ensureActiveSpace } from '@/lib/spaces';

const CopilotConfirmationSchema = z.object({
    title: z.string().min(1, 'El título es obligatorio'),
    amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
    payment_amount: z.coerce.number().positive().optional().nullable(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido'),
    category: z.string().min(1).default('Varios'),
    minimum_payment: z.coerce.number().optional().nullable(),
    monthly_payment: z.coerce.number().optional().nullable(),
    total_installments: z.coerce.number().int().optional().nullable(),
    remaining_installments: z.coerce.number().int().optional().nullable(),
    debt_next_payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    document_type: z.enum(['credit_card', 'invoice', 'bank_statement', 'other']).default('other'),
    extraction_id: z.string().uuid().optional().nullable(),
    document_id: z.string().uuid().optional().nullable(),
    create_debt: z.boolean().optional().default(false),
    mark_paid: z.boolean().optional().default(false),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    payment_description: z.string().optional().nullable(),
});

function todayIsoDate() {
    return new Date().toISOString().split('T')[0];
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/copilot/confirm', 'POST');
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

        const body = await req.json();
        const validated = CopilotConfirmationSchema.parse(body);

        const paymentDate = validated.payment_date || todayIsoDate();
        const shouldCreateDebt = validated.create_debt && !validated.mark_paid;

        const { data: obligation, error: obligationError } = await supabase
            .from('obligations')
            .insert({
                user_id: session.user.id,
                space_id: activeSpaceId,
                extraction_id: validated.extraction_id ?? null,
                title: validated.title,
                amount: validated.amount,
                due_date: validated.due_date,
                status: 'pending',
                category: validated.category || 'Varios',
                minimum_payment: validated.minimum_payment ?? null,
            })
            .select()
            .single();

        if (obligationError || !obligation) {
            return NextResponse.json({ error: obligationError?.message || 'No se pudo crear la obligación.' }, { status: 500 });
        }

        // Keep a mutable reference so we can return the final state (e.g. after partial payment updates).
        let obligationFinal = obligation;
        let remainingAfterPayment: number | null = null;

        let debt: any = null;
        if (shouldCreateDebt) {
            const totalInstallments = Math.max(1, Number(validated.total_installments || 1));
            const remainingInstallmentsRaw = validated.remaining_installments == null
                ? totalInstallments
                : Math.max(0, Number(validated.remaining_installments));
            const remainingInstallments = Math.min(remainingInstallmentsRaw, totalInstallments);
            const nextPaymentDate = validated.debt_next_payment_date || validated.due_date;

            const monthlyPayment = Number(validated.monthly_payment ?? validated.minimum_payment ?? validated.amount);
            const { data: createdDebt, error: debtError } = await supabase
                .from('debts')
                .insert({
                    user_id: session.user.id,
                    space_id: activeSpaceId,
                    name: validated.title,
                    total_amount: validated.amount,
                    monthly_payment: monthlyPayment > 0 ? monthlyPayment : validated.amount,
                    remaining_installments: remainingInstallments,
                    total_installments: totalInstallments,
                    category: validated.category || 'Deuda',
                    next_payment_date: nextPaymentDate,
                })
                .select()
                .single();

            if (debtError || !createdDebt) {
                await supabase
                    .from('obligations')
                    .delete()
                    .eq('id', obligation.id)
                    .eq('space_id', activeSpaceId);

                return NextResponse.json({ error: debtError?.message || 'No se pudo crear la deuda.' }, { status: 500 });
            }

            debt = createdDebt;
        }

        let transaction: any = null;
        if (validated.mark_paid) {
            const paymentDescription = (validated.payment_description || '').trim()
                || `Pago confirmado desde resumen: ${validated.title}`;

            const paymentAmount = Number(validated.payment_amount ?? validated.amount);
            if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
                await supabase
                    .from('obligations')
                    .delete()
                    .eq('id', obligation.id)
                    .eq('space_id', activeSpaceId);

                return NextResponse.json({ error: 'Monto de pago inválido.' }, { status: 400 });
            }

            const { data: createdTransaction, error: transactionError } = await supabase
                .from('transactions')
                .insert({
                    user_id: session.user.id,
                    space_id: activeSpaceId,
                    type: 'expense',
                    amount: paymentAmount,
                    description: paymentDescription,
                    category: validated.category || 'Deudas',
                    date: paymentDate,
                })
                .select()
                .single();

            if (transactionError || !createdTransaction) {
                if (debt?.id) {
                    await supabase
                        .from('debts')
                        .delete()
                        .eq('id', debt.id)
                        .eq('space_id', activeSpaceId);
                }

                await supabase
                    .from('obligations')
                    .delete()
                    .eq('id', obligation.id)
                    .eq('space_id', activeSpaceId);

                return NextResponse.json(
                    { error: transactionError?.message || 'No se pudo registrar la transacción de pago.' },
                    { status: 500 }
                );
            }

            transaction = createdTransaction;

            // Update obligation status and remaining amount (supports partial payments).
            const remaining = Math.max(Number(validated.amount) - paymentAmount, 0);
            remainingAfterPayment = remaining;

            const updatePayload: Record<string, unknown> = remaining <= 0
                ? { status: 'paid' }
                : { status: 'pending', amount: Number(remaining.toFixed(2)) };

            const { data: updatedObligation, error: updateError } = await supabase
                .from('obligations')
                .update(updatePayload)
                .eq('id', obligation.id)
                .eq('space_id', activeSpaceId)
                .select()
                .single();

            if (updateError || !updatedObligation) {
                // Rollback: delete transaction and obligation if we couldn't update the obligation.
                await supabase
                    .from('transactions')
                    .delete()
                    .eq('id', createdTransaction.id)
                    .eq('space_id', activeSpaceId);

                if (debt?.id) {
                    await supabase
                        .from('debts')
                        .delete()
                        .eq('id', debt.id)
                        .eq('space_id', activeSpaceId);
                }

                await supabase
                    .from('obligations')
                    .delete()
                    .eq('id', obligation.id)
                    .eq('space_id', activeSpaceId);

                return NextResponse.json(
                    { error: updateError?.message || 'No se pudo actualizar la obligación.' },
                    { status: 500 }
                );
            }

            obligationFinal = updatedObligation;
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            spaceId: activeSpaceId,
            entityType: 'obligation',
            entityId: obligation.id,
            action: 'create',
            afterData: obligation,
            metadata: {
                source: 'copilot_confirm',
                documentType: validated.document_type,
                documentId: validated.document_id ?? null,
            },
        });

        if (debt?.id) {
            await recordAuditEvent({
                supabase,
                userId: session.user.id,
                spaceId: activeSpaceId,
                entityType: 'debt',
                entityId: debt.id,
                action: 'create',
                afterData: debt,
                metadata: {
                    source: 'copilot_confirm',
                    linkedObligationId: obligation.id,
                },
            });
        }

        if (transaction?.id) {
            await recordAuditEvent({
                supabase,
                userId: session.user.id,
                spaceId: activeSpaceId,
                entityType: 'transaction',
                entityId: transaction.id,
                action: 'create',
                afterData: transaction,
                metadata: {
                    source: 'copilot_confirm',
                    linkedObligationId: obligation.id,
                },
            });

            // Record the obligation update after payment (partial or full).
            if (obligationFinal && (obligationFinal.status !== obligation.status || Number(obligationFinal.amount) !== Number(obligation.amount))) {
                await recordAuditEvent({
                    supabase,
                    userId: session.user.id,
                    spaceId: activeSpaceId,
                    entityType: 'obligation',
                    entityId: obligation.id,
                    action: 'update',
                    beforeData: obligation,
                    afterData: obligationFinal,
                    metadata: {
                        source: 'copilot_confirm_payment',
                        paymentAmount: Number(validated.payment_amount ?? validated.amount),
                        paymentDate,
                        transactionId: transaction.id,
                        remaining: remainingAfterPayment,
                    },
                });
            }
        }

        logInfo('copilot_confirmation_saved', {
            ...context,
            userId: session.user.id,
            obligationId: obligation.id,
            debtId: debt?.id || null,
            transactionId: transaction?.id || null,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            obligation: obligationFinal,
            debt,
            transaction,
            remaining: remainingAfterPayment,
            links: {
                obligationId: obligation.id,
                debtId: debt?.id ?? null,
                transactionId: transaction?.id ?? null,
            },
        });
    } catch (error: any) {
        logError('copilot_confirmation_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: error.errors || error.message || 'No se pudo confirmar el documento.' }, { status: 400 });
    }
}
