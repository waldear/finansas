import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  FileJson, 
  FileSpreadsheet, 
  Calendar,
  Filter,
  CheckCircle2
} from 'lucide-react';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import type { Transaction, Debt } from '@/types/finance';
import * as XLSX from 'xlsx';

interface DataExportProps {
  transactions: Transaction[];
  debts: Debt[];
}

export function DataExport({ transactions, debts }: DataExportProps) {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  // Obtener meses y años disponibles
  const getAvailableMonths = () => {
    const months = new Set<string>();
    transactions.forEach(t => {
      const date = new Date(t.date);
      months.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    });
    return Array.from(months).sort().reverse();
  };

  const getAvailableYears = () => {
    const years = new Set<string>();
    transactions.forEach(t => {
      years.add(new Date(t.date).getFullYear().toString());
    });
    return Array.from(years).sort().reverse();
  };

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Filtrar transacciones
  const getFilteredTransactions = () => {
    return transactions.filter(t => {
      const date = new Date(t.date);
      const monthMatch = selectedMonth === 'all' || 
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` === selectedMonth;
      const yearMatch = selectedYear === 'all' || 
        date.getFullYear().toString() === selectedYear;
      return monthMatch && yearMatch;
    });
  };

  // Exportar a JSON
  const exportToJSON = () => {
    setIsExporting(true);
    try {
      const filtered = getFilteredTransactions();
      const data = {
        exportDate: new Date().toISOString(),
        filters: { month: selectedMonth, year: selectedYear },
        summary: {
          totalTransactions: filtered.length,
          totalIncome: filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
          totalExpenses: filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
          totalDebts: debts.length,
        },
        transactions: filtered,
        debts: debts,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `finanzas_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exportados ${filtered.length} registros a JSON`);
    } catch (error) {
      toast.error('Error al exportar JSON');
    } finally {
      setIsExporting(false);
    }
  };

  // Exportar a Excel
  const exportToExcel = () => {
    setIsExporting(true);
    try {
      const filtered = getFilteredTransactions();
      
      // Hoja de transacciones
      const transactionsData = filtered.map(t => ({
        Fecha: new Date(t.date).toLocaleDateString('es-AR'),
        Tipo: t.type === 'income' ? 'Ingreso' : 'Gasto',
        Categoría: t.category,
        Descripción: t.description,
        Monto: t.amount,
        'Monto Formateado': new Intl.NumberFormat('es-AR', {
          style: 'currency',
          currency: 'ARS',
          minimumFractionDigits: 0,
        }).format(t.amount),
      }));

      // Hoja de resumen
      const summaryData = [{
        'Total Transacciones': filtered.length,
        'Total Ingresos': filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0),
        'Total Gastos': filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        'Balance': filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) - 
                   filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0),
        'Total Deudas': debts.length,
        'Pago Mensual Deudas': debts.reduce((sum, d) => sum + d.monthlyPayment, 0),
      }];

      // Hoja de deudas
      const debtsData = debts.map(d => ({
        Nombre: d.name,
        'Monto Total': d.totalAmount,
        'Pago Mensual': d.monthlyPayment,
        'Cuotas Restantes': d.remainingInstallments,
        'Próximo Vencimiento': new Date(d.nextPaymentDate).toLocaleDateString('es-AR'),
        Categoría: d.category,
      }));

      const wb = XLSX.utils.book_new();
      
      const wsTransactions = XLSX.utils.json_to_sheet(transactionsData);
      XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transacciones');
      
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');
      
      const wsDebts = XLSX.utils.json_to_sheet(debtsData);
      XLSX.utils.book_append_sheet(wb, wsDebts, 'Deudas');

      XLSX.writeFile(wb, `finanzas_reporte_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast.success(`Exportados ${filtered.length} registros a Excel`);
    } catch (error) {
      console.error(error);
      toast.error('Error al exportar Excel');
    } finally {
      setIsExporting(false);
    }
  };

  // Exportar a CSV
  const exportToCSV = () => {
    setIsExporting(true);
    try {
      const filtered = getFilteredTransactions();
      
      const headers = ['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
      const rows = filtered.map(t => [
        new Date(t.date).toLocaleDateString('es-AR'),
        t.type === 'income' ? 'Ingreso' : 'Gasto',
        t.category,
        `"${t.description}"`,
        t.amount,
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(',')),
      ].join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `finanzas_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exportados ${filtered.length} registros a CSV`);
    } catch (error) {
      toast.error('Error al exportar CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const filteredCount = getFilteredTransactions().length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Exportar Datos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Mes
              </label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los meses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los meses</SelectItem>
                  {getAvailableMonths().map(month => {
                    const [year, monthNum] = month.split('-');
                    return (
                      <SelectItem key={month} value={month}>
                        {monthNames[parseInt(monthNum) - 1]} {year}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Año
              </label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los años" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los años</SelectItem>
                  {getAvailableYears().map(year => (
                    <SelectItem key={year} value={year}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resumen de selección */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm">
                <strong>{filteredCount}</strong> transacciones seleccionadas
              </span>
            </div>
            {(selectedMonth !== 'all' || selectedYear !== 'all') && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => {
                setSelectedMonth('all');
                setSelectedYear('all');
              }}>
                Limpiar filtros
              </Badge>
            )}
          </div>

          {/* Botones de exportación */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={exportToJSON}
              disabled={isExporting || filteredCount === 0}
              variant="outline"
              className="w-full"
            >
              <FileJson className="h-4 w-4 mr-2" />
              Exportar JSON
            </Button>
            
            <Button
              onClick={exportToCSV}
              disabled={isExporting || filteredCount === 0}
              variant="outline"
              className="w-full"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar CSV
            </Button>
            
            <Button
              onClick={exportToExcel}
              disabled={isExporting || filteredCount === 0}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Exportar Excel
            </Button>
          </div>

          {/* Info */}
          <p className="text-xs text-muted-foreground text-center">
            Los archivos se descargan directamente a tu dispositivo. 
            JSON incluye todos los datos para backup. Excel incluye múltiples hojas.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
