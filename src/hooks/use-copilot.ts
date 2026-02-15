
import { useQuery } from '@tanstack/react-query';
import { useFinance } from './use-finance';
import { useTransactions } from './use-transactions';
import { useSpace } from '@/components/providers/space-provider';

export type FinancialProfile = 'defensive' | 'balanced' | 'accelerated' | 'unknown';
export type RiskLevel = 'low' | 'medium' | 'high';

export interface WeeklyAction {
    id: string;
    title: string;
    description: string;
    type: 'payment' | 'saving' | 'review' | 'investment';
    priority: number; // 1 (Highest) to 3 (Lowest)
    isCompleted: boolean;
}

export interface CopilotInsight {
    profile: FinancialProfile;
    riskLevel: RiskLevel;
    capitalAvailable: number;
    weeklyActions: WeeklyAction[];
    monthlyOutlook: string; // "Surviving", "Building", "Thriving"
}

interface Obligation {
    id: string;
    title: string;
    amount: number | string;
    due_date: string;
    status: string;
    category: string;
}

function toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function useCopilot() {
    const { activeSpaceId, isLoading: isLoadingSpaces } = useSpace();
    const { debts, savingsGoals, isLoadingGoals } = useFinance();
    const { transactions, isLoading: isLoadingTransactions } = useTransactions();

    const { data: obligations, isLoading: isLoadingObligations } = useQuery<Obligation[]>({
        queryKey: ['obligations', activeSpaceId],
        queryFn: async () => {
            const res = await fetch('/api/obligations', { credentials: 'include', cache: 'no-store' });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || 'Error al cargar obligaciones');
            const data = (body || []) as Obligation[];
            return data.filter((obligation) => obligation.status !== 'paid');
        },
        staleTime: 5 * 60 * 1000, // 5 minutes cache
        refetchOnMount: 'always',
        enabled: Boolean(activeSpaceId),
    });

    const calculateFinancialProfile = (): CopilotInsight => {
        if (isLoadingTransactions || isLoadingGoals || isLoadingObligations || !transactions) {
            return {
                profile: 'unknown',
                riskLevel: 'medium',
                capitalAvailable: 0,
                weeklyActions: [],
                monthlyOutlook: 'Calculating...'
            };
        }

        // 1. Calculate basic cashflow (Last 30 days)
        let income = 0;
        let expenses = 0;

        transactions.forEach((transaction) => {
            if (transaction.type === 'income') income += toNumber(transaction.amount);
            if (transaction.type === 'expense') expenses += toNumber(transaction.amount);
        });

        const activeDebts = debts.filter((debt) => (
            toNumber((debt as any).total_amount) > 0 &&
            toNumber((debt as any).remaining_installments) > 0
        ));
        const openObligations = (obligations || []).filter((obligation) => obligation.status !== 'paid');
        const totalObligations = openObligations.reduce((acc, obligation) => acc + toNumber(obligation.amount), 0);
        const monthlyDebtPayments = activeDebts.reduce((acc, debt) => acc + toNumber((debt as any).monthly_payment), 0);

        // Simple "Capital Available" metric
        const capitalAvailable = income - (expenses + totalObligations + monthlyDebtPayments);

        // 2. Determine Profile
        let profile: FinancialProfile = 'balanced';
        let riskLevel: RiskLevel = 'medium';
        let outlook = "Estable";

        const savingsRate = income > 0 ? (income - expenses) / income : 0;
        const hasEmergencyFund = savingsGoals.some(g => g.category === 'emergency' && g.current_amount > g.target_amount * 0.5);

        if (capitalAvailable < 0) {
            profile = 'defensive';
            riskLevel = 'high';
            outlook = "En Alerta";
        } else if (savingsRate > 0.2 && hasEmergencyFund) {
            profile = 'accelerated';
            riskLevel = 'low';
            outlook = "En Crecimiento";
        } else {
            profile = 'balanced';
            riskLevel = 'medium';
            outlook = "Equilibrado";
        }

        // 3. Generate Actions based on Profile
        const actions: WeeklyAction[] = [];
        const now = new Date();
        const normalizedObligationTitles = new Set(
            openObligations.map((obligation) => normalizeText(obligation.title || ''))
        );

        const upsertAction = (action: WeeklyAction) => {
            const existingIndex = actions.findIndex((item) => item.id === action.id);
            if (existingIndex >= 0) {
                if (actions[existingIndex].priority > action.priority) {
                    actions[existingIndex] = action;
                }
                return;
            }
            actions.push(action);
        };

        openObligations.forEach((obligation) => {
            const dueDate = new Date(obligation.due_date);
            if (Number.isNaN(dueDate.getTime())) return;

            const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
            if (daysUntilDue > 5) return;

            const amount = toNumber(obligation.amount);
            const isOverdue = obligation.status === 'overdue' || daysUntilDue < 0;
            const urgencyLabel = isOverdue
                ? `Vencida hace ${Math.abs(daysUntilDue)} día(s)`
                : `Vence en ${daysUntilDue} día(s)`;

            upsertAction({
                id: `obligation-${obligation.id}`,
                title: `Pagar ${obligation.title}`,
                description: `${urgencyLabel} · $${amount.toFixed(0)}`,
                type: 'payment',
                priority: 1,
                isCompleted: false,
            });
        });

        activeDebts.forEach((debt) => {
            const nextPaymentDate = new Date((debt as any).next_payment_date);
            if (Number.isNaN(nextPaymentDate.getTime())) return;

            const daysUntilDue = Math.ceil((nextPaymentDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
            if (daysUntilDue > 5) return;

            const debtName = String((debt as any).name || 'Tu deuda');
            if (normalizedObligationTitles.has(normalizeText(debtName))) return;

            const monthlyPayment = toNumber((debt as any).monthly_payment);
            const urgencyLabel = daysUntilDue < 0
                ? `Pago vencido hace ${Math.abs(daysUntilDue)} día(s)`
                : `Próximo pago en ${daysUntilDue} día(s)`;

            upsertAction({
                id: `debt-${(debt as any).id}`,
                title: `Confirmar débito: ${debtName}`,
                description: `${urgencyLabel} · cuota $${monthlyPayment.toFixed(0)}`,
                type: 'payment',
                priority: 1,
                isCompleted: false,
            });
        });

        if (profile === 'defensive') {
            actions.push({
                id: 'review-subs',
                title: 'Revisar Suscripciones',
                description: 'Tienes gastos recurrentes que podrías pausar para recuperar liquidez.',
                type: 'review',
                priority: 1,
                isCompleted: false
            });
            actions.push({
                id: 'min-payment',
                title: 'Priorizar Pagos Mínimos',
                description: 'Si no cubres el total, asegura al menos el pago mínimo de tarjetas.',
                type: 'payment',
                priority: 2,
                isCompleted: false
            });
        }

        if (profile === 'balanced') {
            if (income > 0 && !hasEmergencyFund) {
                actions.push({
                    id: 'fund-emergency',
                    title: 'Aportar a Emergencia',
                    description: `Separa el 10% de tus ingresos ($${(income * 0.1).toFixed(0)}) para imprevistos.`,
                    type: 'saving',
                    priority: 2,
                    isCompleted: false
                });
            }
            actions.push({
                id: 'pay-full',
                title: 'Pagar Total Tarjeta',
                description: 'Tienes capacidad para cubrir el total y evitar intereses.',
                type: 'payment',
                priority: 1,
                isCompleted: false
            });
        }

        if (profile === 'accelerated') {
            actions.push({
                id: 'invest-surplus',
                title: 'Invertir Excedente',
                description: `Tienes un superávit de $${capitalAvailable.toFixed(0)}. Considera moverlo a una cuenta remunerada.`,
                type: 'investment',
                priority: 1,
                isCompleted: false
            });
            actions.push({
                id: 'boost-goal',
                title: 'Acelerar Meta',
                description: '¿Por qué no adelantas una cuota de tu meta principal?',
                type: 'saving',
                priority: 2,
                isCompleted: false
            });
        }

        // Sort by priority
        actions.sort((a, b) => a.priority - b.priority);

        const priorityOneActions = actions.filter((action) => action.priority === 1);
        const lowerPriorityActions = actions
            .filter((action) => action.priority !== 1)
            .sort((a, b) => a.priority - b.priority);

        const weeklyActions = [...priorityOneActions, ...lowerPriorityActions].slice(0, 5);

        return {
            profile,
            riskLevel,
            capitalAvailable,
            weeklyActions,
            monthlyOutlook: outlook
        };
    };

    return {
        insight: calculateFinancialProfile(),
        isLoading: isLoadingSpaces || !activeSpaceId || isLoadingTransactions || isLoadingGoals || isLoadingObligations
    };
}
