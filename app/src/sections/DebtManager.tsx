import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, CreditCard, CheckCircle2, Trash2, Calendar, Sparkles } from 'lucide-react';
import type { Debt } from '@/types/finance';
import { DEBT_CATEGORIES, ARGENTINA_CARDS, PAYMENT_PLANS } from '@/types/finance';

interface DebtManagerProps {
  debts: Debt[];
  onAddDebt: (debt: Omit<Debt, 'id' | 'createdAt'>) => void;
  onDeleteDebt: (id: string) => void;
  onUpdatePayment: (debtId: string) => void;
}

export function DebtManager({ debts, onAddDebt, onDeleteDebt, onUpdatePayment }: DebtManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState('');
  const [remainingInstallments, setRemainingInstallments] = useState('');
  const [totalInstallments, setTotalInstallments] = useState('');
  const [category, setCategory] = useState<'credit_card' | 'loan' | 'other'>('credit_card');
  const [nextPaymentDate, setNextPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [cardType, setCardType] = useState<Debt['cardType']>('other');
  const [paymentPlan, setPaymentPlan] = useState<Debt['paymentPlan']>('full');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // Auto-calculate monthly payment based on payment plan
  const calculateMonthlyPayment = (total: number, plan: string) => {
    const planInfo = PAYMENT_PLANS.naranja.find(p => p.id === plan) || 
                     PAYMENT_PLANS.other.find(p => p.id === plan);
    if (planInfo) {
      return Math.round(total / planInfo.installments);
    }
    return total;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const calculatedMonthlyPayment = paymentPlan && paymentPlan !== 'full' && paymentPlan !== 'minimum'
      ? calculateMonthlyPayment(parseFloat(totalAmount), paymentPlan)
      : parseFloat(monthlyPayment);

    const planInfo = PAYMENT_PLANS.naranja.find(p => p.id === paymentPlan) || 
                     PAYMENT_PLANS.other.find(p => p.id === paymentPlan);

    onAddDebt({
      name,
      totalAmount: parseFloat(totalAmount),
      monthlyPayment: calculatedMonthlyPayment,
      remainingInstallments: planInfo?.installments || parseInt(remainingInstallments) || 1,
      totalInstallments: planInfo?.installments || parseInt(totalInstallments) || 1,
      category,
      nextPaymentDate,
      cardType,
      paymentPlan,
      hasInterest: planInfo?.hasInterest || false,
    });

    // Reset form
    setName('');
    setTotalAmount('');
    setMonthlyPayment('');
    setRemainingInstallments('');
    setTotalInstallments('');
    setCategory('credit_card');
    setCardType('other');
    setPaymentPlan('full');
    setNextPaymentDate(new Date().toISOString().split('T')[0]);
    setIsDialogOpen(false);
  };

  const getCardInfo = (cardId?: string) => {
    return ARGENTINA_CARDS.find(c => c.id === cardId);
  };

  const getPaymentPlanLabel = (planId?: string) => {
    const allPlans = [...PAYMENT_PLANS.naranja, ...PAYMENT_PLANS.other];
    return allPlans.find(p => p.id === planId)?.name || planId;
  };

  const handlePayment = (debtId: string) => {
    onUpdatePayment(debtId);
  };

  // Get available payment plans based on card type
  const getAvailablePaymentPlans = (cardType?: string) => {
    if (cardType === 'naranja') {
      return PAYMENT_PLANS.naranja;
    }
    return PAYMENT_PLANS.other;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Mis Deudas y Cuotas
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Deuda
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nueva Deuda o Cuota</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre/Descripción</Label>
                  <Input
                    id="name"
                    placeholder="Ej: Tarjeta Naranja"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="totalAmount">Monto Total</Label>
                    <Input
                      id="totalAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="monthlyPayment">Cuota Mensual</Label>
                    <Input
                      id="monthlyPayment"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={monthlyPayment}
                      onChange={(e) => setMonthlyPayment(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="remainingInstallments">Cuotas Restantes</Label>
                    <Input
                      id="remainingInstallments"
                      type="number"
                      min="0"
                      placeholder="0"
                      value={remainingInstallments}
                      onChange={(e) => setRemainingInstallments(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="totalInstallments">Cuotas Totales</Label>
                    <Input
                      id="totalInstallments"
                      type="number"
                      min="1"
                      placeholder="0"
                      value={totalInstallments}
                      onChange={(e) => setTotalInstallments(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardType">Tarjeta</Label>
                  <Select value={cardType} onValueChange={(v) => setCardType(v as Debt['cardType'])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona la tarjeta" />
                    </SelectTrigger>
                    <SelectContent>
                      {ARGENTINA_CARDS.map((card) => (
                        <SelectItem key={card.id} value={card.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: card.color }}
                            />
                            {card.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentPlan">Plan de Pago</Label>
                  <Select value={paymentPlan} onValueChange={(v) => setPaymentPlan(v as Debt['paymentPlan'])}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona el plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailablePaymentPlans(cardType).map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          <div className="flex items-center gap-2">
                            <span>{plan.name}</span>
                            {plan.hasInterest && (
                              <Badge variant="destructive" className="text-xs">Con interés</Badge>
                            )}
                            {!plan.hasInterest && (
                              <Badge variant="default" className="text-xs bg-green-500">Sin interés</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cardType === 'naranja' && paymentPlan === 'z3' && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      ¡Excelente elección! Plan Z 3 sin interés
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Tipo</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEBT_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nextPaymentDate">Próximo Vencimiento</Label>
                  <Input
                    id="nextPaymentDate"
                    type="date"
                    value={nextPaymentDate}
                    onChange={(e) => setNextPaymentDate(e.target.value)}
                    required
                  />
                </div>

                <Button type="submit" className="w-full">
                  Guardar Deuda
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {debts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tienes deudas registradas
            </div>
          ) : (
            <div className="space-y-4">
              {debts.map((debt) => {
                const cardInfo = getCardInfo(debt.cardType);
                const progress = ((debt.totalInstallments - debt.remainingInstallments) / debt.totalInstallments) * 100;
                const remainingAmount = debt.monthlyPayment * debt.remainingInstallments;

                return (
                  <div key={debt.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{debt.name}</h3>
                          {cardInfo && (
                            <Badge 
                              variant="outline"
                              style={{ borderColor: cardInfo.color, color: cardInfo.color }}
                            >
                              {cardInfo.name}
                            </Badge>
                          )}
                          {debt.paymentPlan && (
                            <Badge variant="secondary" className="text-xs">
                              {getPaymentPlanLabel(debt.paymentPlan)}
                            </Badge>
                          )}
                          {debt.hasInterest !== undefined && (
                            <Badge 
                              variant={debt.hasInterest ? 'destructive' : 'default'}
                              className={`text-xs ${!debt.hasInterest ? 'bg-green-500' : ''}`}
                            >
                              {debt.hasInterest ? 'Con interés' : 'Sin interés'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Cuota mensual: <span className="font-medium text-red-600">{formatCurrency(debt.monthlyPayment)}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Restante</p>
                        <p className="font-semibold">{formatCurrency(remainingAmount)}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>Progreso de pago</span>
                        <span>{debt.totalInstallments - debt.remainingInstallments} / {debt.totalInstallments} cuotas</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        Próximo pago: {new Date(debt.nextPaymentDate).toLocaleDateString('es-AR')}
                      </div>
                      <div className="flex gap-2">
                        {debt.remainingInstallments > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePayment(debt.id)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Pagar Cuota
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteDebt(debt.id)}
                          className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Card */}
      {debts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen de Deudas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total en Deudas</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(debts.reduce((sum, d) => sum + d.totalAmount, 0))}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Pago Mensual Total</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(debts.reduce((sum, d) => sum + d.monthlyPayment, 0))}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Cuotas Restantes</p>
                <p className="text-2xl font-bold">
                  {debts.reduce((sum, d) => sum + d.remainingInstallments, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
