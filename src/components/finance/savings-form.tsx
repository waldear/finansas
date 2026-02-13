'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SavingsGoalInputSchema, SavingsGoalInput } from '@/lib/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFinance } from '@/hooks/use-finance';
import { Loader2 } from 'lucide-react';

export function SavingsForm() {
    const { addGoal, isAddingGoal } = useFinance();

    const { register, handleSubmit, reset, formState: { errors } } = useForm<SavingsGoalInput>({
        resolver: zodResolver(SavingsGoalInputSchema),
        defaultValues: {
            current_amount: 0,
            color: '#3b82f6',
            icon: 'piggy-bank',
            category: 'Ahorro',
        }
    });

    const onSubmit = async (data: SavingsGoalInput) => {
        try {
            await addGoal(data);
            reset({
                current_amount: 0,
                color: '#3b82f6',
                icon: 'piggy-bank',
                category: 'Ahorro',
            });
        } catch {
            // Error feedback is already handled by the mutation hook.
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Nueva Meta de Ahorro</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nombre de la Meta</Label>
                        <Input id="name" placeholder="Ej: Viaje a Japón" {...register('name')} />
                        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="target_amount">Monto Objetivo</Label>
                            <Input id="target_amount" type="number" step="0.01" {...register('target_amount', { valueAsNumber: true })} />
                            {errors.target_amount && <p className="text-xs text-destructive">{errors.target_amount.message}</p>}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="current_amount">Monto Inicial</Label>
                            <Input id="current_amount" type="number" step="0.01" {...register('current_amount', { valueAsNumber: true })} />
                            {errors.current_amount && <p className="text-xs text-destructive">{errors.current_amount.message}</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="deadline">Fecha Límite (Opcional)</Label>
                            <Input id="deadline" type="date" {...register('deadline')} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="category">Categoría</Label>
                            <Input id="category" placeholder="Ej: Viajes" {...register('category')} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="color">Color de la Barra</Label>
                            <Input id="color" type="color" {...register('color')} className="h-10 px-1 py-1" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="icon">Icono (slug)</Label>
                            <Input id="icon" placeholder="Ej: plane" {...register('icon')} />
                        </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={isAddingGoal}>
                        {isAddingGoal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Crear Meta
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
