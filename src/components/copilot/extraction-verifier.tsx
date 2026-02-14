
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { CheckCircle2, AlertTriangle, Calendar } from 'lucide-react';

function parseMoney(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const stripped = trimmed.replace(/[^\d,.-]/g, '');
    if (!stripped) return undefined;

    const hasComma = stripped.includes(',');
    const hasDot = stripped.includes('.');
    let normalized = stripped;

    if (hasComma && hasDot) {
        if (stripped.lastIndexOf(',') > stripped.lastIndexOf('.')) {
            normalized = stripped.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = stripped.replace(/,/g, '');
        }
    } else if (hasComma) {
        // AR-style decimals: "1.234,56" (thousands "." + decimal ",")
        normalized = stripped.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
        // If the value looks like thousands separators ("1.234.567"), strip dots.
        if (/^-?\d{1,3}(\.\d{3})+$/.test(stripped)) {
            normalized = stripped.replace(/\./g, '');
        }
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
}

// Schema for verification
const verificationSchema = z.object({
    title: z.string().min(1, 'La descripción es obligatoria'),
    amount: z.preprocess(
        (value) => parseMoney(value),
        z.number({
            required_error: 'El monto es obligatorio',
            invalid_type_error: 'Ingresa un monto válido',
        }).min(0.01, 'El monto debe ser mayor a 0')
    ),
    due_date: z.string().min(1, 'La fecha de vencimiento es obligatoria'),
    category: z.string().optional(),
    minimum_payment: z.preprocess(
        (value) => parseMoney(value),
        z.number({ invalid_type_error: 'Ingresa un monto válido' }).optional()
    ),
    mark_paid: z.boolean().default(false),
    payment_date: z.string().optional(),
    payment_amount: z.preprocess(
        (value) => parseMoney(value),
        z.number({ invalid_type_error: 'Ingresa un monto válido' }).positive().optional()
    ),
    payment_description: z.string().optional(),
}).superRefine((values, ctx) => {
    if (values.mark_paid && !values.payment_date) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Indica la fecha en la que se debitó el pago.',
            path: ['payment_date'],
        });
    }
});

type VerificationFormValues = z.infer<typeof verificationSchema>;

interface ExtractionVerifierProps {
    data: any;
    onConfirm: (data: VerificationFormValues) => void;
    onCancel: () => void;
}

