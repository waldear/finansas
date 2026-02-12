'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Budget, BudgetSchema } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { usePlanning } from '@/hooks/use-planning';

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function BudgetForm() {
    const { addBudget, isAddingBudget } = usePlanning(currentMonth());
    const { register, handleSubmit, reset, formState: { errors } } = useForm<Budget>({
        resolver: zodResolver(BudgetSchema),
        defaultValues: {
            month: currentMonth(),
            alert_threshold: 80,
        },
    });

    const onSubmit = async (data: Budget) => {
        try {
            await addBudget(data);
            reset({
                month: currentMonth(),
                alert_threshold: 80,
            });
        } catch {
            // handled by hook
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Nuevo Presupuesto Mensual</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="budget-category">Categoría</Label>
                        <Input id="budget-category" placeholder="Ej: Comida" {...register('category')} />
                        {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="budget-limit">Límite Mensual</Label>
                            <Input id="budget-limit" type="number" step="0.01" {...register('limit_amount')} />
                            {errors.limit_amount && <p className="text-xs text-destructive">{errors.limit_amount.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="budget-month">Mes</Label>
                            <Input id="budget-month" placeholder="YYYY-MM" {...register('month')} />
                            {errors.month && <p className="text-xs text-destructive">{errors.month.message}</p>}
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="alert-threshold">Alerta (%)</Label>
                        <Input id="alert-threshold" type="number" min={1} max={100} {...register('alert_threshold')} />
                        {errors.alert_threshold && <p className="text-xs text-destructive">{errors.alert_threshold.message}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={isAddingBudget}>
                        {isAddingBudget ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Guardar Presupuesto
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
