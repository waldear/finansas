'use client';

export const dynamic = 'force-dynamic';

import { FormEvent, useMemo, useState } from 'react';
import { useTransactions } from '@/hooks/use-transactions';
import { Transaction, TransactionInput } from '@/lib/schemas';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowUpCircle, ArrowDownCircle, Search, FileDown, Pencil, Trash2, Save, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const currencyFormatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

const emptyTransactionInput: TransactionInput = {
    type: 'expense',
    amount: 0,
    description: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
};

function toEditPayload(transaction: Transaction): TransactionInput {
    return {
        type: transaction.type,
        amount: Number(transaction.amount) || 0,
        description: transaction.description || '',
        category: transaction.category || '',
        date: transaction.date || new Date().toISOString().split('T')[0],
    };
}

export default function HistoryPage() {
    const {
        transactions,
        isLoading,
        updateTransaction,
        deleteTransaction,
        isUpdating,
        isDeleting,
    } = useTransactions();

    const [searchTerm, setSearchTerm] = useState('');
    const [isExportingCsv, setIsExportingCsv] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<TransactionInput>(emptyTransactionInput);
    const [targetTransactionId, setTargetTransactionId] = useState<string | null>(null);

    const filteredTransactions = useMemo(
        () =>
            transactions.filter((transaction) =>
                transaction.description.toLowerCase().includes(searchTerm.toLowerCase())
                || transaction.category.toLowerCase().includes(searchTerm.toLowerCase())
            ),
        [transactions, searchTerm]
    );

    const totalIncome = useMemo(
        () =>
            transactions
                .filter((transaction) => transaction.type === 'income')
                .reduce((accumulator, transaction) => accumulator + Number(transaction.amount), 0),
        [transactions]
    );

    const totalExpense = useMemo(
        () =>
            transactions
                .filter((transaction) => transaction.type === 'expense')
                .reduce((accumulator, transaction) => accumulator + Number(transaction.amount), 0),
        [transactions]
    );

    const balance = totalIncome - totalExpense;

    const exportCsv = () => {
        try {
            setIsExportingCsv(true);
            const headers = ['Fecha', 'Tipo', 'Categoria', 'Descripcion', 'Monto'];
            const rows = filteredTransactions.map((transaction) => ([
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
        } catch {
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
            filteredTransactions.forEach((transaction) => {
                const line = `${transaction.date} | ${transaction.type.toUpperCase()} | ${transaction.category} | ${transaction.description} | ${currencyFormatter.format(Number(transaction.amount))}`;
                if (y > 280) {
                    doc.addPage();
                    y = 12;
                }
                doc.text(line, 10, y);
                y += 6;
            });

            doc.save(`finansas-historial-${new Date().toISOString().slice(0, 10)}.pdf`);
            toast.success('PDF exportado correctamente');
        } catch {
            toast.error('No pudimos exportar el PDF');
        } finally {
            setIsExportingPdf(false);
        }
    };

    const startEditing = (transaction: Transaction) => {
        if (!transaction.id) {
            toast.error('No se puede editar esta transacción');
            return;
        }

        setEditingTransactionId(transaction.id);
        setEditForm(toEditPayload(transaction));
    };

    const cancelEditing = () => {
        setEditingTransactionId(null);
        setEditForm(emptyTransactionInput);
    };

    const handleSaveEdit = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingTransactionId) return;

        try {
            setTargetTransactionId(editingTransactionId);
            await updateTransaction({
                id: editingTransactionId,
                changes: editForm,
            });
            cancelEditing();
        } catch {
            // toast handled in hook
        } finally {
            setTargetTransactionId(null);
        }
    };

    const handleDelete = async (transaction: Transaction) => {
        if (!transaction.id) {
            toast.error('No se puede eliminar esta transacción');
            return;
        }

        const approved = window.confirm('¿Seguro que quieres eliminar esta transacción? Esta acción no se puede deshacer.');
        if (!approved) return;

        try {
            setTargetTransactionId(transaction.id);
            await deleteTransaction(transaction.id);
            if (editingTransactionId === transaction.id) {
                cancelEditing();
            }
        } catch {
            // toast handled in hook
        } finally {
            setTargetTransactionId(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Historial Completo</h2>
                    <p className="text-muted-foreground">Revisa, edita o elimina tus transacciones registradas.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden text-right text-sm md:block">
                        <p className="text-muted-foreground">Balance Total</p>
                        <p className={`text-lg font-bold ${balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {currencyFormatter.format(balance)}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={exportCsv} disabled={isExportingCsv || isLoading}>
                            <FileDown className="mr-1 h-4 w-4" />
                            CSV
                        </Button>
                        <Button variant="outline" size="sm" onClick={exportPdf} disabled={isExportingPdf || isLoading}>
                            <FileDown className="mr-1 h-4 w-4" />
                            PDF
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por descripción o categoría..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
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
                            {filteredTransactions.map((transaction) => {
                                const isEditing = editingTransactionId === transaction.id;
                                const isTargeting = targetTransactionId === transaction.id;
                                const isBusy = isTargeting && (isUpdating || isDeleting);

                                return (
                                    <div key={transaction.id || `${transaction.date}-${transaction.description}`} className="rounded-lg border p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-start gap-4">
                                                <div className={`mt-1 rounded-full p-2 ${transaction.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                                                    {transaction.type === 'income' ? <ArrowUpCircle className="h-4 w-4" /> : <ArrowDownCircle className="h-4 w-4" />}
                                                </div>
                                                <div>
                                                    <p className="font-medium">{transaction.description}</p>
                                                    <p className="text-xs capitalize text-muted-foreground">
                                                        {transaction.category}
                                                        {' • '}
                                                        {new Date(transaction.date).toLocaleDateString('es-AR', { dateStyle: 'long' })}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <p className={`font-bold ${transaction.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {transaction.type === 'income' ? '+' : '-'} {currencyFormatter.format(Number(transaction.amount))}
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8"
                                                        onClick={() => startEditing(transaction)}
                                                        disabled={!transaction.id || isBusy}
                                                        title="Editar transacción"
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                                        onClick={() => handleDelete(transaction)}
                                                        disabled={!transaction.id || isBusy}
                                                        title="Eliminar transacción"
                                                    >
                                                        {isBusy && isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {isEditing && (
                                            <form onSubmit={handleSaveEdit} className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
                                                <Input
                                                    value={editForm.description}
                                                    onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                                                    placeholder="Descripción"
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
                                                    value={editForm.amount}
                                                    onChange={(event) => setEditForm((prev) => ({ ...prev, amount: Number(event.target.value) || 0 }))}
                                                    placeholder="Monto"
                                                    required
                                                />
                                                <Input
                                                    type="date"
                                                    value={editForm.date}
                                                    onChange={(event) => setEditForm((prev) => ({ ...prev, date: event.target.value }))}
                                                    required
                                                />
                                                <div className="md:col-span-2">
                                                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo</label>
                                                    <select
                                                        value={editForm.type}
                                                        onChange={(event) => setEditForm((prev) => ({ ...prev, type: event.target.value as 'income' | 'expense' }))}
                                                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                                    >
                                                        <option value="expense">Gasto</option>
                                                        <option value="income">Ingreso</option>
                                                    </select>
                                                </div>
                                                <div className="flex gap-2 md:col-span-2">
                                                    <Button type="submit" size="sm" disabled={isBusy}>
                                                        {isBusy && isUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                        Guardar cambios
                                                    </Button>
                                                    <Button type="button" size="sm" variant="outline" onClick={cancelEditing} disabled={isBusy}>
                                                        <X className="mr-2 h-4 w-4" />
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
                        <div className="py-12 text-center">
                            <p className="text-muted-foreground">No se encontraron transacciones con ese criterio.</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
