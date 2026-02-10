
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase-browser';
import { useFinance } from './use-finance';
import { useTransactions } from './use-transactions';

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

export function useCopilot() {
    const supabase = createClient();
    const { debts, savingsGoals, isLoadingGoals } = useFinance();
    const { transactions, isLoading: isLoadingTransactions } = useTransactions();

    const { data: obligations, isLoading: isLoadingObligations } = useQuery({
        queryKey: ['obligations'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('obligations')
                .select('*')
                .eq('status', 'pending');

            if (error) throw error;
            return data;
        },
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
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let income = 0;
        let expenses = 0;

        transactions.forEach(t => {
            if (t.type === 'income') income += t.amount;
            if (t.type === 'expense') expenses += t.amount;
        });

        const totalObligations = (obligations || []).reduce((acc, curr) => acc + curr.amount, 0);
        const monthlyDebtPayments = debts.reduce((acc, curr) => acc + curr.monthly_payment, 0);

        // Simple "Capital Available" metric
        // Income - (Expenses so far + Pending Obligations + Fixed Debt Payments)
        // Note: Ideally we'd project future income, but for MVP we use total income received this month vs total expected outflow.
        // If it's early in the month, income might be low. We should probably use average income or just current balance if we had it.
        // For MVP: Let's assume 'income' is "what has come in this month".

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

        // Urgent: Overdue or near-due obligations
        (obligations || []).forEach(obs => {
            const daysUntilDue = Math.ceil((new Date(obs.due_date).getTime() - now.getTime()) / (1000 * 3600 * 24));

            if (daysUntilDue <= 3) {
                actions.push({
                    id: `pay-${obs.id}`,
                    title: `Pagar ${obs.title}`,
                    description: `Vence el ${new Date(obs.due_date).toLocaleDateString()}, monto $${obs.amount}`,
                    type: 'payment',
                    priority: 1,
                    isCompleted: false
                });
            }
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

        return {
            profile,
            riskLevel,
            capitalAvailable,
            weeklyActions: actions.slice(0, 3), // Limit to top 3 actions
            monthlyOutlook: outlook
        };
    };

    return {
        insight: calculateFinancialProfile(),
        isLoading: isLoadingTransactions || isLoadingGoals || isLoadingObligations
    };
}
