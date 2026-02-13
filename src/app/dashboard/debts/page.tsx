'use client';

export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useFinance } from '@/hooks/use-finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebtForm } from '@/components/finance/debt-form';
import { Loader2, CreditCard, Calendar, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DebtsPage() {
    const [processingDebtId, setProcessingDebtId] = useState<string | null>(null);
    const { debts, isLoadingDebts, debtsError, confirmDebtPayment, isConfirmingDebtPayment } = useFinance();

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
                                    const isProcessing = isConfirmingDebtPayment && processingDebtId === debt.id;
                                    const dueBadge = getDueBadge(String(debt.next_payment_date));

                                    return (
                                    <div key={debt.id} className="p-4 border rounded-lg space-y-3">
                                        <div className="flex justify-between items-start">
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

                                        <Button
                                            type="button"
                                            onClick={() => debt.id && handleConfirmPayment(debt.id)}
                                            disabled={!debt.id || isProcessing || isConfirmingDebtPayment || isSettled}
                                            className="w-full"
                                            variant={isSettled ? 'secondary' : 'default'}
                                        >
                                            {isProcessing ? (
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                            )}
                                            {isSettled ? 'Deuda saldada' : 'Confirmar pago debitado'}
                                        </Button>
                                    </div>
                                )})}
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
