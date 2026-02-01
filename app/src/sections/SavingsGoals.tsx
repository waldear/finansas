import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Progress } from '@/components/ui/progress';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Trash2, 
  Target,
  TrendingUp,
  Shield,
  Plane,
  Home,
  Car,
  BookOpen,
  CheckCircle2,
  PiggyBank,
  Wallet,
  MoreHorizontal
} from 'lucide-react';
import type { SavingsGoal } from '@/types/finance';
import { SAVINGS_GOAL_TYPES } from '@/types/finance';
import { toast } from 'sonner';

interface SavingsGoalsProps {
  goals: SavingsGoal[];
  availableBalance: number;
  onAddGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => void;
  onDeleteGoal: (id: string) => void;
  onContribute: (goalId: string, amount: number) => void;
}

const GOAL_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Shield,
  Plane,
  Home,
  Car,
  BookOpen,
  TrendingUp,
  Target,
  MoreHorizontal,
};

export function SavingsGoals({ 
  goals, 
  availableBalance,
  onAddGoal, 
  onDeleteGoal,
  onContribute
}: SavingsGoalsProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isContributeDialogOpen, setIsContributeDialogOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');
  
  const [newGoal, setNewGoal] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '',
    deadline: '',
    category: 'other' as const,
  });

  const sortedGoals = [...goals].sort((a, b) => {
    // Sort by completion status first, then by progress
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    const progressA = a.targetAmount > 0 ? (a.currentAmount / a.targetAmount) : 0;
    const progressB = b.targetAmount > 0 ? (b.currentAmount / b.targetAmount) : 0;
    return progressB - progressA;
  });

  const totalSaved = goals.reduce((sum, g) => sum + g.currentAmount, 0);
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const completedGoals = goals.filter(g => g.isCompleted || g.currentAmount >= g.targetAmount).length;

  const handleAddGoal = () => {
    if (!newGoal.name.trim() || !newGoal.targetAmount) {
      toast.error('Nombre y monto objetivo son obligatorios');
      return;
    }

    const targetAmount = parseFloat(newGoal.targetAmount);
    const currentAmount = newGoal.currentAmount ? parseFloat(newGoal.currentAmount) : 0;

    if (targetAmount <= 0) {
      toast.error('El monto objetivo debe ser mayor a 0');
      return;
    }

    const goalType = SAVINGS_GOAL_TYPES.find(t => t.id === newGoal.category);

    onAddGoal({
      name: newGoal.name.trim(),
      targetAmount,
      currentAmount,
      deadline: newGoal.deadline || undefined,
      category: newGoal.category,
      color: goalType?.color || '#6b7280',
      icon: goalType?.icon || 'Target',
      isCompleted: false,
    });

    toast.success('Meta de ahorro creada');
    setNewGoal({
      name: '',
      targetAmount: '',
      currentAmount: '',
      deadline: '',
      category: 'other',
    });
    setIsAddDialogOpen(false);
  };

  const handleContribute = () => {
    if (!selectedGoal || !contributionAmount) return;

    const amount = parseFloat(contributionAmount);
    if (amount <= 0) {
      toast.error('El monto debe ser mayor a 0');
      return;
    }

    if (amount > availableBalance) {
      toast.error('No tienes suficiente balance disponible');
      return;
    }

    onContribute(selectedGoal.id, amount);
    toast.success(`Aportaste ${formatCurrency(amount)} a "${selectedGoal.name}"`);
    setContributionAmount('');
    setIsContributeDialogOpen(false);
    setSelectedGoal(null);
  };

  const handleDeleteGoal = (goal: SavingsGoal) => {
    if (confirm(`¿Eliminar la meta "${goal.name}"? El dinero ahorrado volverá a tu balance.`)) {
      onDeleteGoal(goal.id);
      toast.success('Meta eliminada');
    }
  };

  const openContributeDialog = (goal: SavingsGoal) => {
    setSelectedGoal(goal);
    setContributionAmount('');
    setIsContributeDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getDaysUntilDeadline = (deadline?: string) => {
    if (!deadline) return null;
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const GoalCard = ({ goal }: { goal: SavingsGoal }) => {
    const progress = goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
    const isCompleted = goal.isCompleted || goal.currentAmount >= goal.targetAmount;
    const IconComponent = GOAL_ICONS[goal.icon] || Target;
    const daysLeft = getDaysUntilDeadline(goal.deadline);

    return (
      <Card className={`relative overflow-hidden ${isCompleted ? 'border-green-500/50' : ''}`}>
        {isCompleted && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
        )}
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${goal.color}20` }}
            >
              <IconComponent className="h-6 w-6" style={{ color: goal.color }} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-semibold truncate">{goal.name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {SAVINGS_GOAL_TYPES.find(t => t.id === goal.category)?.name || 'Meta'}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progreso</span>
                  <span className="font-medium">{progress.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(progress, 100)} className="h-2" />
                
                <div className="flex justify-between text-sm">
                  <span className="text-green-600 font-medium">
                    {formatCurrency(goal.currentAmount)}
                  </span>
                  <span className="text-muted-foreground">
                    de {formatCurrency(goal.targetAmount)}
                  </span>
                </div>

                {daysLeft !== null && (
                  <p className={`text-xs ${daysLeft < 30 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {daysLeft > 0 ? `${daysLeft} días restantes` : daysLeft === 0 ? 'Vence hoy' : `Venció hace ${Math.abs(daysLeft)} días`}
                  </p>
                )}
              </div>

              {!isCompleted && (
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="flex-1"
                    onClick={() => openContributeDialog(goal)}
                    disabled={availableBalance <= 0}
                  >
                    <PiggyBank className="h-4 w-4 mr-1" />
                    Aportar
                  </Button>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => handleDeleteGoal(goal)}
                    className="text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-pink-500" />
              <span className="text-sm text-muted-foreground">Total Ahorrado</span>
            </div>
            <p className="text-2xl font-bold text-pink-600">{formatCurrency(totalSaved)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-500" />
              <span className="text-sm text-muted-foreground">Meta Total</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalTarget)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-500" />
              <span className="text-sm text-muted-foreground">Balance Disponible</span>
            </div>
            <p className={`text-2xl font-bold ${availableBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(availableBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" />
            Mis Metas de Ahorro
          </h3>
          <p className="text-sm text-muted-foreground">
            {completedGoals} de {goals.length} metas completadas
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Meta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Crear Meta de Ahorro</DialogTitle>
              <DialogDescription>
                Define una meta para mantener el motivo en tu ahorro
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="goal-name">Nombre de la meta</Label>
                <Input
                  id="goal-name"
                  placeholder="Ej: Viaje a Europa, Auto nuevo..."
                  value={newGoal.name}
                  onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="target-amount">Monto objetivo</Label>
                  <Input
                    id="target-amount"
                    type="number"
                    placeholder="0.00"
                    value={newGoal.targetAmount}
                    onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="current-amount">Monto inicial (opcional)</Label>
                  <Input
                    id="current-amount"
                    type="number"
                    placeholder="0.00"
                    value={newGoal.currentAmount}
                    onChange={(e) => setNewGoal({ ...newGoal, currentAmount: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Fecha límite (opcional)</Label>
                <Input
                  id="deadline"
                  type="date"
                  value={newGoal.deadline}
                  onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de meta</Label>
                <Select 
                  value={newGoal.category} 
                  onValueChange={(v) => setNewGoal({ ...newGoal, category: v as typeof newGoal.category })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SAVINGS_GOAL_TYPES.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: type.color }}
                          />
                          {type.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddGoal}>
                Crear Meta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Goals Grid */}
      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No tienes metas de ahorro</h3>
            <p className="text-muted-foreground mb-4">
              Crea tu primera meta para empezar a ahorrar con propósito
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear Primera Meta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedGoals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      {/* Contribute Dialog */}
      <Dialog open={isContributeDialogOpen} onOpenChange={setIsContributeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aportar a "{selectedGoal?.name}"</DialogTitle>
            <DialogDescription>
              Tu balance disponible: {formatCurrency(availableBalance)}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="contribution">Monto a aportar</Label>
              <Input
                id="contribution"
                type="number"
                placeholder="0.00"
                value={contributionAmount}
                onChange={(e) => setContributionAmount(e.target.value)}
                autoFocus
              />
            </div>
            
            {selectedGoal && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p>Progreso actual: {((selectedGoal.currentAmount / selectedGoal.targetAmount) * 100).toFixed(1)}%</p>
                <p>Faltan: {formatCurrency(selectedGoal.targetAmount - selectedGoal.currentAmount)}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsContributeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleContribute}
              disabled={!contributionAmount || parseFloat(contributionAmount) <= 0 || parseFloat(contributionAmount) > availableBalance}
            >
              <PiggyBank className="h-4 w-4 mr-2" />
              Confirmar Aporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
