'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Mail, Lock, UserPlus, LogIn, Wallet } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthPage() {
    const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loginMethod, setLoginMethod] = useState<'password' | 'magic-link'>('password');

    const router = useRouter();
    const supabase = createClient();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            setError('Email o contraseña incorrectos');
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
            email,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });

        if (error) {
            setError(error.message);
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

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setIsLoading(true);

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
        });

        if (error) {
            setError(error.message);
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
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback`,
        });

        if (error) {
            setError(error.message);
        } else {
            toast.success('Email de recuperación enviado');
        }
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="w-full max-w-md shadow-xl border-t-4 border-t-primary">
                <CardHeader className="text-center">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <Wallet className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold tracking-tight">Mi Control Financiero</CardTitle>
                    <CardDescription>
                        Gestiona tus finanzas de forma segura y eficiente
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
                                            placeholder="Mínimo 6 caracteres"
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
