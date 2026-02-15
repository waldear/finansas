'use client';

export const dynamic = 'force-dynamic';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSpace } from '@/components/providers/space-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { CalendarDays, CreditCard, Repeat2, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

type CalendarItem =
    | {
        kind: 'obligation';
        id: string;
        title: string;
        amount: number;
        due_date: string;
        status: string;
        category: string | null;
        minimum_payment: number | null;
    }
    | {
        kind: 'debt';
        id: string;
        title: string;
        amount: number;
        due_date: string;
        category: string | null;
        remaining_installments: number | null;
    }
    | {
        kind: 'recurring';
        id: string;
        title: string;
        amount: number;
        due_date: string;
        type: string;
        frequency: string;
        category: string | null;
    };

type CalendarResponse = {
    range: { from: string; to: string; days: number };
    items: CalendarItem[];
};

function isoToday() {
    return new Date().toISOString().slice(0, 10);
}

function parseMoneyInput(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const stripped = trimmed.replace(/[^\d,.-]/g, '');
    if (!stripped) return null;

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
        normalized = stripped.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
        if (/^-?\d{1,3}(\.\d{3})+$/.test(stripped)) {
            normalized = stripped.replace(/\./g, '');
        }
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(amount: number) {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 0,
    }).format(amount);
}

function formatDateLabel(dateIso: string) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return dateIso;
    return date.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' });
}

type PaymentDraft = {
    kind: 'obligation' | 'debt';
    id: string;
    title: string;
    category: string;
    amountDue: number;
    minimumPayment?: number | null;
    paymentAmount: string;
    paymentDate: string;
    description: string;
};

