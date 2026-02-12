
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle2, XCircle, AlertTriangle, Key, Database, RefreshCw } from 'lucide-react';

interface SystemHealth {
    env: {
        GEMINI_API_KEY: boolean;
    };
    db: {
        obligations_table: boolean;
        documents_table: boolean;
        storage_bucket: boolean;
    };
}

export function SetupCheck({ onReady }: { onReady: () => void }) {
    const [health, setHealth] = useState<SystemHealth | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const checkHealth = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/system/health');
            const data = await res.json();
            setHealth(data);

            // Auto-proceed if everything is green
            if (data.env.GEMINI_API_KEY && data.db.obligations_table && data.db.documents_table) {
                onReady();
            }
        } catch (error) {
            console.error('Failed to check health', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        checkHealth();
    }, []);

    if (isLoading) {
        return (
            <Card className="max-w-md mx-auto mt-8 animate-pulse">
                <CardHeader>
                    <div className="h-6 w-48 bg-muted rounded mb-2"></div>
                    <div className="h-4 w-64 bg-muted rounded"></div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="h-10 w-full bg-muted rounded"></div>
                        <div className="h-10 w-full bg-muted rounded"></div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!health) return null;

    const allGood = health.env.GEMINI_API_KEY && health.db.obligations_table;

    if (allGood) return null; // Should have triggered onReady, but just in case

    return (
        <div className="max-w-2xl mx-auto mt-8 space-y-6">
            <Card className="border-l-4 border-l-yellow-500">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-700">
                        <AlertTriangle className="h-6 w-6" />
                        Configuración Requerida
                    </CardTitle>
                    <CardDescription>
                        Para usar el Copiloto Financiero AI, necesitamos configurar un par de cosas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">

                    {/* Step 1: API Key */}
                    <div className="space-y-3">
                        <h3 className="font-medium flex items-center gap-2">
                            1. Llave de Inteligencia Artificial (Google Gemini)
                            {health.env.GEMINI_API_KEY ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                            )}
                        </h3>
                        {!health.env.GEMINI_API_KEY && (
                            <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800">
                                <Key className="h-4 w-4" />
                                <AlertTitle>Falta GEMINI_API_KEY</AlertTitle>
                                <AlertDescription>
                                    <p className="mb-2">No encontramos la API Key en tu archivo <code>.env.local</code>.</p>
                                    <ol className="list-decimal list-inside text-sm space-y-1 ml-2">
                                        <li>Consigue una key gratis en <a href="https://aistudio.google.com/app/apikey" target="_blank" className="underline font-bold">Google AI Studio</a>.</li>
                                        <li>Abre el archivo <code>.env.local</code> en la raíz de tu proyecto.</li>
                                        <li>Añade una línea: <code>GEMINI_API_KEY="tu_key_aqui"</code></li>
                                        <li>Reinicia el servidor (si estás en local).</li>
                                    </ol>
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    {/* Step 2: Database Schema */}
                    <div className="space-y-3">
                        <h3 className="font-medium flex items-center gap-2">
                            2. Tablas de Base de Datos (Supabase)
                            {health.db.obligations_table ? (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : (
                                <XCircle className="h-5 w-5 text-red-500" />
                            )}
                        </h3>
                        {!health.db.obligations_table && (
                            <Alert className="bg-blue-50 border-blue-200 text-blue-800">
                                <Database className="h-4 w-4" />
                                <AlertTitle>Tablas Faltantes</AlertTitle>
                                <AlertDescription>
                                    <p className="mb-2">La base de datos no tiene las tablas necesarias (obligations, documents).</p>
                                    <p className="text-sm mb-2">Ejecuta el siguiente SQL en el editor de Supabase:</p>
                                    <div className="bg-slate-950 text-slate-50 p-3 rounded-md text-xs font-mono overflow-x-auto">
                                        No te preocupes, el archivo <code>supabase-copilot.sql</code> ya está en tu proyecto. Copia su contenido y pégalo en el SQL Editor de Supabase.
                                    </div>
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button onClick={checkHealth} className="gap-2">
                            <RefreshCw className="h-4 w-4" /> Verificiar Nuevamente
                        </Button>
                    </div>

                </CardContent>
            </Card>
        </div>
    );
}
