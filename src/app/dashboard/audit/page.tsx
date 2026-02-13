'use client';

export const dynamic = 'force-dynamic';

import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAudit } from '@/hooks/use-audit';
import { useTransactions } from '@/hooks/use-transactions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck, FileSpreadsheet, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';

type GroupBy = 'day' | 'month' | 'year';

function toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isWithinDateRange(dateValue: string, startDate: string, endDate: string) {
    const normalizedDate = dateValue.slice(0, 10);
    if (startDate && normalizedDate < startDate) return false;
    if (endDate && normalizedDate > endDate) return false;
    return true;
}

function getGroupKey(dateValue: string, groupBy: GroupBy) {
    const normalizedDate = dateValue.slice(0, 10);
    if (groupBy === 'day') return normalizedDate;
    if (groupBy === 'month') return normalizedDate.slice(0, 7);
    return normalizedDate.slice(0, 4);
}

function formatGroupLabel(groupKey: string, groupBy: GroupBy) {
    if (groupBy === 'day') {
        return new Date(`${groupKey}T00:00:00`).toLocaleDateString('es-AR', { dateStyle: 'long' });
    }

    if (groupBy === 'month') {
        const [year, month] = groupKey.split('-').map(Number);
        return new Date(year, month - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    }

    return groupKey;
}

export default function AuditPage() {
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const { events, isLoading: isLoadingAudit } = useAudit(2000);
    const { transactions, isLoading: isLoadingTransactions } = useTransactions();

    const [searchTerm, setSearchTerm] = useState('');
    const [groupBy, setGroupBy] = useState<GroupBy>('month');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const isLoading = isLoadingAudit || isLoadingTransactions;
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filteredTransactions = useMemo(() => {
        return (transactions || []).filter((transaction: any) => {
            if (!isWithinDateRange(String(transaction.date || ''), startDate, endDate)) {
                return false;
            }

            if (!normalizedSearch) return true;

            const searchable = [
                transaction.description,
                transaction.category,
                transaction.type,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return searchable.includes(normalizedSearch);
        });
    }, [transactions, startDate, endDate, normalizedSearch]);

    const filteredEvents = useMemo(() => {
        return (events || []).filter((event: any) => {
            if (!isWithinDateRange(String(event.created_at || ''), startDate, endDate)) {
                return false;
            }

            if (!normalizedSearch) return true;

            const searchable = [
                event.entity_type,
                event.action,
                event.entity_id,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return searchable.includes(normalizedSearch);
        });
    }, [events, startDate, endDate, normalizedSearch]);

    const groupedMovements = useMemo(() => {
        const groups = new Map<string, {
            key: string;
            label: string;
            items: any[];
            income: number;
            expense: number;
        }>();

        filteredTransactions.forEach((transaction: any) => {
            const key = getGroupKey(String(transaction.date || ''), groupBy);
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    label: formatGroupLabel(key, groupBy),
                    items: [],
                    income: 0,
                    expense: 0,
                });
            }

            const target = groups.get(key)!;
            target.items.push(transaction);

            const amount = toNumber(transaction.amount);
            if (transaction.type === 'income') {
                target.income += amount;
            } else {
                target.expense += amount;
            }
        });

        return Array.from(groups.values())
            .map((group) => ({
                ...group,
                balance: group.income - group.expense,
                items: group.items.sort((a, b) => String(b.date).localeCompare(String(a.date))),
            }))
            .sort((a, b) => b.key.localeCompare(a.key));
    }, [filteredTransactions, groupBy]);

    const totals = useMemo(() => {
        const income = filteredTransactions
            .filter((transaction: any) => transaction.type === 'income')
            .reduce((acc: number, transaction: any) => acc + toNumber(transaction.amount), 0);

        const expense = filteredTransactions
            .filter((transaction: any) => transaction.type === 'expense')
            .reduce((acc: number, transaction: any) => acc + toNumber(transaction.amount), 0);

        return {
            income,
            expense,
            balance: income - expense,
        };
    }, [filteredTransactions]);

    const formatCurrency = (amount: number) => new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
    }).format(amount);

    const handleExportExcel = async () => {
        try {
            setIsExporting(true);
            const XLSX = await import('xlsx');

            const workbook = XLSX.utils.book_new();
            const movementRows = filteredTransactions.map((transaction: any) => ({
                Fecha: transaction.date,
                Tipo: transaction.type,
                Categoria: transaction.category,
                Descripcion: transaction.description,
                Monto: toNumber(transaction.amount),
            }));

            const summaryRows = groupedMovements.map((group) => ({
                Periodo: group.label,
                Ingresos: group.income,
                Gastos: group.expense,
                Balance: group.balance,
                Movimientos: group.items.length,
            }));

            const eventRows = filteredEvents.map((event: any) => ({
                FechaHora: new Date(event.created_at).toLocaleString('es-AR'),
                Entidad: event.entity_type,
                Accion: event.action,
                EntidadId: event.entity_id,
            }));

            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(movementRows), 'Movimientos');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumen');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(eventRows), 'Auditoria');

            const fileName = `finansas-auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            toast.success('Excel exportado correctamente');
        } catch {
            toast.error('No se pudo exportar el Excel.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;

        try {
            setIsImporting(true);
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null }) as Record<string, unknown>[];

            if (!rows.length) {
                throw new Error('El archivo no contiene filas para importar.');
            }

            const response = await fetch('/api/transactions/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rows }),
            });

            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.error || 'No se pudo importar el Excel.');
            }

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['transactions'] }),
                queryClient.invalidateQueries({ queryKey: ['audit'] }),
                queryClient.invalidateQueries({ queryKey: ['budgets'] }),
            ]);

            toast.success(`Importación lista: ${body.imported} movimientos cargados${body.skipped ? `, ${body.skipped} omitidos` : ''}.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo importar el Excel.');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Auditoría y Movimientos</h2>
                    <p className="text-muted-foreground">Control por día, mes o año + importación/exportación en Excel.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleImportFile}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting || isLoading}
                    >
                        {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Importar Excel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={isExporting || isLoading}
                    >
                        {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Exportar Excel
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="grid gap-3 md:grid-cols-4">
                        <Input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Buscar descripción, categoría, tipo..."
                            className="md:col-span-2"
                        />
                        <select
                            value={groupBy}
                            onChange={(event) => setGroupBy(event.target.value as GroupBy)}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="day">Agrupar por día</option>
                            <option value="month">Agrupar por mes</option>
                            <option value="year">Agrupar por año</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Ingresos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-emerald-500">{formatCurrency(totals.income)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Gastos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.expense)}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-2xl font-bold ${totals.balance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {formatCurrency(totals.balance)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-primary" />
                        Historial agrupado ({groupBy === 'day' ? 'día' : groupBy === 'month' ? 'mes' : 'año'})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : groupedMovements.length > 0 ? (
                        <div className="space-y-3">
                            {groupedMovements.map((group) => (
                                <div key={group.key} className="rounded-lg border p-3">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-semibold">{group.label}</p>
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-600">
                                                Ingresos: {formatCurrency(group.income)}
                                            </span>
                                            <span className="rounded bg-red-500/10 px-2 py-1 text-red-500">
                                                Gastos: {formatCurrency(group.expense)}
                                            </span>
                                            <span className="rounded bg-primary/10 px-2 py-1 text-primary">
                                                Balance: {formatCurrency(group.balance)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        {group.items.slice(0, 12).map((transaction) => (
                                            <div key={transaction.id} className="flex items-center justify-between rounded border px-3 py-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium">{transaction.description}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {transaction.category} • {new Date(transaction.date).toLocaleDateString('es-AR')}
                                                    </p>
                                                </div>
                                                <p className={`ml-3 text-sm font-semibold ${transaction.type === 'income' ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {transaction.type === 'income' ? '+' : '-'} {formatCurrency(toNumber(transaction.amount))}
                                                </p>
                                            </div>
                                        ))}
                                        {group.items.length > 12 && (
                                            <p className="text-xs text-muted-foreground">
                                                +{group.items.length - 12} movimientos más en este período.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">No hay movimientos para este filtro.</p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-primary" />
                        Eventos de auditoría ({filteredEvents.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : filteredEvents.length > 0 ? (
                        <div className="space-y-3">
                            {filteredEvents.slice(0, 100).map((event) => (
                                <div key={event.id} className="border rounded-lg p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-medium">
                                            {event.entity_type} • {event.action}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(event.created_at).toLocaleString('es-AR')}
                                        </p>
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        ID entidad: {event.entity_id}
                                    </p>
                                </div>
                            ))}
                            {filteredEvents.length > 100 && (
                                <p className="text-xs text-muted-foreground">
                                    Mostrando 100 de {filteredEvents.length} eventos.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-center text-muted-foreground py-8">No hay eventos de auditoría para este filtro.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
