'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    Upload,
    FileText,
    X,
    CheckCircle2,
    Loader2,
    CreditCard,
    Lightbulb,
    Wallet,
    FolderOpen,
    Edit3,
    Lock
} from 'lucide-react';
import { toast } from 'sonner';

interface PDFUploaderProps {
    onAnalysisComplete: (result: any) => void;
    availableFunds: number;
}

export function PDFUploader({ onAnalysisComplete, availableFunds }: PDFUploaderProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<any | null>(null);
    const [editingCard, setEditingCard] = useState(false);
    const [pdfPassword, setPdfPassword] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const openFileSelector = () => inputRef.current?.click();

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (selectedFiles && selectedFiles.length > 0) {
            setFiles(Array.from(selectedFiles));
        }
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
        });
    };

    const handleAnalyze = async () => {
        if (files.length === 0) return;
        setIsAnalyzing(true);
        try {
            const base64 = await fileToBase64(files[0]);
            const res = await fetch('/api/analyze-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileData: base64 }),
            });

            const { text } = await res.json();

            // Enviar el texto a Gemini para estructurar
            const geminiRes = await fetch('/api/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Analiza este texto de PDF y extrae: nombre de tarjeta, saldo total, pago mínimo, vencimiento y transacciones. Responde SOLO JSON:\n${text}`,
                    context: { summary: { balance: 0, totalIncome: 0, totalExpenses: 0 }, debts: [], transactions: [] }
                })
            });

            const geminiData = await geminiRes.json();
            // Intentar parsear JSON de la respuesta de texto de Gemini
            const jsonMatch = geminiData.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                setAnalysisResult(JSON.parse(jsonMatch[0]));
                toast.success('Análisis completado');
            } else {
                throw new Error('No se pudo estructurar la información');
            }

        } catch (error: any) {
            toast.error('Error al analizar: ' + error.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Upload className="h-5 w-5" /> Subir Resumen
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <input ref={inputRef} type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" />

                    {!files.length ? (
                        <div
                            onClick={openFileSelector}
                            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                            <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-4" />
                            <p className="font-medium">Haz clic o arrastra para subir tu PDF</p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                            <div className="flex items-center gap-3">
                                <FileText className="h-8 w-8 text-blue-500" />
                                <p className="font-medium">{files[0].name}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setFiles([])}><X className="h-4 w-4" /></Button>
                        </div>
                    )}

                    {files.length > 0 && !analysisResult && (
                        <Button className="w-full" onClick={handleAnalyze} disabled={isAnalyzing}>
                            {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                            Analizar con IA
                        </Button>
                    )}
                </CardContent>
            </Card>

            {analysisResult && (
                <Card>
                    <CardHeader>
                        <CardTitle>Resultados detectados</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4 md:grid-cols-2">
                        <div className="p-4 bg-muted rounded-lg">
                            <p className="text-sm text-muted-foreground">Tarjeta</p>
                            <p className="text-xl font-bold">{analysisResult.cardName || analysisResult.nombre}</p>
                        </div>
                        <div className="p-4 bg-red-500/10 rounded-lg">
                            <p className="text-sm text-red-500">Saldo Total</p>
                            <p className="text-xl font-bold">{formatCurrency(analysisResult.totalBalance || analysisResult.saldo)}</p>
                        </div>
                        <Button className="md:col-span-2" onClick={() => onAnalysisComplete(analysisResult)}>
                            Confirmar e Ingresar
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
