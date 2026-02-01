import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Lightbulb, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, PiggyBank } from 'lucide-react';
import type { BudgetRecommendation, FinancialSummary } from '@/types/finance';

interface RecommendationsProps {
  recommendations: BudgetRecommendation[];
  summary: FinancialSummary;
}

export function Recommendations({ recommendations, summary }: RecommendationsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  // General financial tips
  const generalTips = [
    {
      icon: PiggyBank,
      title: 'Regla 50/30/20',
      description: 'Destina el 50% a necesidades, 30% a deseos y 20% a ahorros y deudas.',
      color: 'text-blue-500',
    },
    {
      icon: TrendingDown,
      title: 'Prioriza Deudas',
      description: 'Paga primero las deudas con mayor tasa de interés.',
      color: 'text-red-500',
    },
    {
      icon: TrendingUp,
      title: 'Fondo de Emergencia',
      description: 'Ahorra al menos 3-6 meses de gastos para imprevistos.',
      color: 'text-green-500',
    },
    {
      icon: CheckCircle2,
      title: 'Paga a Tiempo',
      description: 'Evita cargos por mora manteniendo tus pagos al día.',
      color: 'text-purple-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Personalized Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            Recomendaciones Personalizadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <div>
                <p className="font-medium text-green-800">¡Excelente trabajo!</p>
                <p className="text-sm text-green-700">
                  Tus finanzas están en buen estado. Sigue manteniendo este equilibrio.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      <h3 className="font-semibold">{rec.category}</h3>
                    </div>
                    <Badge variant={rec.percentage > 100 ? 'destructive' : 'secondary'}>
                      {rec.percentage.toFixed(1)}%
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">{rec.message}</p>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Actual: {formatCurrency(rec.currentAmount)}</span>
                      <span>Recomendado: {formatCurrency(rec.recommendedAmount)}</span>
                    </div>
                    <Progress 
                      value={Math.min((rec.currentAmount / rec.recommendedAmount) * 100, 100)} 
                      className="h-2"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Financial Health Score */}
      <Card>
        <CardHeader>
          <CardTitle>Salud Financiera</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Tasa de Ahorro</p>
              <div className={`text-3xl font-bold ${summary.savingsRate >= 20 ? 'text-green-500' : summary.savingsRate >= 10 ? 'text-yellow-500' : 'text-red-500'}`}>
                {summary.savingsRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Meta: 20%+
              </p>
            </div>
            
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Deuda/Ingreso</p>
              <div className={`text-3xl font-bold ${summary.debtToIncomeRatio <= 20 ? 'text-green-500' : summary.debtToIncomeRatio <= 35 ? 'text-yellow-500' : 'text-red-500'}`}>
                {summary.debtToIncomeRatio.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Ideal: &lt;20%
              </p>
            </div>
            
            <div className="text-center p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-2">Balance</p>
              <div className={`text-3xl font-bold ${summary.balance >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {summary.balance >= 0 ? '+' : '-'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(Math.abs(summary.balance))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* General Tips */}
      <Card>
        <CardHeader>
          <CardTitle>Consejos Financieros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {generalTips.map((tip, index) => (
              <div key={index} className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                <tip.icon className={`h-6 w-6 ${tip.color} flex-shrink-0`} />
                <div>
                  <h4 className="font-medium">{tip.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{tip.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
