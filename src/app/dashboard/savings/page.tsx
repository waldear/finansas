'use client';

export const dynamic = 'force-dynamic';
import React from 'react';
import { useFinance } from '@/hooks/use-finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SavingsForm } from '@/components/finance/savings-form';
import { Loader2, PiggyBank, Target, Calendar } from 'lucide-react';

const GoalIcon = ({ style, children, className }: any) => React.createElement('div', { style, className }, children);
const GoalBadge = ({ style, children, className }: any) => React.createElement('p', { style, className }, children);

export default function SavingsPage() {
    const { savingsGoals, isLoadingGoals } = useFinance();

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Metas de Ahorro</h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <SavingsForm />

                <Card>
                    <CardHeader>
                        <CardTitle>Mis Objetivos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoadingGoals ? (
                            <div className="flex justify-center p-8">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : savingsGoals.length > 0 ? (
                            <div className="space-y-6">
                                {savingsGoals.map((goal) => {
                                    const progress = (goal.current_amount / goal.target_amount) * 100;
                                    const iconStyle = { backgroundColor: `${goal.color}20`, color: goal.color };
                                    const percentStyle = { color: goal.color };
                                    const progressStyle = { '--progress-foreground': goal.color } as React.CSSProperties;

                                    return (
                                        <div key={goal.id} className="p-4 border rounded-xl space-y-4 bg-card hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <GoalIcon className="p-2 rounded-full bg-primary/10 text-primary" style={iconStyle}>
                                                        <PiggyBank className="w-5 h-5" />
                                                    </GoalIcon>
                                                    <div>
                                                        <h3 className="font-bold text-lg leading-none">{goal.name}</h3>
                                                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{goal.category}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <GoalBadge className="font-bold text-lg" style={percentStyle}>{Math.round(progress)}%</GoalBadge>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span className="text-muted-foreground">Progreso</span>
                                                    <span className="font-medium">{formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}</span>
                                                </div>
                                                <Progress value={progress} className="h-3" style={progressStyle} />
                                            </div>

                                            {goal.deadline && (
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                                                    <Calendar className="w-3 h-3" />
                                                    <span>Fecha límite: {new Date(goal.deadline).toLocaleDateString('es-AR')}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground py-8">No has definido metas todavía.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