export default function CalendarPage() {
    const queryClient = useQueryClient();
    const { activeSpaceId, isLoading: isLoadingSpaces, error: spacesError } = useSpace();
    const [days, setDays] = useState(45);
    const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
    const [isPaymentOpen, setIsPaymentOpen] = useState(false);
    const [isPaying, setIsPaying] = useState(false);

    const calendarQuery = useQuery({
        queryKey: ['calendar', activeSpaceId, days],
        queryFn: async () => {
            const response = await fetch(`/api/calendar?days=${days}`, { credentials: 'include', cache: 'no-store' });
            const body = await response.json().catch(() => null);
            if (!response.ok) throw new Error(body?.error || 'No se pudo cargar la agenda.');
            return body as CalendarResponse;
        },
        enabled: Boolean(activeSpaceId),
        staleTime: 30 * 1000,
        refetchOnMount: 'always',
    });

    const grouped = useMemo(() => {
        const map = new Map<string, CalendarItem[]>();
        const items = calendarQuery.data?.items ?? [];
        items.forEach((item) => {
            const key = item.due_date;
            const current = map.get(key) ?? [];
            current.push(item);
            map.set(key, current);
        });
        return Array.from(map.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, dayItems]) => ({ date, items: dayItems }));
    }, [calendarQuery.data?.items]);

    const openPayment = (item: CalendarItem) => {
        if (item.kind !== 'obligation' && item.kind !== 'debt') return;
        const amountDue = Number(item.amount || 0);
        const minimum = item.kind === 'obligation' ? (item.minimum_payment ?? null) : null;
        const suggested = minimum != null && minimum > 0 ? minimum : amountDue;

        setPaymentDraft({
            kind: item.kind,
            id: item.id,
            title: item.title,
            category: item.category || 'Deudas',
            amountDue,
            minimumPayment: minimum,
            paymentAmount: suggested > 0 ? String(suggested) : '',
            paymentDate: isoToday(),
            description: '',
        });
        setIsPaymentOpen(true);
    };

    const closePayment = () => {
        setIsPaymentOpen(false);
        setPaymentDraft(null);
        setIsPaying(false);
    };

    const handleConfirmPayment = async () => {
        if (!paymentDraft) return;

        const parsedAmount = parseMoneyInput(paymentDraft.paymentAmount);
        if (!parsedAmount || parsedAmount <= 0) {
            toast.error('Monto de pago inválido.');
            return;
        }

        setIsPaying(true);
        try {
            const endpoint =
                paymentDraft.kind === 'obligation'
                    ? `/api/obligations/${paymentDraft.id}/confirm-payment`
                    : `/api/debts/${paymentDraft.id}/confirm-payment`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    payment_amount: parsedAmount,
                    payment_date: paymentDraft.paymentDate || isoToday(),
                    description: paymentDraft.description.trim() || undefined,
                }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.error || 'No se pudo confirmar el pago.');
            }

            toast.success('Pago registrado');
            closePayment();

            queryClient.invalidateQueries({ queryKey: ['calendar'] });
            queryClient.invalidateQueries({ queryKey: ['transactions'] });
            queryClient.invalidateQueries({ queryKey: ['debts'] });
            queryClient.invalidateQueries({ queryKey: ['obligations'] });
            queryClient.invalidateQueries({ queryKey: ['audit'] });
            queryClient.invalidateQueries({ queryKey: ['budgets'] });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo confirmar el pago.');
        } finally {
            setIsPaying(false);
        }
    };

    const isLoading = isLoadingSpaces || !activeSpaceId || calendarQuery.isLoading;
    const errorMessage = spacesError || (calendarQuery.error instanceof Error ? calendarQuery.error.message : null);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Agenda</h2>
                    <p className="text-muted-foreground">Vencimientos, cuotas y recurrencias del período.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1 rounded-full border bg-background/60 p-1">
                        {[7, 30, 45, 90].map((value) => (
                            <Button
                                key={value}
                                type="button"
                                size="sm"
                                variant={days === value ? 'default' : 'ghost'}
                                className="h-8 rounded-full px-3"
                                onClick={() => setDays(value)}
                                disabled={isLoading}
                            >
                                {value}d
                            </Button>
                        ))}
                    </div>

                    <Link href="/dashboard/debts">
                        <Button type="button" variant="outline" className="gap-2">
                            <CreditCard className="h-4 w-4" />
                            Gestionar Cards
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>

            {errorMessage ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                    {errorMessage}
                </div>
            ) : null}

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : grouped.length === 0 ? (
                <Card className="glass-card border-0">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-primary" />
                            Sin vencimientos en este período
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        Crea obligaciones o deudas para que aparezcan acá.
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {grouped.map((group) => (
                        <div key={group.date} className="space-y-3">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                <span className="h-2 w-2 rounded-full bg-primary/70" />
                                {formatDateLabel(group.date)} ({group.date})
                            </div>

                            <div className="grid gap-3">
                                {group.items.map((item) => (
                                    <Card key={`${item.kind}-${item.id}`} className="glass-card border-0 rounded-3xl">
                                        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div
                                                    className={cn(
                                                        'mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl',
                                                        item.kind === 'obligation' ? 'bg-amber-500/10 text-amber-500' : '',
                                                        item.kind === 'debt' ? 'bg-red-500/10 text-red-500' : '',
                                                        item.kind === 'recurring' ? 'bg-blue-500/10 text-blue-500' : ''
                                                    )}
                                                >
                                                    {item.kind === 'obligation' ? (
                                                        <CalendarDays className="h-5 w-5" />
                                                    ) : item.kind === 'debt' ? (
                                                        <CreditCard className="h-5 w-5" />
                                                    ) : (
                                                        <Repeat2 className="h-5 w-5" />
                                                    )}
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="truncate font-semibold">{item.title}</p>
                                                    <p className="truncate text-xs text-muted-foreground">
                                                        {item.kind === 'obligation'
                                                            ? `Obligación • ${item.category || 'Deudas'} • ${String(item.status).toUpperCase()}`
                                                            : item.kind === 'debt'
                                                                ? `Deuda • ${item.category || 'Deudas'}${item.remaining_installments != null ? ` • ${item.remaining_installments} cuota(s)` : ''}`
                                                                : `Recurrente • ${item.category || 'General'} • ${item.frequency}`}
                                                    </p>
                                                    {item.kind === 'obligation' && item.minimum_payment != null && item.minimum_payment > 0 ? (
                                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                                            Mínimo: <span className="font-semibold text-foreground">{formatCurrency(item.minimum_payment)}</span>
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-right">
                                                    <p className="text-sm font-black">{formatCurrency(Number(item.amount || 0))}</p>
                                                    <p className="text-[11px] text-muted-foreground">Monto sugerido</p>
                                                </div>

                                                {item.kind === 'recurring' ? (
                                                    <BadgeHint label="Automático" />
                                                ) : (
                                                    <Button
                                                        type="button"
                                                        className="gap-2"
                                                        onClick={() => openPayment(item)}
                                                    >
                                                        <CheckCircle2 className="h-4 w-4" />
                                                        Registrar pago
                                                    </Button>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Sheet open={isPaymentOpen} onOpenChange={(open) => (open ? setIsPaymentOpen(true) : closePayment())}>
                <SheetContent side="bottom" className="rounded-t-3xl">
                    <SheetHeader>
                        <SheetTitle>Registrar pago</SheetTitle>
                        <SheetDescription>
                            Confirma el importe y la fecha. Puedes registrar pagos parciales.
                        </SheetDescription>
                    </SheetHeader>

                    {paymentDraft ? (
                        <div className="mt-5 space-y-4">
                            <div className="rounded-xl border p-3">
                                <p className="text-sm font-semibold">{paymentDraft.title}</p>
                                <p className="text-xs text-muted-foreground">
                                    {paymentDraft.kind === 'obligation' ? 'Obligación' : 'Deuda'} • {paymentDraft.category}
                                </p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Saldo sugerido: <span className="font-semibold text-foreground">{formatCurrency(paymentDraft.amountDue)}</span>
                                    {paymentDraft.kind === 'obligation' && paymentDraft.minimumPayment != null && paymentDraft.minimumPayment > 0 ? (
                                        <>
                                            {' '}• Mínimo: <span className="font-semibold text-foreground">{formatCurrency(paymentDraft.minimumPayment)}</span>
                                        </>
                                    ) : null}
                                </p>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="payment-amount">Monto</Label>
                                    <Input
                                        id="payment-amount"
                                        value={paymentDraft.paymentAmount}
                                        onChange={(event) => setPaymentDraft({ ...paymentDraft, paymentAmount: event.target.value })}
                                        placeholder="Ej: 25000"
                                        inputMode="decimal"
                                        disabled={isPaying}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="payment-date">Fecha</Label>
                                    <Input
                                        id="payment-date"
                                        type="date"
                                        value={paymentDraft.paymentDate}
                                        onChange={(event) => setPaymentDraft({ ...paymentDraft, paymentDate: event.target.value })}
                                        disabled={isPaying}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="payment-desc">Descripción (opcional)</Label>
                                <Input
                                    id="payment-desc"
                                    value={paymentDraft.description}
                                    onChange={(event) => setPaymentDraft({ ...paymentDraft, description: event.target.value })}
                                    placeholder="Ej: Pago tarjeta"
                                    disabled={isPaying}
                                />
                            </div>

                            <div className="flex flex-wrap gap-2 pt-2">
                                {paymentDraft.kind === 'obligation' && paymentDraft.minimumPayment != null && paymentDraft.minimumPayment > 0 ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isPaying}
                                        onClick={() => setPaymentDraft({ ...paymentDraft, paymentAmount: String(paymentDraft.minimumPayment || '') })}
                                    >
                                        Usar mínimo
                                    </Button>
                                ) : null}
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isPaying}
                                    onClick={() => setPaymentDraft({ ...paymentDraft, paymentAmount: String(paymentDraft.amountDue || '') })}
                                >
                                    Usar sugerido
                                </Button>
                                <div className="flex-1" />
                                <Button type="button" variant="outline" disabled={isPaying} onClick={closePayment}>
                                    Cancelar
                                </Button>
                                <Button type="button" disabled={isPaying} onClick={() => void handleConfirmPayment()} className="gap-2">
                                    {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    Confirmar
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </SheetContent>
            </Sheet>
        </div>
    );
}

function BadgeHint({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
            {label}
        </span>
    );
}
