'use client';

import { PDFUploader } from '@/components/pdf/pdf-uploader';
import { useTransactions } from '@/hooks/use-transactions';
import { useFinance } from '@/hooks/use-finance';
import { toast } from 'sonner';

export default function PDFPage() {
    const { transactions } = useTransactions();
    const { addDebt, addGoal } = useFinance();

    const availableFunds = transactions.reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), 0);

    const handleAnalysisComplete = (result: any) => {
        // Aquí integraríamos los datos en el estado global/DB
        // Por ahora, como es una refactorización, aseguramos que la UI funcione
        console.log('Analysis Result:', result);
        toast.success('Datos procesados correctamente');
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight">Análisis de Facturas & PDF</h2>
                <p className="text-muted-foreground">Sube tus resúmenes bancarios para analizar gastos automáticamente con IA.</p>
            </div>

            <PDFUploader
                onAnalysisComplete={handleAnalysisComplete}
                availableFunds={availableFunds}
            />
        </div>
    );
}
