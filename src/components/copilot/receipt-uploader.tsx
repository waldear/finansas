
'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface ReceiptUploaderProps {
    onUploadComplete: (data: any) => void;
}

export function ReceiptUploader({ onUploadComplete }: ReceiptUploaderProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            setFile(acceptedFiles[0]);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.jpeg', '.jpg', '.png', '.webp'],
            'application/pdf': ['.pdf']
        },
        maxFiles: 1,
        maxSize: 5 * 1024 * 1024, // 5MB
        onDropRejected: (rejections) => {
            const firstError = rejections[0]?.errors[0];
            if (!firstError) return;

            if (firstError.code === 'file-too-large') {
                toast.error('El archivo supera 5MB. Comprime el PDF o sube una imagen.');
                return;
            }

            if (firstError.code === 'file-invalid-type') {
                toast.error('Formato no soportado. Usa JPG, PNG, WEBP o PDF.');
                return;
            }

            toast.error('No pudimos cargar el archivo seleccionado.');
        },
    });

    const removeFile = (e: React.MouseEvent) => {
        e.stopPropagation();
        setFile(null);
    };

    const handleUpload = async () => {
        if (!file) return;

        setIsUploading(true);
        setUploadProgress(10);

        try {
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/documents/process', {
                method: 'POST',
                credentials: 'include',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al procesar el documento');
            }

            const result = await response.json();
            setUploadProgress(25);

            if (result.jobId) {
                await fetch(`/api/documents/jobs/${result.jobId}/run`, {
                    method: 'POST',
                    credentials: 'include',
                });

                for (let attempt = 0; attempt < 45; attempt++) {
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                    const statusResponse = await fetch(`/api/documents/jobs/${result.jobId}`, {
                        credentials: 'include',
                    });

                    const statusBody = await statusResponse.json().catch(() => null);
                    if (!statusResponse.ok) {
                        throw new Error(statusBody?.error || 'No se pudo consultar el estado del análisis');
                    }

                    if (statusBody.status === 'completed') {
                        setUploadProgress(100);
                        toast.success('Documento procesado con éxito');

                        if (statusBody.warning) {
                            toast.warning(statusBody.warning);
                        }

                        setTimeout(() => {
                            onUploadComplete(statusBody.data);
                        }, 500);
                        return;
                    }

                    if (statusBody.status === 'failed') {
                        throw new Error(statusBody.error || 'El análisis del documento falló.');
                    }

                    setUploadProgress(Math.min(95, 30 + (attempt * 2)));
                }

                throw new Error('El análisis tardó demasiado. Inténtalo nuevamente.');
            }

            setUploadProgress(100);

            toast.success('Documento procesado con éxito');
            if (result.warning) {
                toast.warning(result.warning);
            }

            // Short delay to show 100% completion
            setTimeout(() => {
                onUploadComplete(result.data);
            }, 500);

        } catch (error: any) {
            console.error(error);
            toast.error(error.message || 'Error al subir el archivo');
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto border-2 border-dashed">
            <CardContent className="p-6">
                {!file ? (
                    <div
                        {...getRootProps()}
                        className={cn(
                            "flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-colors rounded-lg hover:bg-muted/50",
                            isDragActive && "bg-muted border-primary"
                        )}
                    >
                        <input {...getInputProps()} />
                        <div className="p-4 rounded-full bg-primary/10 mb-4">
                            <Upload className="w-8 h-8 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Sube tu comprobante</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                            Arrastra y suelta tu archivo aquí, o haz clic para seleccionar.
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Soporta: JPG, PNG, PDF (Máx 5MB)
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 p-4 border rounded-lg bg-card">
                            <div className="p-3 rounded-lg bg-primary/10">
                                <FileText className="w-6 h-6 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </div>
                            {!isUploading && (
                                <button
                                    onClick={removeFile}
                                    className="p-1 hover:bg-destructive/10 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                                    aria-label="Eliminar archivo"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {isUploading ? (
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground flex items-center gap-2">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Analizando con IA...
                                    </span>
                                    <span className="font-medium">{uploadProgress}%</span>
                                </div>
                                <Progress value={uploadProgress} className="h-2" />
                                <p className="text-xs text-muted-foreground text-center italic mt-2">
                                    "Extrayendo datos financieros de tu caos..." 🧾✨
                                </p>
                            </div>
                        ) : (
                            <Button
                                onClick={handleUpload}
                                className="w-full"
                                size="lg"
                            >
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Procesar Documento
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
