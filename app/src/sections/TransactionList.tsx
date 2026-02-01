import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  Edit2, 
  Search,
  Calendar,
  Filter,
  X
} from 'lucide-react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Transaction, Category } from '@/types/finance';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/types/finance';
import { toast } from 'sonner';

interface TransactionListProps {
  transactions: Transaction[];
  onDeleteTransaction: (id: string) => void;
  onEditTransaction?: (transaction: Transaction) => void;
  customCategories?: Category[];
}

export function TransactionList({ 
  transactions, 
  onDeleteTransaction,
  onEditTransaction,
  customCategories = []
}: TransactionListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Transaction>>({});

  // Obtener meses disponibles
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    transactions.forEach(t => {
      const date = new Date(t.date);
      months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort().reverse();
  }, [transactions]);

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Filtrar transacciones
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter(t => {
        // Filtro por búsqueda
        const matchesSearch = 
          t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
          t.category.toLowerCase().includes(searchTerm.toLowerCase());
        
        // Filtro por tipo
        const matchesType = filterType === 'all' || t.type === filterType;
        
        // Filtro por mes
        const date = new Date(t.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const matchesMonth = filterMonth === 'all' || monthKey === filterMonth;
        
        return matchesSearch && matchesType && matchesMonth;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, searchTerm, filterType, filterMonth]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getCategoryInfo = (categoryId: string, type: string) => {
    const defaultCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const custom = customCategories.find(c => c.id === categoryId);
    return custom || defaultCategories.find(c => c.id === categoryId);
  };

  // Calcular totales filtrados
  const filteredIncome = filteredTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const filteredExpenses = filteredTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const startEditing = (transaction: Transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
      date: transaction.date,
    });
  };

  const saveEdit = () => {
    if (editingId && editForm && onEditTransaction) {
      const originalTransaction = transactions.find(t => t.id === editingId);
      if (originalTransaction) {
        onEditTransaction({
          ...originalTransaction,
          ...editForm,
          amount: Number(editForm.amount),
        } as Transaction);
        toast.success('Transacción actualizada');
      }
    }
    setEditingId(null);
    setEditForm({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const clearFilters = () => {
    setSearchTerm('');
    setFilterType('all');
    setFilterMonth('all');
  };

  const hasActiveFilters = searchTerm || filterType !== 'all' || filterMonth !== 'all';

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <span>Historial de Transacciones</span>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{filteredTransactions.length} / {transactions.length}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filtros */}
        <div className="space-y-3 mb-4">
          {/* Búsqueda */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descripción o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filtros adicionales */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="income">Ingresos</SelectItem>
                <SelectItem value="expense">Gastos</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger>
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Mes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los meses</SelectItem>
                {availableMonths.map(month => {
                  const [year, monthNum] = month.split('-');
                  return (
                    <SelectItem key={month} value={month}>
                      {monthNames[parseInt(monthNum) - 1]} {year}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="col-span-2 md:col-span-1">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          {/* Totales filtrados */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between p-2 bg-muted rounded text-sm">
              <span className="text-muted-foreground">Filtrado:</span>
              <div className="flex gap-4">
                <span className="text-green-600">+{formatCurrency(filteredIncome)}</span>
                <span className="text-red-600">-{formatCurrency(filteredExpenses)}</span>
                <span className={filteredIncome - filteredExpenses >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(filteredIncome - filteredExpenses)}
                </span>
              </div>
            </div>
          )}
        </div>

        <ScrollArea className="h-[350px]">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {hasActiveFilters ? 'No hay transacciones que coincidan con los filtros' : 'No hay transacciones registradas'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map((transaction) => {
                const categoryInfo = getCategoryInfo(transaction.category, transaction.type);
                const isIncome = transaction.type === 'income';
                const isEditing = editingId === transaction.id;

                if (isEditing) {
                  return (
                    <div key={transaction.id} className="p-3 rounded-lg border bg-muted/50 space-y-3">
                      <Input
                        value={editForm.description}
                        onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                        placeholder="Descripción"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          value={editForm.amount}
                          onChange={(e) => setEditForm({...editForm, amount: Number(e.target.value)})}
                          placeholder="Monto"
                        />
                        <Input
                          type="date"
                          value={editForm.date}
                          onChange={(e) => setEditForm({...editForm, date: e.target.value})}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit} className="flex-1">Guardar</Button>
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancelar</Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isIncome ? 'bg-green-100' : 'bg-red-100'
                        }`}
                      >
                        {isIncome ? (
                          <TrendingUp className="h-5 w-5 text-green-600" />
                        ) : (
                          <TrendingDown className="h-5 w-5 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{transaction.description}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span
                            className="inline-block w-2 h-2 rounded-full"
                            style={{ backgroundColor: categoryInfo?.color || '#6b7280' }}
                          />
                          {categoryInfo?.name || transaction.category}
                          <span>•</span>
                          <span>{new Date(transaction.date).toLocaleDateString('es-AR')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                        {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
                      </span>
                      <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                        {onEditTransaction && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(transaction)}
                            className="h-8 w-8 text-muted-foreground hover:text-blue-600"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDeleteTransaction(transaction.id)}
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
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
