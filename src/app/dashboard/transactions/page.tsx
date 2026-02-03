'use client';

import { useTransactions } from '@/hooks/use-transactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionForm } from '@/components/transactions/transaction-form';
import { Loader2 } from 'lucide-react';

export default function TransactionsPage() {
    const { transactions, isLoading } = useTransactions();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Transacciones</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <TransactionForm />

                <Card>
                    <CardHeader>
                        <CardTitle>Últimos Movimientos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : transactions.length > 0 ? (
                            <div className="space-y-4">
                                {transactions.slice(0, 10).map((t: any) => (
                                    <div key={t.id} className="flex justify-between items-center border-b pb-2">
                                        <div>
                                            <p className="font-medium">{t.description}</p>
                                            <p className="text-xs text-muted-foreground">{t.category} • {t.date}</p>
                                        </div>
                                        <p className={`font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {t.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.amount)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No hay transacciones registradas</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
