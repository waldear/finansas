'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase-browser';
import { sanitizeEnv } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, UserPlus, LogIn, Chrome } from 'lucide-react';
import { toast } from 'sonner';
import { FinFlowLogo } from '@/components/ui/finflow-logo';

function formatAuthErrorMessage(message?: string) {
    if (!message) return 'Ocurrió un error de autenticación. Intenta nuevamente.';

    const normalized = message.toLowerCase();

    if (normalized.includes('invalid login credentials')) {
        return 'Email o contraseña incorrectos.';
    }

    if (normalized.includes('email not confirmed')) {
        return 'Debes confirmar tu email antes de ingresar.';
    }

    if (normalized.includes('user already registered')) {
        return 'Este correo ya está registrado.';
    }

    if (normalized.includes('password should be at least')) {
        return 'La contraseña debe tener al menos 8 caracteres.';
    }

    if (/leaked|breach|pwned|compromised|have i been pwned|hibp/.test(normalized)) {
        return 'Esta contraseña aparece en una filtración pública. Elige otra.';
    }

    if (normalized.includes('for security purposes')) {
        return 'Espera unos segundos antes de volver a intentarlo.';
    }

    if (normalized.includes('signup is disabled')) {
        return 'El registro está deshabilitado temporalmente.';
    }

    if (normalized.includes('provider is not enabled')) {
        return 'Google no está habilitado. Intenta con email y contraseña.';
    }

    return message;
}

type PasswordValidationResult = {
    valid: boolean;
    message?: string;
};

async function sha1Hex(value: string) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

async function validatePasswordNotLeaked(password: string): Promise<PasswordValidationResult> {
    try {
        if (typeof window === 'undefined' || !window.crypto?.subtle) {
            return { valid: true };
        }

        const sha1 = await sha1Hex(password);
        const response = await fetch('/api/auth/password-leak-check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sha1 }),
        });

        if (!response.ok) {
            return {
                valid: false,
                message: 'No se pudo validar la seguridad de la contraseña. Intenta de nuevo.',
            };
        }

        const payload = await response.json() as { leaked?: boolean };
        if (payload.leaked) {
            return {
                valid: false,
                message: 'Esta contraseña aparece en una filtración pública. Elige otra.',
            };
        }

        return { valid: true };
    } catch {
        return {
            valid: false,
            message: 'No se pudo validar la seguridad de la contraseña. Intenta de nuevo.',
        };
    }
}

