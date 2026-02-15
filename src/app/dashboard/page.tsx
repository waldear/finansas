'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useDashboard } from '@/hooks/use-dashboard';
import { usePlanning } from '@/hooks/use-planning';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    TrendingUp,
    Wallet,
    Plus,
    ArrowUpRight,
    ArrowDownLeft,
    PieChart,
    Activity,
    AlertTriangle,
    Paperclip,
    StickyNote,
    Eye,
    EyeOff,
    Settings2,
    ChevronUp,
    ChevronDown,
    CalendarDays,
    CreditCard,
    Repeat2,
    Loader2,
} from 'lucide-react';
import { DashboardSkeleton } from '@/components/layout/dashboard-skeleton';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAssistantAttachment } from '@/components/providers/assistant-attachment-provider';
import {
    MAX_ASSISTANT_ATTACHMENT_SIZE_BYTES,
    SUPPORTED_ASSISTANT_ATTACHMENT_TYPES,
} from '@/lib/assistant-attachments';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useSpace } from '@/components/providers/space-provider';

const NET_WORTH_VISIBILITY_KEY = 'finansas-net-worth-visible';
const DASHBOARD_WIDGETS_KEY = 'finansas-dashboard-widgets-v1';

type DashboardWidgetId = 'hero' | 'quick_actions' | 'summary_cards' | 'insights' | 'agenda' | 'recent_activity';
type DashboardWidgetState = { id: DashboardWidgetId; enabled: boolean };

type CalendarPreviewItem =
    | {
        kind: 'obligation';
        id: string;
        title: string;
        amount: number;
        due_date: string;
        status: 'pending' | 'overdue' | 'paid' | string;
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
        type: 'income' | 'expense' | string;
        frequency: string;
        category: string | null;
    };

type CalendarPreviewResponse = {
    range: { from: string; to: string; days: number };
    items: CalendarPreviewItem[];
};

const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetState[] = [
    { id: 'hero', enabled: true },
    { id: 'quick_actions', enabled: true },
    { id: 'agenda', enabled: true },
    { id: 'summary_cards', enabled: true },
    { id: 'insights', enabled: true },
    { id: 'recent_activity', enabled: true },
];

const DASHBOARD_WIDGET_META: Record<DashboardWidgetId, { label: string; description: string }> = {
    hero: { label: 'Patrimonio', description: 'Tarjeta principal (balance neto).' },
    quick_actions: { label: 'Acciones', description: 'Ingresar, gastar, adjuntar y auditoría.' },
    agenda: { label: 'Agenda', description: 'Próximos vencimientos y recurrencias.' },
    summary_cards: { label: 'Resumen', description: 'Portfolio + gastos mensuales.' },
    insights: { label: 'Insights', description: 'KPIs semanales y recomendaciones.' },
    recent_activity: { label: 'Actividad', description: 'Últimos movimientos registrados.' },
};

function widgetStorageKeyForSpace(spaceId?: string | null) {
    return spaceId ? `${DASHBOARD_WIDGETS_KEY}:${spaceId}` : DASHBOARD_WIDGETS_KEY;
}

function loadDashboardWidgets(storageKey: string): DashboardWidgetState[] {
    if (typeof window === 'undefined') return DEFAULT_DASHBOARD_WIDGETS;

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return DEFAULT_DASHBOARD_WIDGETS;

        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed?.widgets) ? parsed.widgets : Array.isArray(parsed) ? parsed : null;
        if (!Array.isArray(list)) return DEFAULT_DASHBOARD_WIDGETS;

        const allowed = new Set(DEFAULT_DASHBOARD_WIDGETS.map((widget) => widget.id));
        const cleaned: DashboardWidgetState[] = [];

        for (const item of list) {
            const id = typeof item?.id === 'string' ? (item.id as DashboardWidgetId) : null;
            if (!id || !allowed.has(id)) continue;
            if (cleaned.some((widget) => widget.id === id)) continue;

            cleaned.push({
                id,
                enabled: typeof item?.enabled === 'boolean'
                    ? item.enabled
                    : DEFAULT_DASHBOARD_WIDGETS.find((widget) => widget.id === id)?.enabled ?? true,
            });
        }

        // Append any missing widgets (forward compatible)
        for (const widget of DEFAULT_DASHBOARD_WIDGETS) {
            if (!cleaned.some((item) => item.id === widget.id)) {
                cleaned.push(widget);
            }
        }

        return cleaned;
    } catch {
        return DEFAULT_DASHBOARD_WIDGETS;
    }
}

