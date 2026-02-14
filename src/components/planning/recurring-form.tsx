'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RecurringTransactionInput, RecurringTransactionInputSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { usePlanning } from '@/hooks/use-planning';

export function RecurringForm() {
    const { addRecurring, isAddingRecurring } = usePlanning();

    const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<RecurringTransactionInput>({
        resolver: zodResolver(RecurringTransactionInputSchema),
        defaultValues: {
            type: 'expense',
            frequency: 'monthly',
            start_date: new Date().toISOString().split('T')[0],
            is_active: true,
        },
    });

    const onSubmit = async (data: RecurringTransactionInput) => {
        try {
            await addRecurring({
                ...data,
                next_run: data.start_date,
            });
            reset({
                type: 'expense',
                frequency: 'monthly',
                start_date: new Date().toISOString().split('T')[0],
                is_active: true,
            });
        } catch {
            // handled by hook
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Nueva Regla Recurrente</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>Tipo</Label>
                        <Select
                            onValueChange={(value) => setValue('type', value as 'income' | 'expense')}
                            defaultValue="expense"
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar tipo" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="income">Ingreso</SelectItem>
                                <SelectItem value="expense">Gasto</SelectItem>
                            </SelectContent>
                        </Select>
                        {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="recurring-amount">Monto</Label>
                            <Input id="recurring-amount" type="number" step="0.01" {...register('amount')} />
                            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label>Frecuencia</Label>
                            <Select
                                onValueChange={(value) => setValue('frequency', value as 'weekly' | 'biweekly' | 'monthly')}
                                defaultValue="monthly"
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar frecuencia" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="weekly">Semanal</SelectItem>
                                    <SelectItem value="biweekly">Quincenal</SelectItem>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                </SelectContent>
                            </Select>
                            {errors.frequency && <p className="text-xs text-destructive">{errors.frequency.message}</p>}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="recurring-description">Descripción</Label>
                        <Input id="recurring-description" placeholder="Ej: Suscripción Netflix" {...register('description')} />
                        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="recurring-category">Categoría</Label>
                            <Input id="recurring-category" placeholder="Ej: Entretenimiento" {...register('category')} />
                            {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="recurring-start">Fecha Inicial</Label>
                            <Input id="recurring-start" type="date" {...register('start_date')} />
                            {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
                        </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={isAddingRecurring}>
                        {isAddingRecurring ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Guardar Regla
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
