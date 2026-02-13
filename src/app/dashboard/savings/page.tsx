'use client';

export const dynamic = 'force-dynamic';

import React, { FormEvent, useState } from 'react';
import { SavingsGoal, SavingsGoalInput } from '@/lib/schemas';
import { useFinance } from '@/hooks/use-finance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SavingsForm } from '@/components/finance/savings-form';
import { Loader2, PiggyBank, Calendar, Pencil, Trash2, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const GoalIcon = ({ style, children, className }: any) => React.createElement('div', { style, className }, children);
const GoalBadge = ({ style, children, className }: any) => React.createElement('p', { style, className }, children);

const emptyGoalInput: SavingsGoalInput = {
    name: '',
    target_amount: 0,
    current_amount: 0,
    deadline: null,
    category: 'Ahorro',
    color: '#3b82f6',
    icon: 'piggy-bank',
    is_completed: false,
};

function toGoalInput(goal: SavingsGoal): SavingsGoalInput {
    return {
        name: String(goal.name || ''),
        target_amount: Number(goal.target_amount || 0),
        current_amount: Number(goal.current_amount || 0),
        deadline: goal.deadline ? String(goal.deadline) : null,
        category: String(goal.category || 'Ahorro'),
        color: String(goal.color || '#3b82f6'),
        icon: String(goal.icon || 'piggy-bank'),
        is_completed: Boolean(goal.is_completed),
    };
}

export default function SavingsPage() {
    const {
        savingsGoals,
        isLoadingGoals,
        goalsError,
        updateGoal,
        deleteGoal,
        isUpdatingGoal,
        isDeletingGoal,
    } = useFinance();

    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
    const [targetGoalId, setTargetGoalId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<SavingsGoalInput>(emptyGoalInput);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: 'ARS',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const startEditing = (goal: SavingsGoal) => {
        if (!goal.id) {
            toast.error('No se puede editar esta meta');
            return;
        }
        setEditingGoalId(goal.id);
        setEditForm(toGoalInput(goal));
    };

    const cancelEditing = () => {
        setEditingGoalId(null);
        setEditForm(emptyGoalInput);
    };

    const handleSaveEdit = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingGoalId) return;

        try {
            setTargetGoalId(editingGoalId);
            await updateGoal({
                goalId: editingGoalId,
                changes: editForm,
            });
            cancelEditing();
        } catch {
            // toast handled in hook
        } finally {
            setTargetGoalId(null);
        }
    };

    const handleDelete = async (goalId: string) => {
        const approved = window.confirm('¿Seguro que quieres eliminar esta meta de ahorro?');
        if (!approved) return;

        try {
            setTargetGoalId(goalId);
            await deleteGoal(goalId);
            if (editingGoalId === goalId) {
                cancelEditing();
            }
        } catch {
            // toast handled in hook
        } finally {
            setTargetGoalId(null);
        }
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
                                    const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
                                    const iconStyle = { backgroundColor: `${goal.color}20`, color: goal.color };
                                    const percentStyle = { color: goal.color };
                                    const progressStyle = { '--progress-foreground': goal.color } as React.CSSProperties;
                                    const isEditing = editingGoalId === goal.id;
                                    const isTargeting = targetGoalId === goal.id;
                                    const isMutating = isTargeting && (isUpdatingGoal || isDeletingGoal);

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

                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => startEditing(goal)}
                                                    disabled={!goal.id || isMutating}
                                                >
                                                    <Pencil className="w-4 h-4 mr-2" />
                                                    Editar
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive"
                                                    onClick={() => goal.id && handleDelete(goal.id)}
                                                    disabled={!goal.id || isMutating}
                                                >
                                                    {isMutating && isDeletingGoal ? (
                                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4 mr-2" />
                                                    )}
                                                    Eliminar
                                                </Button>
                                            </div>

                                            {isEditing && (
                                                <form onSubmit={handleSaveEdit} className="grid gap-3 border-t pt-4 md:grid-cols-2">
                                                    <Input
                                                        value={editForm.name}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                                        placeholder="Nombre"
                                                        required
                                                    />
                                                    <Input
                                                        value={editForm.category}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, category: event.target.value }))}
                                                        placeholder="Categoría"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0.01"
                                                        value={editForm.target_amount}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, target_amount: Number(event.target.value) || 0 }))}
                                                        placeholder="Monto objetivo"
                                                        required
                                                    />
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={editForm.current_amount}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, current_amount: Number(event.target.value) || 0 }))}
                                                        placeholder="Monto actual"
                                                        required
                                                    />
                                                    <Input
                                                        type="date"
                                                        value={editForm.deadline || ''}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, deadline: event.target.value || null }))}
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <Input
                                                            type="color"
                                                            value={editForm.color}
                                                            onChange={(event) => setEditForm((prev) => ({ ...prev, color: event.target.value }))}
                                                            className="h-10 w-16"
                                                        />
                                                        <Input
                                                            value={editForm.icon}
                                                            onChange={(event) => setEditForm((prev) => ({ ...prev, icon: event.target.value }))}
                                                            placeholder="Icono"
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2 flex gap-2">
                                                        <Button type="submit" size="sm" disabled={isMutating}>
                                                            {isMutating && isUpdatingGoal ? (
                                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                            ) : (
                                                                <Save className="w-4 h-4 mr-2" />
                                                            )}
                                                            Guardar cambios
                                                        </Button>
                                                        <Button type="button" size="sm" variant="outline" onClick={cancelEditing} disabled={isMutating}>
                                                            <X className="w-4 h-4 mr-2" />
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                </form>
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
            {goalsError && <p className="text-sm text-destructive">Error de metas: {goalsError}</p>}
        </div>
    );
}
