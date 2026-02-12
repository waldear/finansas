'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DebtSchema, Debt } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFinance } from '@/hooks/use-finance';
import { Loader2 } from 'lucide-react';

export function DebtForm() {
    const { addDebt, isAddingDebt } = useFinance();

    const { register, handleSubmit, reset, formState: { errors } } = useForm<Debt>({
        resolver: zodResolver(DebtSchema),
        defaultValues: {
            remaining_installments: 0,
            total_installments: 1,
            next_payment_date: new Date().toISOString().split('T')[0],
        }
    });

    const onSubmit = async (data: Debt) => {
        try {
            await addDebt(data);
            reset({
                remaining_installments: 0,
                total_installments: 1,
                next_payment_date: new Date().toISOString().split('T')[0],
            });
        } catch {
            // Error feedback is already handled by the mutation hook.
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Nueva Deuda / Crédito</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre / Entidad</Label>
                            <Input id="name" placeholder="Ej: Visa Santander" {...register('name')} />
                            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="category">Categoría</Label>
                            <Input id="category" placeholder="Ej: Bancaria" {...register('category')} />
                            {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="total_amount">Monto Total</Label>
                            <Input id="total_amount" type="number" step="0.01" {...register('total_amount', { valueAsNumber: true })} />
                            {errors.total_amount && <p className="text-xs text-destructive">{errors.total_amount.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="monthly_payment">Cuota Mensual</Label>
                            <Input id="monthly_payment" type="number" step="0.01" {...register('monthly_payment', { valueAsNumber: true })} />
                            {errors.monthly_payment && <p className="text-xs text-destructive">{errors.monthly_payment.message}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="total_installments">Cuotas Totales</Label>
                            <Input id="total_installments" type="number" {...register('total_installments', { valueAsNumber: true })} />
                            {errors.total_installments && <p className="text-xs text-destructive">{errors.total_installments.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="remaining_installments">Cuotas Restantes</Label>
                            <Input id="remaining_installments" type="number" {...register('remaining_installments', { valueAsNumber: true })} />
                            {errors.remaining_installments && <p className="text-xs text-destructive">{errors.remaining_installments.message}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="next_payment_date">Próximo Vencimiento</Label>
                        <Input id="next_payment_date" type="date" {...register('next_payment_date')} />
                        {errors.next_payment_date && <p className="text-xs text-destructive">{errors.next_payment_date.message}</p>}
                    </div>

                    <Button type="submit" className="w-full" disabled={isAddingDebt}>
                        {isAddingDebt ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Registrar Deuda
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
