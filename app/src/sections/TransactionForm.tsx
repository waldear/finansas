import { useState, useEffect } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, MinusCircle } from 'lucide-react';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/types/finance';
import type { TransactionType, Category } from '@/types/finance';

interface TransactionFormProps {
  onAddTransaction: (transaction: {
    type: TransactionType;
    amount: number;
    description: string;
    category: string;
    date: string;
  }) => void;
  customCategories?: Category[];
}

export function TransactionForm({ onAddTransaction, customCategories = [] }: TransactionFormProps) {
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Reset category when tab changes
  useEffect(() => {
    setCategory('');
  }, [activeTab]);

  /* 
   * DEBUG MODE: Logic changed to catch mobile errors
   */
  const handleManualSubmit = (e: React.MouseEvent | React.TouchEvent) => {
    // Stop any form events
    e.preventDefault();
    e.stopPropagation();

    // 1. debug alert
    // alert('Procesando click...'); 

    if (!amount || !description || !category) {
      alert('Error: Faltan completar campos.\n\nAsegurate de tener:\n- Monto\n- Descripción\n- Categoría');
      return;
    }

    try {
      onAddTransaction({
        type: activeTab,
        amount: parseFloat(amount),
        description,
        category,
        date,
      });

      // Reset form
      setAmount('');
      setDescription('');
      setCategory('');

      // Force feedback
      alert('¡Listo! Agregado correctamente.');
    } catch (err) {
      alert('Error interno: ' + err);
    }
  };

  const defaultCategories = activeTab === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const userCustomCategories = customCategories.filter(c => c.type === activeTab);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agregar Transacción</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TransactionType)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="expense" className="flex items-center gap-2">
              <MinusCircle className="h-4 w-4" />
              Gasto
            </TabsTrigger>
            <TabsTrigger value="income" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              Ingreso
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab}>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Monto</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Fecha</Label>
                  <Input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">Categoría</Label>
                <Select value={category} onValueChange={setCategory} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {defaultCategories.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Predeterminadas
                        </div>
                        {defaultCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              {cat.name}
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {userCustomCategories.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-1 border-t">
                          Mis Categorías
                        </div>
                        {userCustomCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              {cat.name}
                            </div>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  type="text"
                  placeholder="Ej: Compra supermercado"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <Button
                type="button"
                className="w-full relative z-50"
                variant={activeTab === 'expense' ? 'destructive' : 'default'}
                onClick={(e) => {
                  e.preventDefault();
                  handleManualSubmit(e);
                }}
                onTouchEnd={(e) => {
                  // Mobile-first: Use touchend instead of touchstart
                  // to avoid accidental triggers and prevent click event
                  e.preventDefault();
                  e.stopPropagation();
                  handleManualSubmit(e);
                }}
              >
                {activeTab === 'expense' ? (
                  <>
                    <MinusCircle className="h-4 w-4 mr-2" />
                    Agregar Gasto
                  </>
                ) : (
                  <>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Agregar Ingreso
                  </>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