export function ExtractionVerifier({ data, onConfirm, onCancel }: ExtractionVerifierProps) {
    const extractedIssuer = typeof data?.issuer === 'string' ? data.issuer.trim() : '';
    const extractedBrand = typeof data?.card_brand === 'string' ? data.card_brand.trim() : '';
    const extractedPeriod = typeof data?.period_label === 'string' ? data.period_label.trim() : '';
    const extractedTotals = data?.totals_by_currency && typeof data.totals_by_currency === 'object'
        ? data.totals_by_currency
        : null;

    const defaultTitle = (() => {
        if (data?.type === 'credit_card') {
            const parts = [
                'Resumen',
                extractedIssuer || 'Tarjeta',
                extractedBrand,
                extractedPeriod,
            ].filter(Boolean);
            return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        }

        return data.merchant || `Gasto detectado (${data.type})`;
    })();

    const defaultValues: Partial<VerificationFormValues> = {
        title: defaultTitle,
        amount: typeof data?.total_amount === 'number' && data.total_amount > 0 ? data.total_amount : undefined,
        due_date: data.due_date || new Date().toISOString().split('T')[0],
        category: data?.type === 'credit_card' ? 'Tarjeta' : data?.type === 'invoice' ? 'Servicios' : 'Varios',
        minimum_payment: typeof data?.minimum_payment === 'number' && data.minimum_payment > 0 ? data.minimum_payment : undefined,
        mark_paid: false,
        payment_date: new Date().toISOString().split('T')[0],
        payment_amount: undefined,
        payment_description: '',
    };

    const { register, watch, setValue, handleSubmit, formState: { errors } } = useForm<VerificationFormValues>({
        resolver: zodResolver(verificationSchema),
        defaultValues
    });

    const markPaid = watch('mark_paid');
    const observedAmount = watch('amount');
    const observedMinimum = watch('minimum_payment');
    const observedPaymentAmount = watch('payment_amount');

    useEffect(() => {
        if (!markPaid) return;
        if (observedPaymentAmount != null && Number(observedPaymentAmount) > 0) return;
        const fallback = Number(observedMinimum || 0) > 0 ? Number(observedMinimum) : Number(observedAmount || 0);
        if (fallback > 0) {
            setValue('payment_amount', fallback);
        }
    }, [markPaid, observedAmount, observedMinimum, observedPaymentAmount, setValue]);

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
                {data?.type === 'credit_card' && (
                    <div className="mb-5 rounded-lg border bg-muted/20 p-4 text-xs space-y-2">
                        <p className="text-sm font-semibold">Resumen de tarjeta detectado</p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                                <p className="text-muted-foreground">Emisor</p>
                                <p className="font-medium">{extractedIssuer || 'No detectado'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Marca</p>
                                <p className="font-medium">{extractedBrand || 'No detectado'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Total ARS</p>
                                <p className="font-medium">{extractedTotals?.ARS ? `$ ${Number(extractedTotals.ARS).toFixed(0)}` : 'No detectado'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">Total USD</p>
                                <p className="font-medium">{extractedTotals?.USD ? `USD ${Number(extractedTotals.USD).toFixed(2)}` : 'No detectado'}</p>
                            </div>
                        </div>
                        <p className="text-muted-foreground">
                            Consejo: podés guardar el vencimiento acá y luego ir a “Analizar con asistente” para la recomendación de pago según tu liquidez.
                        </p>
                    </div>
                )}
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
                            <Label htmlFor="amount">Saldo / Monto detectado</Label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                <Input
                                    id="amount"
                                    type="text"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    className="pl-7"
                                    {...register('amount')}
                                    onFocus={(event) => {
                                        // Mobile UX: make it easy to overwrite extracted amount (avoids leading 0).
                                        event.currentTarget.select();
                                    }}
                                />
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

                        <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="category">Categoría</Label>
                            <Input id="category" placeholder="Ej: Tarjeta, Servicios, etc." {...register('category')} />
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
                                    <Input
                                        id="minimum_payment"
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        step="0.01"
                                        className="pl-7"
                                        {...register('minimum_payment')}
                                        onFocus={(event) => event.currentTarget.select()}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2 md:col-span-2">
                            <label className="inline-flex items-center gap-2 text-sm font-medium">
                                <input type="checkbox" className="h-4 w-4" {...register('mark_paid')} />
                                Ya se debitó / pagó este importe
                            </label>
                        </div>

                        {markPaid && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="payment_amount">Monto pagado</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
                                        <Input
                                            id="payment_amount"
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            className="pl-7"
                                            placeholder="Ej: 45000"
                                            {...register('payment_amount')}
                                            onFocus={(event) => event.currentTarget.select()}
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setValue('payment_amount', Number(observedAmount || 0))}
                                        >
                                            Usar total
                                        </Button>
                                        {Number(observedMinimum || 0) > 0 ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setValue('payment_amount', Number(observedMinimum || 0))}
                                            >
                                                Usar mínimo
                                            </Button>
                                        ) : null}
                                    </div>
                                    {errors.payment_amount && <p className="text-destructive text-xs">{errors.payment_amount.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="payment_date">Fecha del débito</Label>
                                    <Input id="payment_date" type="date" {...register('payment_date')} />
                                    {errors.payment_date && <p className="text-destructive text-xs">{errors.payment_date.message}</p>}
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="payment_description" className="flex items-center gap-2">
                                        Descripción del pago
                                        <span className="text-xs text-muted-foreground font-normal">(Opcional)</span>
                                    </Label>
                                    <Input
                                        id="payment_description"
                                        placeholder={`Ej: Pago ${defaultTitle}`}
                                        {...register('payment_description')}
                                    />
                                </div>
                            </>
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
