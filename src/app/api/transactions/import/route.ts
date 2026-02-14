import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { createRequestContext, logError, logInfo } from '@/lib/observability';
import { recordAuditEvent } from '@/lib/audit';

const MAX_IMPORT_ROWS = 2000;

type TransactionType = 'income' | 'expense';

type ParsedImportRow = {
    date: string;
    type: TransactionType;
    category: string;
    description: string;
    amount: number;
};

function parseAmount(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return NaN;

    const sanitized = value.replace(/[^\d,.-]/g, '').trim();
    if (!sanitized) return NaN;

    const hasComma = sanitized.includes(',');
    const hasDot = sanitized.includes('.');

    let normalized = sanitized;
    if (hasComma && hasDot) {
        normalized = sanitized.lastIndexOf(',') > sanitized.lastIndexOf('.')
            ? sanitized.replace(/\./g, '').replace(',', '.')
            : sanitized.replace(/,/g, '');
    } else if (hasComma) {
        normalized = sanitized.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function toIsoDate(value: unknown) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        return value.trim();
    }

    if (typeof value === 'string') {
        const normalized = value.trim();
        const ddmmyyyy = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
            const [, day, month, year] = ddmmyyyy;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }

        const parsed = new Date(normalized);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
        }
    }

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        const excelBase = Date.UTC(1899, 11, 30);
        const date = new Date(excelBase + Math.round(value) * 24 * 60 * 60 * 1000);
        if (!Number.isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    }

    return '';
}

function normalizeType(value: unknown): TransactionType | null {
    if (typeof value !== 'string') return null;
    const normalized = value.toLowerCase().trim();

    if (['income', 'ingreso', 'entrada', 'credit', 'credito'].includes(normalized)) {
        return 'income';
    }

    if (['expense', 'gasto', 'egreso', 'debit', 'debito'].includes(normalized)) {
        return 'expense';
    }

    return null;
}

function pickString(row: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
}

function parseRow(row: Record<string, unknown>): ParsedImportRow | null {
    const type = normalizeType(row.type ?? row.tipo);
    const amount = parseAmount(row.amount ?? row.monto ?? row.valor);
    const date = toIsoDate(row.date ?? row.fecha);
    const category = pickString(row, ['category', 'categoria', 'rubro']) || 'General';
    const description = pickString(row, ['description', 'descripcion', 'detalle', 'concepto']) || 'Movimiento importado';

    if (!type || !date || !Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    return {
        date,
        type,
        amount,
        category,
        description,
    };
}

export async function POST(req: Request) {
    const context = createRequestContext('/api/transactions/import', 'POST');
    const startedAt = Date.now();

    try {
        const supabase = await createClient();
        if (!supabase) return NextResponse.json({ error: 'Supabase no está configurado' }, { status: 500 });

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => null);
        const source = typeof body?.source === 'string' && body.source.trim()
            ? body.source.trim().slice(0, 40)
            : 'excel';
        const rawRows = Array.isArray(body?.rows) ? body.rows.slice(0, MAX_IMPORT_ROWS) : [];

        if (rawRows.length === 0) {
            return NextResponse.json({ error: 'No se recibieron filas para importar.' }, { status: 400 });
        }

        const parsedRows: ParsedImportRow[] = [];
        let skipped = 0;

        rawRows.forEach((row: unknown) => {
            const parsedRow = parseRow((row || {}) as Record<string, unknown>);
            if (!parsedRow) {
                skipped += 1;
                return;
            }
            parsedRows.push(parsedRow);
        });

        if (parsedRows.length === 0) {
            return NextResponse.json(
                { error: 'No se pudieron interpretar filas válidas del Excel.', skipped },
                { status: 400 }
            );
        }

        const payload = parsedRows.map((row) => ({
            user_id: session.user.id,
            ...row,
        }));

        const { data: insertedRows, error: insertError } = await supabase
            .from('transactions')
            .insert(payload)
            .select('id');

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        await recordAuditEvent({
            supabase,
            userId: session.user.id,
            entityType: 'transaction_import',
            entityId: String(Date.now()),
            action: 'system',
            metadata: {
                source,
                imported: insertedRows?.length || 0,
                skipped,
            },
        });

        logInfo('transactions_imported', {
            ...context,
            userId: session.user.id,
            imported: insertedRows?.length || 0,
            skipped,
            durationMs: Date.now() - startedAt,
        });

        return NextResponse.json({
            imported: insertedRows?.length || 0,
            skipped,
        });
    } catch (error) {
        logError('transactions_import_exception', error, {
            ...context,
            durationMs: Date.now() - startedAt,
        });
        return NextResponse.json({ error: 'No se pudo importar el archivo.' }, { status: 500 });
    }
}
