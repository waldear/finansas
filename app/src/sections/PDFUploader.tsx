import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Edit3
} from 'lucide-react';
import { analyzePDFWithGemini } from '@/services/geminiAssistant';
import type { AnalysisResult } from '@/services/pdfAnalyzer';
import { toast } from 'sonner';

interface PDFUploaderProps {
  onAnalysisComplete: (result: AnalysisResult) => void;
  availableFunds: number;
}

export function PDFUploader({ onAnalysisComplete, availableFunds }: PDFUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [editingCard, setEditingCard] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Abrir selector de archivos
  const openFileSelector = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  // Manejar selección de archivos
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const pdfFiles = Array.from(selectedFiles).filter(f => 
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (pdfFiles.length > 0) {
        setFiles(prev => [...prev, ...pdfFiles]);
        toast.success(`${pdfFiles.length} archivo(s) seleccionado(s)`);
      } else {
        toast.error('Por favor selecciona archivos PDF');
      }
    }
  };

  // Manejar drop de archivos
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const pdfFiles = Array.from(droppedFiles).filter(f => 
        f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      );
      if (pdfFiles.length > 0) {
        setFiles(prev => [...prev, ...pdfFiles]);
        toast.success(`${pdfFiles.length} archivo(s) agregado(s)`);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Eliminar archivo
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setAnalysisResult(null);
  };

  // Analizar archivos
  const handleAnalyze = async () => {
    if (files.length === 0) {
      toast.error('No hay archivos para analizar');
      return;
    }
    
    setIsAnalyzing(true);
    try {
      const pdfData = await analyzePDFWithGemini(files[0]);
      
      // Crear resultado del análisis
      const result: AnalysisResult = {
        cards: [{
          cardName: pdfData.cardName,
          cardType: 'credit_card',
          statementDate: new Date().toISOString().split('T')[0],
          dueDate: pdfData.dueDate,
          totalBalance: pdfData.totalBalance,
          minimumPayment: pdfData.minimumPayment,
          currentPeriodAmount: pdfData.totalBalance,
          previousBalance: 0,
          payments: 0,
          purchases: pdfData.totalBalance,
          interest: 0,
          fees: 0,
          availableCredit: 0,
          creditLimit: 0,
          transactions: pdfData.transactions.length > 0 ? pdfData.transactions.map(t => ({
            date: new Date().toISOString().split('T')[0],
            description: t.description,
            amount: t.amount,
            type: 'purchase' as const,
          })) : [{
            date: new Date().toISOString().split('T')[0],
            description: 'Consumos del período',
            amount: pdfData.totalBalance,
            type: 'purchase' as const,
          }],
        }],
        totalDebt: pdfData.totalBalance,
        totalMinimumPayment: pdfData.minimumPayment,
        recommendations: [{
          cardName: pdfData.cardName,
          totalBalance: pdfData.totalBalance,
          minimumPayment: pdfData.minimumPayment,
          recommendedPayment: pdfData.totalBalance,
          reason: 'Te recomendamos pagar el total para evitar intereses.',
          priority: pdfData.totalBalance > 500000 ? 'high' : 'medium',
          interestRate: 8,
          estimatedInterestIfMinimum: Math.round(pdfData.totalBalance * 0.08),
          savingsIfFull: Math.round(pdfData.totalBalance * 0.08),
        }],
        debtsToAdd: [{
          name: pdfData.cardName,
          totalAmount: pdfData.totalBalance,
          monthlyPayment: pdfData.minimumPayment,
          remainingInstallments: 1,
          totalInstallments: 1,
          category: 'credit_card' as const,
          nextPaymentDate: pdfData.dueDate,
        }],
        transactionsToAdd: [{
          type: 'expense' as const,
          amount: pdfData.totalBalance,
          description: `Pago ${pdfData.cardName}`,
          category: 'debt',
          date: new Date().toISOString().split('T')[0],
        }],
      };
      
      setAnalysisResult(result);
      
      if (pdfData.totalBalance === 0) {
        toast.info('No se detectaron montos en el PDF. Podés editarlos manualmente.');
      } else {
        toast.success('¡Análisis completado!');
      }
    } catch (error) {
      console.error('Error al analizar:', error);
      toast.error('Error al analizar el PDF. Intenta con otro archivo.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Actualizar datos manualmente
  const updateCardData = (field: string, value: string | number) => {
    if (!analysisResult) return;
    
    const updated = { ...analysisResult };
    if (field === 'cardName') {
      updated.cards[0].cardName = value as string;
      updated.debtsToAdd[0].name = value as string;
      updated.recommendations[0].cardName = value as string;
    } else if (field === 'totalBalance') {
      const numValue = parseFloat(value as string) || 0;
      updated.cards[0].totalBalance = numValue;
      updated.cards[0].currentPeriodAmount = numValue;
      updated.cards[0].purchases = numValue;
      updated.totalDebt = numValue;
      updated.debtsToAdd[0].totalAmount = numValue;
      updated.transactionsToAdd[0].amount = numValue;
      updated.recommendations[0].totalBalance = numValue;
      updated.recommendations[0].recommendedPayment = numValue;
      updated.recommendations[0].estimatedInterestIfMinimum = Math.round(numValue * 0.08);
      updated.recommendations[0].savingsIfFull = Math.round(numValue * 0.08);
    } else if (field === 'minimumPayment') {
      const numValue = parseFloat(value as string) || 0;
      updated.cards[0].minimumPayment = numValue;
      updated.totalMinimumPayment = numValue;
      updated.debtsToAdd[0].monthlyPayment = numValue;
      updated.recommendations[0].minimumPayment = numValue;
    } else if (field === 'dueDate') {
      updated.cards[0].dueDate = value as string;
      updated.debtsToAdd[0].nextPaymentDate = value as string;
    }
    
    setAnalysisResult(updated);
  };

  // Aplicar datos
  const handleApplyData = () => {
    if (analysisResult) {
      onAnalysisComplete(analysisResult);
      toast.success('¡Datos cargados correctamente!');
      setFiles([]);
      setAnalysisResult(null);
      setEditingCard(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Subir Resumen de Tarjetas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Input oculto */}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          {/* Área de selección */}
          {!files.length && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                Arrastra tu PDF aquí
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                o
              </p>
              <Button 
                type="button"
                onClick={openFileSelector}
                variant="default"
                size="lg"
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Seleccionar archivo
              </Button>
            </div>
          )}

          {/* Archivo seleccionado */}
          {files.length > 0 && !analysisResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-500" />
                  <div>
                    <p className="font-medium">{files[0].name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(files[0].size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(0)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              <Button
                type="button"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="w-full"
                size="lg"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analizando...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Analizar PDF
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resultados del análisis */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Resumen */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Datos Detectados
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setEditingCard(!editingCard)}
              >
                <Edit3 className="h-4 w-4 mr-1" />
                {editingCard ? 'Listo' : 'Editar'}
              </Button>
            </CardHeader>
            <CardContent>
              {editingCard ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Nombre de la tarjeta</label>
                    <Input 
                      value={analysisResult.cards[0].cardName}
                      onChange={(e) => updateCardData('cardName', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Saldo total ($)</label>
                    <Input 
                      type="number"
                      value={analysisResult.cards[0].totalBalance}
                      onChange={(e) => updateCardData('totalBalance', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Pago mínimo ($)</label>
                    <Input 
                      type="number"
                      value={analysisResult.cards[0].minimumPayment}
                      onChange={(e) => updateCardData('minimumPayment', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Fecha de vencimiento</label>
                    <Input 
                      type="date"
                      value={analysisResult.cards[0].dueDate}
                      onChange={(e) => updateCardData('dueDate', e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">Tarjeta</p>
                    <p className="text-xl font-semibold">{analysisResult.cards[0].cardName}</p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm text-red-600">Saldo Total</p>
                    <p className="text-2xl font-bold text-red-700">
                      {formatCurrency(analysisResult.cards[0].totalBalance)}
                    </p>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="text-sm text-yellow-600">Pago Mínimo</p>
                    <p className="text-2xl font-bold text-yellow-700">
                      {formatCurrency(analysisResult.cards[0].minimumPayment)}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-600">Vencimiento</p>
                    <p className="text-xl font-bold text-blue-700">
                      {new Date(analysisResult.cards[0].dueDate).toLocaleDateString('es-AR')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Estrategia */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                Estrategia de Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Alert className={availableFunds >= analysisResult.totalDebt ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}>
                <Wallet className="h-4 w-4" />
                <AlertTitle>
                  {availableFunds >= analysisResult.totalDebt 
                    ? '¡Tienes fondos suficientes!' 
                    : availableFunds >= analysisResult.totalMinimumPayment
                    ? 'Podés pagar el mínimo'
                    : 'Fondos insuficientes'}
                </AlertTitle>
                <AlertDescription className="mt-2">
                  <p className="mb-2">
                    <strong>Tus fondos disponibles:</strong> {formatCurrency(availableFunds)}
                  </p>
                  <p>
                    {availableFunds >= analysisResult.totalDebt
                      ? 'Pagá el total y evitá intereses.'
                      : availableFunds >= analysisResult.totalMinimumPayment
                      ? 'Pagá lo que puedas, pero priorizá las tarjetas con mayor interés.'
                      : 'Contactá a tu banco para renegociar.'}
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Botones de acción */}
          <div className="flex gap-4">
            <Button
              type="button"
              onClick={handleApplyData}
              className="flex-1"
              size="lg"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Cargar a Mi Cuenta
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFiles([]);
                setAnalysisResult(null);
                setEditingCard(false);
              }}
              size="lg"
            >
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
