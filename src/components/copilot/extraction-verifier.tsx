
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from 'sonner';

// Schema for verification
const verificationSchema = z.object({
    title: z.string().min(1, 'La descripción es obligatoria'),
    amount: z.coerce.number().min(0.01, 'El monto debe ser mayor a 0'),
    due_date: z.string().min(1, 'La fecha de vencimiento es obligatoria'),
    category: z.string().optional(),
    minimum_payment: z.coerce.number().optional()
});

type VerificationFormValues = z.infer<typeof verificationSchema>;

interface ExtractionVerifierProps {
    data: any;
    onConfirm: (data: VerificationFormValues) => void;
    onCancel: () => void;
}

export function ExtractionVerifier({ data, onConfirm, onCancel }: ExtractionVerifierProps) {
    const defaultValues: VerificationFormValues = {
        title: data.merchant || `Gasto detectado (${data.type})`,
        amount: data.total_amount || 0,
        due_date: data.due_date || new Date().toISOString().split('T')[0],
        category: 'Varios', // Default
        minimum_payment: data.minimum_payment || 0
    };

    const { register, handleSubmit, formState: { errors } } = useForm<VerificationFormValues>({
        resolver: zodResolver(verificationSchema),
        defaultValues
    });

    const onSubmit = (formData: VerificationFormValues) => {
        onConfirm(formData);
    };

    return (
        <Card className="w-full max-w-2xl mx-auto border-l-4 border-l-primary shadow-lg">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                    Verifica los datos extraídos
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    La IA analizó tu documento. Confirma que todo esté correcto antes de guardar.
                </p>
            </CardHeader>
            <CardContent>
                <form id="verification-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Title */}
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="title">Descripción / Comercio</Label>
                            <Input id="title" {...register('title')} />
                            {errors.title && <p className="text-destructive text-xs">{errors.title.message}</p>}
                        </div>

                        {/* Amount */}
                        <div className="space-y-2">
                            <Label htmlFor="amount">Monto Total</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                <Input id="amount" type="number" step="0.01" className="pl-7" {...register('amount')} />
                            </div>
                            {errors.amount && <p className="text-destructive text-xs">{errors.amount.message}</p>}
                        </div>

                        {/* Due Date */}
                        <div className="space-y-2">
                            <Label htmlFor="due_date">Vencimiento</Label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                <Input id="due_date" type="date" className="pl-9" {...register('due_date')} />
                            </div>
                            {errors.due_date && <p className="text-destructive text-xs">{errors.due_date.message}</p>}
                        </div>

                        {/* Minimum Payment (Optional) */}
                        {data.type === 'credit_card' && (
                            <div className="space-y-2">
                                <Label htmlFor="minimum_payment" className="flex items-center gap-2">
                                    Pago Mínimo
                                    <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                                </Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                    <Input id="minimum_payment" type="number" step="0.01" className="pl-7" {...register('minimum_payment')} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI Confidence Alert (Mock logic) */}
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg flex gap-3 text-sm text-yellow-800 dark:text-yellow-200">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <p>
                            Revisa especialmente la <strong>fecha de vencimiento</strong>. A veces los formatos de fecha (DD/MM vs MM/DD) pueden confundir a la IA.
                        </p>
                    </div>
                </form>
            </CardContent>
            <CardFooter className="flex justify-between bg-muted/50 p-6">
                <Button variant="ghost" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button type="submit" form="verification-form">
                    Confirmar y Guardar
                </Button>
            </CardFooter>
        </Card>
    );
}
