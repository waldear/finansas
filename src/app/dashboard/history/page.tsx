'use client';

export const dynamic = 'force-dynamic';
import { useTransactions } from '@/hooks/use-transactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Search, FileDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function HistoryPage() {
    const { transactions, isLoading } = useTransactions();
    const [searchTerm, setSearchTerm] = useState('');
    const [isExportingCsv, setIsExportingCsv] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);

    const filteredTransactions = transactions.filter((t: any) =>
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalIncome = transactions
        .filter((t: any) => t.type === 'income')
        .reduce((acc: number, t: any) => acc + t.amount, 0);

    const totalExpense = transactions
        .filter((t: any) => t.type === 'expense')
        .reduce((acc: number, t: any) => acc + t.amount, 0);

    const balance = totalIncome - totalExpense;

    const exportCsv = () => {
        try {
            setIsExportingCsv(true);
            const headers = ['Fecha', 'Tipo', 'Categoria', 'Descripcion', 'Monto'];
            const rows = filteredTransactions.map((transaction: any) => ([
                transaction.date,
                transaction.type,
                transaction.category,
                transaction.description,
                String(transaction.amount),
            ]));

            const csvContent = [headers, ...rows]
                .map((row) => row.map((column) => `"${String(column).replaceAll('"', '""')}"`).join(','))
                .join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `finansas-historial-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            toast.success('CSV exportado correctamente');
        } catch (error) {
            toast.error('No pudimos exportar el CSV');
        } finally {
            setIsExportingCsv(false);
        }
    };

    const exportPdf = async () => {
        try {
            setIsExportingPdf(true);
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            const title = `Historial Finansas - ${new Date().toLocaleDateString('es-AR')}`;
            doc.setFontSize(14);
            doc.text(title, 10, 12);
            doc.setFontSize(10);

            let y = 22;
            filteredTransactions.forEach((transaction: any, index: number) => {
                const line = `${transaction.date} | ${transaction.type.toUpperCase()} | ${transaction.category} | ${transaction.description} | ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(transaction.amount)}`;
                if (y > 280) {
                    doc.addPage();
                    y = 12;
                }
                doc.text(line, 10, y);
                y += 6;
            });

            doc.save(`finansas-historial-${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success('PDF exportado correctamente');
        } catch (error) {
            toast.error('No pudimos exportar el PDF');
        } finally {
            setIsExportingPdf(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Historial Completo</h2>
                    <p className="text-muted-foreground">Revisa todas tus transacciones registradas.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-sm text-right hidden md:block">
                        <p className="text-muted-foreground">Balance Total</p>
                        <p className={`font-bold text-lg ${balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(balance)}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExportingCsv || isLoading}>
                            <FileDown className="h-4 w-4 mr-1" />
                            CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportPdf} disabled={isExportingPdf || isLoading}>
                            <FileDown className="h-4 w-4 mr-1" />
                            PDF
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por descripción o categoría..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-sm"
                />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Movimientos ({filteredTransactions.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : filteredTransactions.length > 0 ? (
                        <div className="space-y-4">
                            {filteredTransactions.map((t: any) => (
                                <div key={t.id} className="flex justify-between items-center border-b pb-4 last:border-0 last:pb-0">
                                    <div className="flex items-start gap-4">
                                        <div className={`mt-1 p-2 rounded-full ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                            {t.type === 'income' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />}
                                        </div>
                                        <div>
                                            <p className="font-medium">{t.description}</p>
                                            <p className="text-xs text-muted-foreground capitalize">{t.category} • {new Date(t.date).toLocaleDateString('es-AR', { dateStyle: 'long' })}</p>
                                        </div>
                                    </div>
                                    <p className={`font-bold ${t.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {t.type === 'income' ? '+' : '-'} {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(t.amount)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No se encontraron transacciones con ese criterio.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