function saveDashboardWidgets(storageKey: string, widgets: DashboardWidgetState[]) {
    try {
        window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, widgets }));
    } catch {
        // no-op
    }
}

export default function DashboardPage() {
    const router = useRouter();
    const { activeSpaceId } = useSpace();
    const widgetsStorageKey = useMemo(() => widgetStorageKeyForSpace(activeSpaceId), [activeSpaceId]);
    const { debts, transactions, isLoading } = useDashboard();
    const { budgets, recurringTransactions, runRecurring } = usePlanning();
    const recurringRanRef = useRef<string | null>(null);
    const attachmentInputRef = useRef<HTMLInputElement | null>(null);
    const { setPendingFile } = useAssistantAttachment();
    const [isNetWorthVisible, setIsNetWorthVisible] = useState(true);
    const [widgets, setWidgets] = useState<DashboardWidgetState[]>(DEFAULT_DASHBOARD_WIDGETS);
    const [isWidgetsOpen, setIsWidgetsOpen] = useState(false);

    // Memoize expensive calculations
    const financialStats = useMemo(() => {
        const totalIncome = transactions
            .filter((t: any) => t.type === 'income')
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const totalExpenses = transactions
            .filter((t: any) => t.type === 'expense')
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const totalDebt = debts.reduce((acc: number, d: any) => acc + d.total_amount, 0);
        const balance = totalIncome - totalExpenses;

        return { totalIncome, totalExpenses, totalDebt, balance };
    }, [transactions, debts]);

    const weeklyInsights = useMemo(() => {
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const startCurrent = new Date(today);
        startCurrent.setUTCDate(today.getUTCDate() - 6);
        const startPrevious = new Date(startCurrent);
        startPrevious.setUTCDate(startCurrent.getUTCDate() - 7);
        const endPrevious = new Date(startCurrent);
        endPrevious.setUTCDate(startCurrent.getUTCDate() - 1);

        const toDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
        const inRange = (value: string, start: Date, end: Date) => {
            const date = toDate(value);
            return date >= start && date <= end;
        };

        const currentWeekIncome = transactions
            .filter((t: any) => t.type === 'income' && inRange(t.date, startCurrent, today))
            .reduce((acc: number, t: any) => acc + t.amount, 0);
        const currentWeekExpense = transactions
            .filter((t: any) => t.type === 'expense' && inRange(t.date, startCurrent, today))
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const previousWeekIncome = transactions
            .filter((t: any) => t.type === 'income' && inRange(t.date, startPrevious, endPrevious))
            .reduce((acc: number, t: any) => acc + t.amount, 0);
        const previousWeekExpense = transactions
            .filter((t: any) => t.type === 'expense' && inRange(t.date, startPrevious, endPrevious))
            .reduce((acc: number, t: any) => acc + t.amount, 0);

        const currentNet = currentWeekIncome - currentWeekExpense;
        const previousNet = previousWeekIncome - previousWeekExpense;
        const netDelta = currentNet - previousNet;
        const trend = previousNet === 0 ? 100 : (netDelta / Math.abs(previousNet)) * 100;

        const budgetAlerts = budgets
            .filter((budget: any) => budget.isAlert)
            .slice(0, 2)
            .map((budget: any) => `Tu presupuesto de ${budget.category} está en ${Math.round(budget.usage)}%.`);

        const recurringAlerts = recurringTransactions
            .filter((rule: any) => rule.is_active)
            .slice(0, 2)
            .map((rule: any) => `Próxima recurrencia: ${rule.description} (${rule.next_run}).`);

        const recommendations = [
            ...budgetAlerts,
            ...recurringAlerts,
        ];

        if (recommendations.length === 0) {
            recommendations.push('Todo está en rango: no hay alertas críticas esta semana.');
        }

        return {
            currentWeekIncome,
            currentWeekExpense,
            currentNet,
            trend,
            recommendations,
        };
    }, [transactions, budgets, recurringTransactions]);

    useEffect(() => {
        if (!activeSpaceId) return;
        if (recurringRanRef.current === activeSpaceId) return;
        recurringRanRef.current = activeSpaceId;
        runRecurring().catch(() => {});
    }, [activeSpaceId, runRecurring]);

    useEffect(() => {
        try {
            const storedValue = window.localStorage.getItem(NET_WORTH_VISIBILITY_KEY);
            if (storedValue === 'hidden') {
                setIsNetWorthVisible(false);
            }
        } catch {
            // no-op
        }
    }, []);

    useEffect(() => {
        if (!activeSpaceId) return;
        setWidgets(loadDashboardWidgets(widgetsStorageKey));
    }, [activeSpaceId, widgetsStorageKey]);

    const persistWidgets = (nextWidgets: DashboardWidgetState[]) => {
        if (!activeSpaceId) return;
        saveDashboardWidgets(widgetsStorageKey, nextWidgets);
    };

    const toggleNetWorthVisibility = () => {
        setIsNetWorthVisible((previous) => {
            const next = !previous;
            try {
                window.localStorage.setItem(NET_WORTH_VISIBILITY_KEY, next ? 'visible' : 'hidden');
            } catch {
                // no-op
            }
            return next;
        });
    };

    const toggleWidget = (id: DashboardWidgetId) => {
        setWidgets((previous) => {
            const next = previous.map((widget) => widget.id === id ? { ...widget, enabled: !widget.enabled } : widget);
            persistWidgets(next);
            return next;
        });
    };

    const moveWidget = (id: DashboardWidgetId, direction: 'up' | 'down') => {
        setWidgets((previous) => {
            const index = previous.findIndex((widget) => widget.id === id);
            if (index < 0) return previous;

            const swapWith = direction === 'up' ? index - 1 : index + 1;
            if (swapWith < 0 || swapWith >= previous.length) return previous;

            const next = [...previous];
            const temp = next[index];
            next[index] = next[swapWith];
            next[swapWith] = temp;
            persistWidgets(next);
            return next;
        });
    };

    const resetWidgets = () => {
        setWidgets(() => {
            persistWidgets(DEFAULT_DASHBOARD_WIDGETS);
            return DEFAULT_DASHBOARD_WIDGETS;
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            minimumFractionDigits: 0,
        }).format(amount);
    };

    const formatShortDate = (iso: string) => {
        const [year, month, day] = iso.split('-').map((p) => Number(p));
        if (!year || !month || !day) return iso;
        const date = new Date(Date.UTC(year, month - 1, day));
        return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(date);
    };

    const handleAttachmentSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!SUPPORTED_ASSISTANT_ATTACHMENT_TYPES.has(file.type)) {
            toast.error('Formato no soportado. Usa PDF, JPG, PNG o WEBP.');
            event.target.value = '';
            return;
        }

        if (file.size > MAX_ASSISTANT_ATTACHMENT_SIZE_BYTES) {
            toast.error('El archivo supera 10MB. Sube uno más liviano.');
            event.target.value = '';
            return;
        }

        setPendingFile(file);
        event.target.value = '';
        router.push('/dashboard/copilot');
    };

    const actionButtons = [
        { id: 'income', label: 'Ingresar', icon: Plus, color: 'bg-emerald-500', href: '/dashboard/transactions' },
        { id: 'expense', label: 'Gastar', icon: ArrowUpRight, color: 'bg-red-500', href: '/dashboard/transactions' },
        {
            id: 'copilot',
            label: 'Adjuntar',
            icon: Paperclip,
            color: 'bg-blue-500',
            onClick: () => attachmentInputRef.current?.click(),
            ariaLabel: 'Adjuntar extracto, resumen o foto',
        },
        { id: 'audit', label: 'Auditoría', icon: StickyNote, color: 'bg-zinc-700', href: '/dashboard/audit' },
    ] as const;

    const isAgendaEnabled = widgets.some((widget) => widget.id === 'agenda' && widget.enabled);

    const calendarPreviewQuery = useQuery({
        queryKey: ['calendar-preview', activeSpaceId],
        queryFn: async () => {
            const res = await fetch('/api/calendar?days=14', { credentials: 'include', cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar agenda');
            return body as CalendarPreviewResponse;
        },
        staleTime: 60 * 1000,
        refetchOnMount: 'always',
        enabled: Boolean(activeSpaceId) && isAgendaEnabled,
    });

    const widgetOrderById = new Map<DashboardWidgetId, number>();
    const widgetEnabledById = new Map<DashboardWidgetId, boolean>();
    widgets.forEach((widget, index) => {
        widgetOrderById.set(widget.id, index);
        widgetEnabledById.set(widget.id, widget.enabled);
    });

    const widgetOrder = (id: DashboardWidgetId) => widgetOrderById.get(id) ?? 999;
    const widgetEnabled = (id: DashboardWidgetId) => widgetEnabledById.get(id) ?? true;

    if (isLoading) {
        return <DashboardSkeleton />;
    }

    const { totalExpenses, totalDebt, balance } = financialStats;

    const agendaItems = (calendarPreviewQuery.data?.items || []).slice(0, 5);

    const agendaIconFor = (item: CalendarPreviewItem) => {
        if (item.kind === 'recurring') return <Repeat2 className="h-5 w-5" />;
        if (item.kind === 'debt') return <CreditCard className="h-5 w-5" />;
        return <CalendarDays className="h-5 w-5" />;
    };

    const agendaTintFor = (item: CalendarPreviewItem) => {
        if (item.kind === 'obligation' && item.status === 'overdue') return 'bg-red-500/10 text-red-500';
        if (item.kind === 'recurring') return 'bg-blue-500/10 text-blue-500';
        if (item.kind === 'debt') return 'bg-amber-500/10 text-amber-500';
        return 'bg-emerald-500/10 text-emerald-500';
    };

    return (
        <div className="space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-start justify-between gap-3 px-2">
                <div className="min-w-0">
                    <h1 className="text-2xl font-black tracking-tight">Inicio</h1>
                    <p className="text-sm text-muted-foreground">Personaliza tu dashboard y revisa vencimientos.</p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() => setIsWidgetsOpen(true)}
                    disabled={!activeSpaceId}
                    title={!activeSpaceId ? 'Cargando espacio…' : 'Personalizar dashboard'}
                    aria-label="Personalizar dashboard"
                >
                    <Settings2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex flex-col gap-10">
                {widgetEnabled('hero') ? (
                    <div style={{ order: widgetOrder('hero') }} role="region" aria-label="Patrimonio">
                        <div className="relative overflow-hidden rounded-[3rem] premium-gradient p-8 text-white neon-glow shadow-2xl transition-transform hover:scale-[1.01] duration-500">
                            <button
                                type="button"
                                onClick={toggleNetWorthVisibility}
                                className="absolute right-6 top-6 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
                                aria-label={isNetWorthVisible ? 'Ocultar patrimonio' : 'Mostrar patrimonio'}
                                title={isNetWorthVisible ? 'Ocultar patrimonio' : 'Mostrar patrimonio'}
                            >
                                {isNetWorthVisible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
                                <p className="text-sm font-medium uppercase tracking-[0.2em] opacity-80">PATRIMONIO NETO TOTAL</p>
                                <div className="flex items-baseline">
                                    <span className="text-6xl font-black tracking-tighter">
                                        {isNetWorthVisible ? formatCurrency(balance - totalDebt).split(',')[0] : '$ ••••••'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-1.5 glass rounded-full text-xs font-bold">
                                    <TrendingUp className="h-4 w-4" />
                                    <span>+12.4% este mes</span>
                                </div>
                            </div>

                            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                            <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-64 h-64 bg-cyan-400/20 rounded-full blur-3xl" />
                        </div>
                    </div>
                ) : null}

                {widgetEnabled('quick_actions') ? (
                    <div style={{ order: widgetOrder('quick_actions') }} role="region" aria-label="Acciones rápidas">
                        <div className="flex justify-between px-2 max-w-md mx-auto w-full">
                            <input
                                ref={attachmentInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                onChange={handleAttachmentSelection}
                                className="hidden"
                                title="Seleccionar archivo"
                            />
                            {actionButtons.map((btn) => (
                                <div key={btn.label} className="flex flex-col items-center gap-2">
                                    {'href' in btn ? (
                                        <Link href={btn.href}>
                                            <div
                                                className={cn(
                                                    'h-16 w-16 rounded-full flex items-center justify-center text-white transition-all shadow-xl hover:scale-110 active:scale-90',
                                                    btn.color
                                                )}
                                            >
                                                <btn.icon className="h-8 w-8" />
                                            </div>
                                        </Link>
                                    ) : (
                                        <button
                                            type="button"
                                            className={cn(
                                                'h-16 w-16 rounded-full flex items-center justify-center text-white transition-all shadow-xl hover:scale-110 active:scale-90',
                                                btn.color
                                            )}
                                            onClick={btn.onClick}
                                            aria-label={btn.ariaLabel}
                                            title={btn.ariaLabel}
                                        >
                                            <btn.icon className="h-8 w-8" />
                                        </button>
                                    )}
                                    <span className="text-xs font-bold text-muted-foreground">{btn.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {widgetEnabled('agenda') ? (
                    <div style={{ order: widgetOrder('agenda') }} role="region" aria-label="Agenda">
                        <Card className="glass-card rounded-[2.5rem] border-0 p-6">
                            <CardHeader className="p-0 pb-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <CardTitle className="text-xl">Agenda</CardTitle>
                                        <p className="text-xs text-muted-foreground">Próximos 14 días</p>
                                    </div>
                                    <Button asChild variant="outline" size="sm" className="rounded-full">
                                        <Link href="/dashboard/calendar">Ver agenda</Link>
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {!activeSpaceId ? (
                                    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Cargando tu espacio…</div>
                                ) : calendarPreviewQuery.isLoading ? (
                                    <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando agenda…
                                    </div>
                                ) : calendarPreviewQuery.isError ? (
                                    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No se pudo cargar la agenda.</div>
                                ) : agendaItems.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">No tenés vencimientos cercanos.</div>
                                ) : (
                                    <div className="space-y-2">
                                        {agendaItems.map((item) => (
                                            <div
                                                key={`${item.kind}:${item.id}`}
                                                className="flex items-center gap-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3"
                                            >
                                                <div
                                                    className={cn(
                                                        'h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center',
                                                        agendaTintFor(item)
                                                    )}
                                                >
                                                    {agendaIconFor(item)}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-bold">{item.title}</p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {formatShortDate(item.due_date)}
                                                        {item.category ? ` • ${item.category}` : ''}
                                                        {item.kind === 'recurring' ? ` • ${item.frequency}` : ''}
                                                        {item.kind === 'debt' && item.remaining_installments != null
                                                            ? ` • ${item.remaining_installments} cuotas`
                                                            : ''}
                                                        {item.kind === 'obligation' && item.status === 'overdue' ? ' • Atrasado' : ''}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black">{formatCurrency(Number(item.amount || 0))}</p>
                                                    <p className="text-[10px] text-muted-foreground">Monto</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                ) : null}

                {widgetEnabled('summary_cards') ? (
                    <div style={{ order: widgetOrder('summary_cards') }} role="region" aria-label="Resumen">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card className="glass-card rounded-[2.5rem] p-6 border-0 overflow-hidden relative group">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                        <Activity className="h-6 w-6" />
                                    </div>
                                    <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-xs font-bold">+12%</div>
                                </div>
                                <p className="text-sm font-bold text-muted-foreground mb-1">Portfolio</p>
                                <h3 className="text-3xl font-black">{formatCurrency(balance)}</h3>
                                <div className="mt-6 h-16 w-full opacity-50 group-hover:opacity-100 transition-opacity">
                                    <svg className="w-full h-full" viewBox="0 0 100 20">
                                        <path
                                            d="M0 15 Q 25 5, 50 12 T 100 0"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            className="text-primary"
                                        />
                                    </svg>
                                </div>
                            </Card>

                            <Card className="glass-card rounded-[2.5rem] p-6 border-0 overflow-hidden relative">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
                                        <PieChart className="h-6 w-6" />
                                    </div>
                                    <div className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                                </div>
                                <p className="text-sm font-bold text-muted-foreground mb-1">Gastos Mensuales</p>
                                <h3 className="text-3xl font-black">{formatCurrency(totalExpenses)}</h3>
                                <div className="mt-6 space-y-2">
                                    <div className="flex justify-between text-xs font-bold">
                                        <span className="opacity-60">Límite: {formatCurrency(450000)}</span>
                                        <span>{Math.round((totalExpenses / 450000) * 100)}%</span>
                                    </div>
                                    <Progress value={(totalExpenses / 450000) * 100} className="h-2 [&>div]:neon-glow" />
                                </div>
                            </Card>
                        </div>
                    </div>
                ) : null}

                {widgetEnabled('insights') ? (
                    <div style={{ order: widgetOrder('insights') }} role="region" aria-label="Insights">
                        <div className="grid gap-6 md:grid-cols-2">
                            <Card className="glass-card rounded-[2rem] border-0 p-6">
                                <CardHeader className="p-0 pb-4">
                                    <CardTitle>KPIs Semanales</CardTitle>
                                </CardHeader>
                                <CardContent className="p-0 space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Ingresos:{' '}
                                        <span className="font-bold text-emerald-500">{formatCurrency(weeklyInsights.currentWeekIncome)}</span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Gastos:{' '}
                                        <span className="font-bold text-red-500">{formatCurrency(weeklyInsights.currentWeekExpense)}</span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Neto semanal:{' '}
                                        <span className={cn('font-bold', weeklyInsights.currentNet >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                            {formatCurrency(weeklyInsights.currentNet)}
                                        </span>
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        Tendencia vs semana anterior:{' '}
                                        <span className={cn('font-bold', weeklyInsights.trend >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                                            {weeklyInsights.trend.toFixed(1)}%
                                        </span>
                                    </p>
                                </CardContent>
                            </Card>

                            <Card className="glass-card rounded-[2rem] border-0 p-6">
                                <CardHeader className="p-0 pb-4">
                                    <CardTitle className="flex items-center gap-2">
                                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                                        Recomendaciones Automáticas
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0 space-y-2">
                                    {weeklyInsights.recommendations.map((recommendation, index) => (
                                        <p key={index} className="text-sm text-muted-foreground">
                                            • {recommendation}
                                        </p>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                ) : null}

                {widgetEnabled('recent_activity') ? (
                    <div style={{ order: widgetOrder('recent_activity') }} role="region" aria-label="Actividad reciente">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="text-xl font-black tracking-tight">Actividad Reciente</h3>
                                <Link href="/dashboard/history" className="text-sm font-bold text-primary hover:underline">
                                    Ver todo
                                </Link>
                            </div>

                            <div className="space-y-3">
                                {transactions.slice(0, 4).map((t: any) => (
                                    <Card
                                        key={t.id}
                                        className="glass-card rounded-3xl p-4 border-0 flex items-center gap-4 hover:bg-white/[0.05] transition-colors group"
                                    >
                                        <div
                                            className={cn(
                                                'h-12 w-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform',
                                                t.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                                            )}
                                        >
                                            {t.type === 'income' ? <ArrowDownLeft className="h-6 w-6" /> : <ArrowUpRight className="h-6 w-6" />}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-bold text-sm">{t.description}</p>
                                            <p className="text-xs text-muted-foreground font-medium">{t.category} • Hoy</p>
                                        </div>
                                        <div
                                            className={cn('text-sm font-black text-right', t.type === 'income' ? 'text-emerald-500' : 'text-foreground')}
                                        >
                                            {t.type === 'income' ? '+' : '-'} {formatCurrency(t.amount)}
                                        </div>
                                    </Card>
                                ))}
                                {transactions.length === 0 ? (
                                    <div className="py-12 text-center text-muted-foreground bg-muted/20 rounded-3xl border-2 border-dashed border-muted">
                                        <Wallet className="h-10 w-10 mx-auto mb-2 opacity-20" />
                                        <p className="text-sm font-medium">Aún no hay movimientos</p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            <Sheet open={isWidgetsOpen} onOpenChange={setIsWidgetsOpen}>
                <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-3xl">
                    <SheetHeader>
                        <SheetTitle>Personalizar dashboard</SheetTitle>
                        <SheetDescription>Ordena y activa secciones. Se guarda por espacio y por dispositivo.</SheetDescription>
                    </SheetHeader>

                    <div className="mt-6 space-y-3">
                        {widgets.map((widget, index) => {
                            const meta = DASHBOARD_WIDGET_META[widget.id];
                            return (
                                <div key={widget.id} className="flex items-start justify-between gap-3 rounded-2xl border p-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold">{meta.label}</p>
                                        <p className="text-xs text-muted-foreground">{meta.description}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-full"
                                            onClick={() => moveWidget(widget.id, 'up')}
                                            disabled={index === 0}
                                            aria-label="Mover arriba"
                                            title="Mover arriba"
                                        >
                                            <ChevronUp className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-full"
                                            onClick={() => moveWidget(widget.id, 'down')}
                                            disabled={index === widgets.length - 1}
                                            aria-label="Mover abajo"
                                            title="Mover abajo"
                                        >
                                            <ChevronDown className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="rounded-full"
                                            onClick={() => toggleWidget(widget.id)}
                                            aria-label={widget.enabled ? 'Ocultar sección' : 'Mostrar sección'}
                                            title={widget.enabled ? 'Ocultar sección' : 'Mostrar sección'}
                                        >
                                            {widget.enabled ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                            <Button type="button" variant="outline" onClick={resetWidgets}>
                                Restablecer
                            </Button>
                            <Button type="button" onClick={() => setIsWidgetsOpen(false)}>
                                Listo
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
