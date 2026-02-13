'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TransactionInputSchema, TransactionInput } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransactions } from '@/hooks/use-transactions';
import { Loader2 } from 'lucide-react';

export function TransactionForm() {
    const { addTransaction, isAdding } = useTransactions();

    const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<TransactionInput>({
        resolver: zodResolver(TransactionInputSchema),
        defaultValues: {
            type: 'expense',
            date: new Date().toISOString().split('T')[0],
        }
    });

    const onSubmit = (data: TransactionInput) => {
        addTransaction(data, {
            onSuccess: () => reset()
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Nueva Transacción</CardTitle>
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

                    <div className="space-y-2">
                        <Label htmlFor="amount">Monto</Label>
                        <Input
                            id="amount"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...register('amount', { valueAsNumber: true })}
                        />
                        {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Descripción</Label>
                        <Input id="description" placeholder="Ej: Supermercado" {...register('description')} />
                        {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="category">Categoría</Label>
                        <Input id="category" placeholder="Ej: Comida" {...register('category')} />
                        {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="date">Fecha</Label>
                        <Input id="date" type="date" {...register('date')} />
                        {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
                    </div>

                    <Button type="submit" className="w-full" disabled={isAdding}>
                        {isAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Guardar Transacción
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
