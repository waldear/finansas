'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, useState } from 'react';
import { DebtInput, Obligation } from '@/lib/schemas';
import { useFinance } from '@/hooks/use-finance';
import { useObligations } from '@/hooks/use-obligations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebtForm } from '@/components/finance/debt-form';
import { Label } from '@/components/ui/label';
import {
    Loader2,
    CreditCard,
    Calendar,
    ArrowRight,
    CheckCircle2,
    Pencil,
    Trash2,
    Save,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const emptyDebtInput: DebtInput = {
    name: '',
    category: '',
    total_amount: 0,
    monthly_payment: 0,
    remaining_installments: 0,
    total_installments: 1,
    next_payment_date: new Date().toISOString().split('T')[0],
};

function isoToday() {
    return new Date().toISOString().split('T')[0];
}

function parseMoneyInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const stripped = trimmed.replace(/[^\d,.-]/g, '');
    if (!stripped) return null;

    const hasComma = stripped.includes(',');
    const hasDot = stripped.includes('.');
    let normalized = stripped;

    if (hasComma && hasDot) {
        if (stripped.lastIndexOf(',') > stripped.lastIndexOf('.')) {
            normalized = stripped.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = stripped.replace(/,/g, '');
        }
    } else if (hasComma) {
        normalized = stripped.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
        if (/^-?\d{1,3}(\.\d{3})+$/.test(stripped)) {
            normalized = stripped.replace(/\./g, '');
        }
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function toDebtInput(debt: any): DebtInput {
    return {
        name: String(debt.name || ''),
        category: String(debt.category || ''),
        total_amount: Number(debt.total_amount || 0),
        monthly_payment: Number(debt.monthly_payment || 0),
        remaining_installments: Number(debt.remaining_installments || 0),
        total_installments: Number(debt.total_installments || 1),
        next_payment_date: String(debt.next_payment_date || new Date().toISOString().split('T')[0]),
    };
}

type PaymentDraft = {
    debtId: string;
    debtName: string;
    debtCategory: string;
    totalAmount: number;
    monthlyPayment: number;
    paymentAmount: string;
    paymentDate: string;
    description: string;
};

type ObligationEditDraft = {
    title: string;
    amount: string;
    due_date: string;
    status: 'pending' | 'paid' | 'overdue';
    category: string;
    minimum_payment: string;
};

function toObligationEditDraft(obligation: Obligation): ObligationEditDraft {
    return {
        title: String(obligation.title || ''),
        amount: Number(obligation.amount || 0) > 0 ? String(obligation.amount) : '',
        due_date: String(obligation.due_date || isoToday()),
        status: (obligation.status === 'paid' || obligation.status === 'overdue') ? obligation.status : 'pending',
        category: String(obligation.category || ''),
        minimum_payment: obligation.minimum_payment != null && Number(obligation.minimum_payment) > 0 ? String(obligation.minimum_payment) : '',
    };
}

type ObligationPaymentDraft = {
    obligationId: string;
    title: string;
    category: string;
    amountDue: number;
    paymentAmount: string;
    paymentDate: string;
    description: string;
};

export default function DebtsPage() {
    const [processingDebtId, setProcessingDebtId] = useState<string | null>(null);
    const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
    const [targetDebtId, setTargetDebtId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<DebtInput>(emptyDebtInput);
    const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
    const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
    const [editingObligationId, setEditingObligationId] = useState<string | null>(null);
    const [obligationEditForm, setObligationEditForm] = useState<ObligationEditDraft>({
        title: '',
        amount: '',
        due_date: isoToday(),
        status: 'pending',
        category: '',
        minimum_payment: '',
    });
    const [targetObligationId, setTargetObligationId] = useState<string | null>(null);
    const [isObligationPaymentOpen, setIsObligationPaymentOpen] = useState(false);
    const [obligationPaymentDraft, setObligationPaymentDraft] = useState<ObligationPaymentDraft | null>(null);

    const {
        debts,
        isLoadingDebts,
        debtsError,
        confirmDebtPayment,
        isConfirmingDebtPayment,
        updateDebt,
        deleteDebt,
        isUpdatingDebt,
        isDeletingDebt,
    } = useFinance();

    const {
        obligations,
        isLoadingObligations,
        obligationsError,
        updateObligation,
        deleteObligation,
        confirmObligationPayment,
        isUpdatingObligation,
        isDeletingObligation,
        isConfirmingObligationPayment,
    } = useObligations();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const getDueBadge = (nextPaymentDate: string) => {
        const today = new Date();
        const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const due = new Date(`${nextPaymentDate}T00:00:00`);
        const diff = Math.ceil((due.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));

        if (Number.isNaN(diff)) {
            return { label: 'Sin fecha válida', className: 'text-muted-foreground' };
        }

        if (diff < 0) {
            return { label: `Vencida ${Math.abs(diff)} día(s)`, className: 'text-destructive font-semibold' };
        }

        if (diff === 0) {
            return { label: 'Vence hoy', className: 'text-amber-500 font-semibold' };
        }

        if (diff <= 3) {
            return { label: `Vence en ${diff} día(s)`, className: 'text-amber-500 font-semibold' };
        }

        return { label: `Vence en ${diff} día(s)`, className: 'text-muted-foreground' };
    };

    const openPaymentSheet = (debt: any) => {
        if (!debt?.id) {
            toast.error('No se puede confirmar el pago de esta deuda.');
            return;
        }

        const totalAmount = Number(debt.total_amount || 0);
        const monthlyPayment = Number(debt.monthly_payment || 0);
        const suggested = monthlyPayment > 0 ? monthlyPayment : totalAmount;

        setPaymentDraft({
            debtId: String(debt.id),
            debtName: String(debt.name || 'Deuda'),
            debtCategory: String(debt.category || 'Deudas'),
            totalAmount,
            monthlyPayment,
            paymentAmount: suggested > 0 ? String(suggested) : '',
            paymentDate: isoToday(),
            description: '',
        });
        setIsPaymentSheetOpen(true);
    };

    const closePaymentSheet = () => {
        setIsPaymentSheetOpen(false);
        setPaymentDraft(null);
    };

    const handleConfirmPayment = async () => {
        if (!paymentDraft) return;

        const parsedAmount = parseMoneyInput(paymentDraft.paymentAmount);
        if (!parsedAmount || parsedAmount <= 0) {
            toast.error('Monto de pago inválido.');
            return;
        }

        const paymentDate = paymentDraft.paymentDate || isoToday();
        const description = paymentDraft.description.trim() || undefined;

        setProcessingDebtId(paymentDraft.debtId);
        try {
            await confirmDebtPayment({
                debtId: paymentDraft.debtId,
                paymentAmount: parsedAmount,
                paymentDate,
                description,
            });
            closePaymentSheet();
        } finally {
            setProcessingDebtId(null);
        }
    };

    const startEditing = (debt: any) => {
        if (!debt.id) {
            toast.error('No se puede editar esta deuda');
            return;
        }
        setEditingDebtId(debt.id);
        setEditForm(toDebtInput(debt));
    };

    const cancelEditing = () => {
        setEditingDebtId(null);
        setEditForm(emptyDebtInput);
    };

    const handleSaveEdit = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingDebtId) return;

        try {
            setTargetDebtId(editingDebtId);
            await updateDebt({
                debtId: editingDebtId,
                changes: editForm,
            });
            cancelEditing();
        } catch {
            // toast handled in hook
        } finally {
            setTargetDebtId(null);
        }
    };

    const handleDelete = async (debtId: string) => {
        const approved = window.confirm('¿Seguro que quieres eliminar esta deuda? Esta acción no se puede deshacer.');
        if (!approved) return;

        try {
            setTargetDebtId(debtId);
            await deleteDebt(debtId);
            if (editingDebtId === debtId) {
                cancelEditing();
            }
        } catch {
            // toast handled in hook
        } finally {
            setTargetDebtId(null);
        }
    };

    const openObligationPaymentSheet = (obligation: Obligation) => {
        if (!obligation?.id) {
            toast.error('No se puede registrar el pago de esta obligación.');
            return;
        }

        const amountDue = Number(obligation.amount || 0);
        const minPayment = obligation.minimum_payment != null ? Number(obligation.minimum_payment) : 0;
        const suggested = minPayment > 0 ? minPayment : amountDue;

        setObligationPaymentDraft({
            obligationId: String(obligation.id),
            title: String(obligation.title || 'Obligación'),
            category: String(obligation.category || 'Deudas'),
            amountDue,
            paymentAmount: suggested > 0 ? String(suggested) : '',
            paymentDate: isoToday(),
            description: '',
        });
        setIsObligationPaymentOpen(true);
    };

    const closeObligationPaymentSheet = () => {
        setIsObligationPaymentOpen(false);
        setObligationPaymentDraft(null);
    };

    const handleConfirmObligationPayment = async () => {
        if (!obligationPaymentDraft) return;

        const parsedAmount = parseMoneyInput(obligationPaymentDraft.paymentAmount);
        if (!parsedAmount || parsedAmount <= 0) {
            toast.error('Monto de pago inválido.');
            return;
        }

        const paymentDate = obligationPaymentDraft.paymentDate || isoToday();
        const description = obligationPaymentDraft.description.trim() || undefined;

        try {
            await confirmObligationPayment({
                obligationId: obligationPaymentDraft.obligationId,
                paymentAmount: parsedAmount,
                paymentDate,
                description,
            });
            closeObligationPaymentSheet();
        } catch {
            // toast handled in hook
        }
    };

    const startEditingObligation = (obligation: Obligation) => {
        if (!obligation?.id) {
            toast.error('No se puede editar esta obligación');
            return;
        }

        setEditingObligationId(obligation.id);
        setObligationEditForm(toObligationEditDraft(obligation));
    };

    const cancelEditingObligation = () => {
        setEditingObligationId(null);
        setObligationEditForm({
            title: '',
            amount: '',
            due_date: isoToday(),
            status: 'pending',
            category: '',
            minimum_payment: '',
        });
    };

    const handleSaveObligationEdit = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingObligationId) return;

        const title = obligationEditForm.title.trim();
        if (!title) {
            toast.error('Título requerido.');
            return;
        }

        const amount = parseMoneyInput(obligationEditForm.amount);
        if (!amount || amount <= 0) {
            toast.error('Monto inválido.');
            return;
        }

        const dueDate = obligationEditForm.due_date;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
            toast.error('Vencimiento inválido.');
            return;
        }

        const minimumRaw = obligationEditForm.minimum_payment.trim();
        const minimumPayment = minimumRaw ? parseMoneyInput(minimumRaw) : null;
        if (minimumRaw && (!minimumPayment || minimumPayment <= 0)) {
            toast.error('Pago mínimo inválido.');
            return;
        }

        const category = obligationEditForm.category.trim() || null;

        try {
            setTargetObligationId(editingObligationId);
            await updateObligation({
                id: editingObligationId,
                changes: {
                    title,
                    amount,
                    due_date: dueDate,
                    status: obligationEditForm.status,
                    category,
                    minimum_payment: minimumPayment,
                },
            });
            cancelEditingObligation();
        } catch {
            // toast handled in hook
        } finally {
            setTargetObligationId(null);
        }
    };

    const handleDeleteObligation = async (obligationId: string) => {
        const approved = window.confirm('¿Seguro que quieres eliminar esta obligación? Esta acción no se puede deshacer.');
        if (!approved) return;

        try {
            setTargetObligationId(obligationId);
            await deleteObligation(obligationId);
            if (editingObligationId === obligationId) {
                cancelEditingObligation();
            }
        } catch {
            // toast handled in hook
        } finally {
            setTargetObligationId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Deudas y Créditos</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <DebtForm />

                <Card>
                    <CardHeader>
                        <CardTitle>Mis Compromisos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingDebts ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : debts.length > 0 ? (
                            <div className="space-y-4">
                                {debts.map((debt) => {
                                    const totalAmount = Number(debt.total_amount || 0);
                                    const monthlyPayment = Number(debt.monthly_payment || 0);
                                    const remainingInstallments = Number(debt.remaining_installments || 0);
                                    const isSettled = totalAmount <= 0;
                                    const isProcessingPayment = isConfirmingDebtPayment && processingDebtId === debt.id;
                                    const dueBadge = getDueBadge(String(debt.next_payment_date));
                                    const isEditing = editingDebtId === debt.id;
                                    const isTargeting = targetDebtId === debt.id;
                                    const isMutating = isTargeting && (isUpdatingDebt || isDeletingDebt);

                                    return (
                                        <div key={debt.id} className="rounded-lg border p-4 space-y-3">
                                            <div className="flex justify-between items-start gap-3">
                                                <div>
                                                    <h3 className="font-bold text-lg">{debt.name}</h3>
                                                    <p className="text-xs text-muted-foreground uppercase">{debt.category}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className={`font-bold text-lg ${isSettled ? 'text-emerald-500' : 'text-red-500'}`}>
                                                        {formatCurrency(totalAmount)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">{isSettled ? 'Saldada' : 'Pendiente'}</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 border-t pt-2 text-sm sm:grid-cols-2 sm:gap-4">
                                                <div className="flex items-center gap-2">
                                                    <CreditCard className="w-4 h-4 text-muted-foreground" />
                                                    <span>Cuota: {formatCurrency(monthlyPayment)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="w-4 h-4 text-muted-foreground" />
                                                    <span>Restan: {remainingInstallments}/{debt.total_installments}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <ArrowRight className="w-3 h-3" />
                                                <span>Próximo vencimiento: {new Date(`${debt.next_payment_date}T00:00:00`).toLocaleDateString('es-AR')}</span>
                                            </div>
                                            {!isSettled && (
                                                <p className={`text-xs ${dueBadge.className}`}>{dueBadge.label}</p>
                                            )}

                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <Button
                                                    type="button"
                                                    onClick={() => openPaymentSheet(debt)}
                                                    disabled={!debt.id || isProcessingPayment || isConfirmingDebtPayment || isSettled || isMutating}
                                                    className="w-full sm:flex-1 sm:min-w-0"
                                                    variant={isSettled ? 'secondary' : 'default'}
                                                >
                                                    {isProcessingPayment ? (
                                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                                    )}
                                                    {isSettled ? 'Deuda saldada' : (
                                                        <>
                                                            <span className="sm:hidden">Confirmar pago</span>
                                                            <span className="hidden sm:inline">Confirmar pago debitado</span>
                                                        </>
                                                    )}
                                                </Button>

                                                <div className="flex w-full justify-end gap-2 sm:w-auto">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => startEditing(debt)}
                                                        disabled={!debt.id || isMutating}
                                                        title="Editar deuda"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        onClick={() => debt.id && handleDelete(debt.id)}
                                                        disabled={!debt.id || isMutating}
                                                        title="Eliminar deuda"
                                                    >
                                                        {isMutating && isDeletingDebt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>

                                            {isEditing && (
                                                <form onSubmit={handleSaveEdit} className="mt-3 grid gap-3 border-t pt-4 md:grid-cols-2">
                                                    <Input
                                                        value={editForm.name}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre"
                                                        required
                                                    />
                                                    <Input
                                                        value={editForm.category}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, category: event.target.value }))}
                                                        placeholder="Categoría"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.total_amount}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, total_amount: Number(event.target.value) || 0 }))}
                                                        placeholder="Monto total"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.monthly_payment}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, monthly_payment: Number(event.target.value) || 0 }))}
                                                        placeholder="Cuota mensual"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        min="1"
                                                        value={editForm.total_installments}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, total_installments: Number(event.target.value) || 1 }))}
                                                        placeholder="Cuotas totales"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        value={editForm.remaining_installments}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, remaining_installments: Number(event.target.value) || 0 }))}
                                                        placeholder="Cuotas restantes"
                                                        required
                                                    />
                                                    <div className="md:col-span-2">
                                                        <Input
                                                            type="date"
                                                            value={editForm.next_payment_date}
                                                            onChange={(event) => setEditForm((prev) => ({ ...prev, next_payment_date: event.target.value }))}
                                                            required
                                                        />
                                                    </div>
                                                    <div className="flex gap-2 md:col-span-2">
                                                        <Button type="submit" size="sm" disabled={isMutating}>
                                                            {isMutating && isUpdatingDebt ? (
                                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                            ) : (
                                                                <Save className="h-4 w-4 mr-2" />
                                                            )}
                                                            Guardar cambios
                                                        </Button>
                                                        <Button type="button" variant="outline" size="sm" onClick={cancelEditing} disabled={isMutating}>
                                                            <X className="h-4 w-4 mr-2" />
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                </form>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No tienes deudas registradas.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
            {debtsError && <p className="text-sm text-destructive">Error de deudas: {debtsError}</p>}

            <Card>
                <CardHeader>
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2">
                        <span>Obligaciones (Resúmenes / Facturas)</span>
                        <span className="text-xs text-muted-foreground">
                            {(obligations || []).filter((o) => o.status !== 'paid').length} abiertas
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingObligations ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : obligations.length > 0 ? (
                        <div className="space-y-4">
                            {obligations.map((obligation) => {
                                const amount = Number(obligation.amount || 0);
                                const minPayment = obligation.minimum_payment != null ? Number(obligation.minimum_payment) : 0;
                                const isPaid = obligation.status === 'paid';
                                const dueBadge = getDueBadge(String(obligation.due_date));
                                const isEditing = editingObligationId === obligation.id;
                                const isTargeting = targetObligationId === obligation.id;
                                const isMutating = isTargeting && (isUpdatingObligation || isDeletingObligation);

                                return (
                                    <div key={obligation.id} className="rounded-lg border p-4 space-y-3">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0">
                                                <h3 className="truncate font-bold text-lg">{obligation.title}</h3>
                                                <p className="text-xs text-muted-foreground uppercase">{obligation.category || 'Varios'}</p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className={`font-bold text-lg ${isPaid ? 'text-emerald-500' : 'text-foreground'}`}>
                                                    {formatCurrency(amount)}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{isPaid ? 'Pagada' : obligation.status === 'overdue' ? 'Vencida' : 'Pendiente'}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <ArrowRight className="w-3 h-3" />
                                            <span>Vencimiento: {new Date(`${obligation.due_date}T00:00:00`).toLocaleDateString('es-AR')}</span>
                                        </div>

                                        {!isPaid && (
                                            <p className={`text-xs ${dueBadge.className}`}>{dueBadge.label}</p>
                                        )}

                                        {minPayment > 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                Pago mínimo: <span className="font-medium">{formatCurrency(minPayment)}</span>
                                            </p>
                                        ) : null}

                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="w-full sm:flex-1 sm:min-w-0"
                                                onClick={() => openObligationPaymentSheet(obligation)}
                                                disabled={!obligation.id || isPaid || isMutating || isConfirmingObligationPayment}
                                            >
                                                Registrar pago
                                            </Button>

                                            <div className="flex w-full justify-end gap-2 sm:w-auto">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => startEditingObligation(obligation)}
                                                    disabled={!obligation.id || isMutating}
                                                    title="Editar obligación"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => obligation.id && handleDeleteObligation(obligation.id)}
                                                    disabled={!obligation.id || isMutating}
                                                    title="Eliminar obligación"
                                                >
                                                    {isMutating && isDeletingObligation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                        </div>

                                        {isEditing && (
                                            <form onSubmit={handleSaveObligationEdit} className="mt-3 grid gap-3 border-t pt-4 md:grid-cols-2">
                                                <Input
                                                    value={obligationEditForm.title}
                                                    onChange={(event) => setObligationEditForm((prev) => ({ ...prev, title: event.target.value }))}
                                                    placeholder="Título"
                                                    required
                                                    className="md:col-span-2"
                                                    disabled={isMutating}
                                                />
                                                <Input
                                                    type="text"
                                                    inputMode="decimal"
                                                    autoComplete="off"
                                                    value={obligationEditForm.amount}
                                                    onChange={(event) => setObligationEditForm((prev) => ({ ...prev, amount: event.target.value }))}
                                                    placeholder="Monto"
                                                    required
                                                    disabled={isMutating}
                                                    onFocus={(event) => event.currentTarget.select()}
                                                />
                                                <Input
                                                    type="date"
                                                    value={obligationEditForm.due_date}
                                                    onChange={(event) => setObligationEditForm((prev) => ({ ...prev, due_date: event.target.value }))}
                                                    required
                                                    disabled={isMutating}
                                                />
                                                <Input
                                                    value={obligationEditForm.category}
                                                    onChange={(event) => setObligationEditForm((prev) => ({ ...prev, category: event.target.value }))}
                                                    placeholder="Categoría"
                                                    disabled={isMutating}
                                                />
                                                <Input
                                                    type="text"
                                                    inputMode="decimal"
                                                    autoComplete="off"
                                                    value={obligationEditForm.minimum_payment}
                                                    onChange={(event) => setObligationEditForm((prev) => ({ ...prev, minimum_payment: event.target.value }))}
                                                    placeholder="Mínimo (opcional)"
                                                    disabled={isMutating}
                                                    onFocus={(event) => event.currentTarget.select()}
                                                />
                                                <select
                                                    value={obligationEditForm.status}
                                                    onChange={(event) => setObligationEditForm((prev) => ({ ...prev, status: event.target.value as ObligationEditDraft['status'] }))}
                                                    disabled={isMutating}
                                                    className="h-10 rounded-md border border-input bg-background px-3 text-sm md:col-span-2"
                                                >
                                                    <option value="pending">Pendiente</option>
                                                    <option value="overdue">Vencida</option>
                                                    <option value="paid">Pagada</option>
                                                </select>
                                                <div className="md:col-span-2 flex gap-2">
                                                    <Button type="submit" size="sm" disabled={isMutating}>
                                                        {isMutating && isUpdatingObligation ? (
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        ) : (
                                                            <Save className="h-4 w-4 mr-2" />
                                                        )}
                                                        Guardar cambios
                                                    </Button>
                                                    <Button type="button" variant="outline" size="sm" onClick={cancelEditingObligation} disabled={isMutating}>
                                                        <X className="h-4 w-4 mr-2" />
                                                        Cancelar
                                                    </Button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">No tienes obligaciones registradas.</p>
                    )}
                </CardContent>
            </Card>
            {obligationsError && <p className="text-sm text-destructive">Error de obligaciones: {obligationsError}</p>}

            <Sheet
                open={isObligationPaymentOpen}
                onOpenChange={(open) => (open ? setIsObligationPaymentOpen(true) : closeObligationPaymentSheet())}
            >
                <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Registrar pago</SheetTitle>
                        <SheetDescription>
                            {obligationPaymentDraft ? obligationPaymentDraft.title : 'Selecciona una obligación para registrar el pago.'}
                        </SheetDescription>
                    </SheetHeader>

                    {obligationPaymentDraft && (
                        <div className="mt-5 space-y-4">
                            <div className="rounded-lg border bg-muted/10 p-3 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p>
                                        Saldo pendiente: <span className="font-semibold">{formatCurrency(obligationPaymentDraft.amountDue)}</span>
                                    </p>
                                    <p className="text-muted-foreground">{obligationPaymentDraft.category}</p>
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="obligation_payment_amount">Monto de pago</Label>
                                    <Input
                                        id="obligation_payment_amount"
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={obligationPaymentDraft.paymentAmount}
                                        onChange={(event) => setObligationPaymentDraft((prev) => prev ? ({ ...prev, paymentAmount: event.target.value }) : prev)}
                                        placeholder="Ej: 45000"
                                        className="h-10"
                                        onFocus={(event) => event.currentTarget.select()}
                                    />
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setObligationPaymentDraft((prev) => prev ? ({ ...prev, paymentAmount: String(prev.amountDue) }) : prev)}
                                        >
                                            Usar total
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="obligation_payment_date">Fecha del débito</Label>
                                    <Input
                                        id="obligation_payment_date"
                                        type="date"
                                        value={obligationPaymentDraft.paymentDate}
                                        onChange={(event) => setObligationPaymentDraft((prev) => prev ? ({ ...prev, paymentDate: event.target.value }) : prev)}
                                        className="h-10"
                                    />
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="obligation_payment_description">Descripción (opcional)</Label>
                                    <Input
                                        id="obligation_payment_description"
                                        value={obligationPaymentDraft.description}
                                        onChange={(event) => setObligationPaymentDraft((prev) => prev ? ({ ...prev, description: event.target.value }) : prev)}
                                        placeholder={`Pago de obligación: ${obligationPaymentDraft.title}`}
                                        className="h-10"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closeObligationPaymentSheet}
                                    disabled={isConfirmingObligationPayment}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleConfirmObligationPayment}
                                    disabled={isConfirmingObligationPayment}
                                >
                                    {isConfirmingObligationPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Confirmar pago
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            <Sheet open={isPaymentSheetOpen} onOpenChange={(open) => (open ? setIsPaymentSheetOpen(true) : closePaymentSheet())}>
                <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Confirmar pago</SheetTitle>
                        <SheetDescription>
                            {paymentDraft ? `${paymentDraft.debtName} · ${paymentDraft.debtCategory}` : 'Selecciona una deuda para confirmar el pago.'}
                        </SheetDescription>
                    </SheetHeader>

                    {paymentDraft && (
                        <div className="mt-5 space-y-4">
                            <div className="rounded-lg border bg-muted/10 p-3 text-xs">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p>
                                        Saldo pendiente: <span className="font-semibold">{formatCurrency(paymentDraft.totalAmount)}</span>
                                    </p>
                                    {paymentDraft.monthlyPayment > 0 ? (
                                        <p className="text-muted-foreground">
                                            Cuota sugerida: {formatCurrency(paymentDraft.monthlyPayment)}
                                        </p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="payment_amount">Monto de pago</Label>
                                    <Input
                                        id="payment_amount"
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={paymentDraft.paymentAmount}
                                        onChange={(event) => setPaymentDraft((prev) => prev ? ({ ...prev, paymentAmount: event.target.value }) : prev)}
                                        placeholder="Ej: 45000"
                                        className="h-10"
                                        onFocus={(event) => event.currentTarget.select()}
                                    />
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {paymentDraft.monthlyPayment > 0 ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setPaymentDraft((prev) => prev ? ({ ...prev, paymentAmount: String(prev.monthlyPayment) }) : prev)}
                                            >
                                                Usar cuota
                                            </Button>
                                        ) : null}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPaymentDraft((prev) => prev ? ({ ...prev, paymentAmount: String(prev.totalAmount) }) : prev)}
                                        >
                                            Usar total
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="payment_date">Fecha del débito</Label>
                                    <Input
                                        id="payment_date"
                                        type="date"
                                        value={paymentDraft.paymentDate}
                                        onChange={(event) => setPaymentDraft((prev) => prev ? ({ ...prev, paymentDate: event.target.value }) : prev)}
                                        className="h-10"
                                    />
                                </div>

                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="payment_description">Descripción (opcional)</Label>
                                    <Input
                                        id="payment_description"
                                        value={paymentDraft.description}
                                        onChange={(event) => setPaymentDraft((prev) => prev ? ({ ...prev, description: event.target.value }) : prev)}
                                        placeholder={`Pago de deuda: ${paymentDraft.debtName}`}
                                        className="h-10"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={closePaymentSheet}
                                    disabled={isConfirmingDebtPayment}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleConfirmPayment}
                                    disabled={isConfirmingDebtPayment}
                                >
                                    {isConfirmingDebtPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Confirmar pago
                                </Button>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