export default function AuthPage() {
    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loginMethod, setLoginMethod] = useState<'password' | 'magic-link'>('password');

    const router = useRouter();
    const queryClient = useQueryClient();
    const supabase = useMemo(() => createClient(), []);

    const buildCallbackUrl = () => {
        const siteUrl = sanitizeEnv(process.env.NEXT_PUBLIC_SITE_URL)?.replace(/\/$/, '');
        const runtimeOrigin = sanitizeEnv(window.location.origin)?.replace(/\/$/, '');
        const isHttpUrl = (value: string | undefined) => Boolean(value && /^https?:\/\//.test(value));

        if (isHttpUrl(runtimeOrigin) && !runtimeOrigin!.includes('localhost')) {
            return `${runtimeOrigin}/auth/callback`;
        }

        if (isHttpUrl(siteUrl)) {
            return `${siteUrl}/auth/callback`;
        }

        if (isHttpUrl(runtimeOrigin)) {
            return `${runtimeOrigin}/auth/callback`;
        }

        return '/auth/callback';
    };

    useEffect(() => {
        queryClient.clear();
    }, [queryClient]);

    useEffect(() => {
        if (!supabase) return;

        const checkExistingSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                router.replace('/dashboard');
            }
        };

        checkExistingSession();
    }, [router, supabase]);

    const normalizeEmail = () => email.trim().toLowerCase();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email: normalizeEmail(),
            password,
        });

        if (error) {
            setError(formatAuthErrorMessage(error.message));
        } else {
            toast.success('Sesión iniciada correctamente');
            router.push('/dashboard');
            router.refresh();
        }

        setIsLoading(false);
    };

    const handleMagicLink = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (!email) {
            setError('Ingresa tu email para recibir el enlace');
            return;
        }

        setIsLoading(true);

        const { error } = await supabase.auth.signInWithOtp({
            email: normalizeEmail(),
            options: {
                emailRedirectTo: buildCallbackUrl(),
            },
        });

        if (error) {
            setError(formatAuthErrorMessage(error.message));
        } else {
            setSuccessMessage('¡Enlace enviado! Revisa tu bandeja de entrada.');
            setEmail('');
        }

        setIsLoading(false);
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 8) {
            setError('La contraseña debe tener al menos 8 caracteres');
            return;
        }

        setIsLoading(true);
        const passwordValidation = await validatePasswordNotLeaked(password);
        if (!passwordValidation.valid) {
            setError(passwordValidation.message || 'Contraseña insegura.');
            setIsLoading(false);
            return;
        }

        const { error } = await supabase.auth.signUp({
            email: normalizeEmail(),
            password,
            options: {
                emailRedirectTo: buildCallbackUrl(),
                data: {
                    onboarding_completed: false,
                    onboarding_version: 1,
                },
            },
        });

        if (error) {
            setError(formatAuthErrorMessage(error.message));
        } else {
            setSuccessMessage('Cuenta creada. Revisa tu email para confirmar.');
            setEmail('');
            setPassword('');
            setConfirmPassword('');
        }

        setIsLoading(false);
    };

    const handleResetPassword = async () => {
        if (!email) {
            setError('Ingresa tu email para recuperar la contraseña');
            return;
        }

        setIsLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(), {
            redirectTo: buildCallbackUrl(),
        });

        if (error) {
            setError(formatAuthErrorMessage(error.message));
        } else {
            toast.success('Email de recuperación enviado');
        }
        setIsLoading(false);
    };

    if (!supabase) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-background">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Error de configuración</CardTitle>
                        <CardDescription>
                            Falta la configuración de Supabase. Revisa variables de entorno.
                        </CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    const handleGoogleLogin = async () => {
        setError('');
        setIsGoogleLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: buildCallbackUrl(),
            },
        });

        if (error) {
            setError(formatAuthErrorMessage(error.message));
        }
        setIsGoogleLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
                <CardHeader className="text-center">
                    <FinFlowLogo className="mx-auto mb-4 h-16 w-16" />
                    <CardTitle className="text-2xl font-bold tracking-tight">FinFlow</CardTitle>
                    <CardDescription>
                        Gestiona tus finanzas de forma inteligente y fluida
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="login">
                                <LogIn className="h-4 w-4 mr-2" />
                                Ingresar
                            </TabsTrigger>
                            <TabsTrigger value="register">
                                <UserPlus className="h-4 w-4 mr-2" />
                                Registrarse
                            </TabsTrigger>
                        </TabsList>

                        {error && (
                            <Alert variant="destructive" className="mt-4">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {successMessage && (
                            <Alert className="mt-4 bg-emerald-50 border-emerald-200">
                                <AlertDescription className="text-emerald-800">{successMessage}</AlertDescription>
                            </Alert>
                        )}

                        <div className="mt-6 mb-4">
                            <Button
                                variant="outline"
                                type="button"
                                className="w-full flex items-center gap-2"
                                onClick={handleGoogleLogin}
                                disabled={isLoading || isGoogleLoading}
                            >
                                {isGoogleLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Chrome className="h-4 w-4" />
                                )}
                                {activeTab === 'register' ? 'Crear cuenta con Google' : 'Continuar con Google'}
                            </Button>
                            <div className="relative my-4">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-background px-2 text-muted-foreground">O</span>
                                </div>
                            </div>
                        </div>

                        <TabsContent value="login">
                            <div className="flex flex-col gap-4 mt-4">
                                <div className="flex p-1 bg-muted rounded-md self-center mb-2">
                                    <button
                                        onClick={() => setLoginMethod('password')}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all ${loginMethod === 'password' ? 'bg-background shadow' : 'text-muted-foreground'}`}
                                    >
                                        Contraseña
                                    </button>
                                    <button
                                        onClick={() => setLoginMethod('magic-link')}
                                        className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all ${loginMethod === 'magic-link' ? 'bg-background shadow' : 'text-muted-foreground'}`}
                                    >
                                        Magic Link
                                    </button>
                                </div>

                                {loginMethod === 'password' ? (
                                    <form onSubmit={handleLogin} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="email">Email</Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    placeholder="tu@email.com"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    className="pl-10"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="password">Contraseña</Label>
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="password"
                                                    type="password"
                                                    placeholder="••••••••"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="pl-10"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end">
                                            <button
                                                type="button"
                                                className="text-xs text-muted-foreground hover:text-primary transition-colors"
                                                onClick={handleResetPassword}
                                            >
                                                ¿Olvidaste tu contraseña?
                                            </button>
                                        </div>

                                        <Button type="submit" className="w-full h-11" disabled={isLoading}>
                                            {isLoading ? (
                                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Ingresando...</>
                                            ) : (
                                                <><LogIn className="h-4 w-4 mr-2" /> Ingresar</>
                                            )}
                                        </Button>
                                    </form>
                                ) : (
                                    <form onSubmit={handleMagicLink} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="magic-email">Email</Label>
                                            <div className="relative">
                                                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="magic-email"
                                                    type="email"
                                                    placeholder="tu@email.com"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    className="pl-10"
                                                    required
                                                />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">
                                                Te enviaremos un enlace a tu bandeja de entrada para ingresar sin contraseña.
                                            </p>
                                        </div>

                                        <Button type="submit" className="w-full h-11" disabled={isLoading}>
                                            {isLoading ? (
                                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
                                            ) : (
                                                <><Mail className="h-4 w-4 mr-2" /> Enviar Magic Link</>
                                            )}
                                        </Button>
                                    </form>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="register">
                            <form onSubmit={handleRegister} className="space-y-4 mt-4">
                                <div className="space-y-2">
                                    <Label htmlFor="register-email">Email</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="register-email"
                                            type="email"
                                            placeholder="tu@email.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="pl-10"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="register-password">Contraseña</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                                <Input
                                                    id="register-password"
                                                    type="password"
                                                    placeholder="Mínimo 8 caracteres"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="pl-10"
                                                    required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            id="confirm-password"
                                            type="password"
                                            placeholder="Repite la contraseña"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            className="pl-10"
                                            required
                                        />
                                    </div>
                                </div>

                                <Button type="submit" className="w-full h-11" disabled={isLoading}>
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Creando cuenta...
                                        </>
                                    ) : (
                                        <>
                                            <UserPlus className="h-4 w-4 mr-2" />
                                            Crear Cuenta
                                        </>
                                    )}
                                </Button>
                            </form>
                        </TabsContent>
                    </Tabs>

                    <p className="mt-8 text-center text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                        Protegido con encriptación de nivel bancario
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
