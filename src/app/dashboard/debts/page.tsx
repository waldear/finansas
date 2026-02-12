'use client';

export const dynamic = 'force-dynamic';
import { useFinance } from '@/hooks/use-finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DebtForm } from '@/components/finance/debt-form';
import { Loader2, CreditCard, Calendar, ArrowRight } from 'lucide-react';

export default function DebtsPage() {
    const { debts, isLoadingDebts, debtsError } = useFinance();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
        }).format(amount);
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
                                {debts.map((debt) => (
                                    <div key={debt.id} className="p-4 border rounded-lg space-y-3">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="font-bold text-lg">{debt.name}</h3>
                                                <p className="text-xs text-muted-foreground uppercase">{debt.category}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-red-500 text-lg">{formatCurrency(debt.total_amount)}</p>
                                                <p className="text-xs text-muted-foreground">Total</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-2 border-t text-sm">
                                            <div className="flex items-center gap-2">
                                                <CreditCard className="w-4 h-4 text-muted-foreground" />
                                                <span>Cuota: {formatCurrency(debt.monthly_payment)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                                <span>Restan: {debt.remaining_installments}/{debt.total_installments}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <ArrowRight className="w-3 h-3" />
                                            <span>Próximo vencimiento: {new Date(debt.next_payment_date).toLocaleDateString('es-AR')}</span>
                                        </div>
                                    </div>
                                ))}
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
