'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, useState } from 'react';
import { DebtInput } from '@/lib/schemas';
import { useFinance } from '@/hooks/use-finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebtForm } from '@/components/finance/debt-form';
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

const emptyDebtInput: DebtInput = {
    name: '',
    category: '',
    total_amount: 0,
    monthly_payment: 0,
    remaining_installments: 0,
    total_installments: 1,
    next_payment_date: new Date().toISOString().split('T')[0],
};

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

export default function DebtsPage() {
    const [processingDebtId, setProcessingDebtId] = useState<string | null>(null);
    const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
    const [targetDebtId, setTargetDebtId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<DebtInput>(emptyDebtInput);

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

    const handleConfirmPayment = async (debtId: string) => {
        setProcessingDebtId(debtId);
        try {
            await confirmDebtPayment({ debtId });
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
                                    const isSettled = totalAmount <= 0 || remainingInstallments <= 0;
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

                                            <div className="grid grid-cols-2 gap-4 pt-2 border-t text-sm">
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
                                                <span>Próximo vencimiento: {new Date(debt.next_payment_date).toLocaleDateString('es-AR')}</span>
                                            </div>
                                            {!isSettled && (
                                                <p className={`text-xs ${dueBadge.className}`}>{dueBadge.label}</p>
                                            )}

                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <Button
                                                    type="button"
                                                    onClick={() => debt.id && handleConfirmPayment(debt.id)}
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
        </div>
    );
}
