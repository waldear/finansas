'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase-browser';
import { Crown, ExternalLink, Loader2, Save, ShieldCheck, UserCircle2 } from 'lucide-react';
import { toast } from 'sonner';

function providerLabel(provider: string) {
    if (provider === 'google') return 'Google';
    if (provider === 'email') return 'Correo y contraseña';
    return provider;
}

export default function ProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [billing, setBilling] = useState<any>(null);
    const [isLoadingBilling, setIsLoadingBilling] = useState(false);
    const [isStartingCheckout, setIsStartingCheckout] = useState(false);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);

    useEffect(() => {
        const supabase = createClient();
        if (!supabase) {
            setIsLoading(false);
            return;
        }

        const loadUser = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) {
                window.location.href = '/auth';
                return;
            }

            setUser(currentUser);
            setFullName(currentUser.user_metadata?.full_name || '');
            setAvatarUrl(currentUser.user_metadata?.avatar_url || '');
            setIsLoading(false);
        };

        loadUser();
    }, []);

    useEffect(() => {
        const loadBilling = async () => {
            try {
                setIsLoadingBilling(true);
                const response = await fetch('/api/billing/entitlement', {
                    credentials: 'include',
                    cache: 'no-store',
                });
                const payload = await response.json().catch(() => null);
                if (!response.ok) {
                    return;
                }
                setBilling(payload);
            } catch {
                // no-op
            } finally {
                setIsLoadingBilling(false);
            }
        };

        void loadBilling();
    }, []);

    const providers = useMemo(() => {
        const fromApp = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [];
        const fromIdentities = Array.isArray(user?.identities)
            ? user.identities.map((identity: any) => identity?.provider).filter(Boolean)
            : [];
        const set = new Set<string>([...fromApp, ...fromIdentities]);
        if (set.size === 0 && user?.email) set.add('email');
        return Array.from(set);
    }, [user]);

    const previewAvatar = avatarUrl?.trim()
        ? avatarUrl.trim()
        : `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`;

    const handleSave = async () => {
        const supabase = createClient();
        if (!supabase) {
            toast.error('Falta configuración de Supabase');
            return;
        }

        setIsSaving(true);
        const metadata = {
            full_name: fullName.trim(),
            avatar_url: avatarUrl.trim() || null,
        };

        const { data, error } = await supabase.auth.updateUser({ data: metadata });

        if (error) {
            toast.error(error.message || 'No se pudo guardar el perfil');
            setIsSaving(false);
            return;
        }

        if (data.user) {
            setUser(data.user);
            setFullName(data.user.user_metadata?.full_name || '');
            setAvatarUrl(data.user.user_metadata?.avatar_url || '');
        }

        toast.success('Perfil actualizado');
        setIsSaving(false);
    };

    const handleStartCheckout = async () => {
        setIsStartingCheckout(true);
        try {
            const response = await fetch('/api/billing/checkout', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                if (response.status === 409) {
                    toast.info(payload?.error || 'Tu suscripción Pro ya está activa.');
                    return;
                }
                throw new Error(payload?.error || 'No se pudo iniciar el checkout.');
            }

            if (!payload?.url) {
                throw new Error('Stripe no devolvió URL de checkout.');
            }

            window.location.assign(payload.url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo iniciar el checkout.');
        } finally {
            setIsStartingCheckout(false);
        }
    };

    const handleOpenPortal = async () => {
        setIsOpeningPortal(true);
        try {
            const response = await fetch('/api/billing/portal', {
                method: 'POST',
                credentials: 'include',
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                throw new Error(payload?.error || 'No se pudo abrir el portal de suscripción.');
            }

            if (!payload?.url) {
                throw new Error('Stripe no devolvió URL del portal.');
            }

            window.location.assign(payload.url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo abrir el portal de suscripción.');
        } finally {
            setIsOpeningPortal(false);
        }
    };

    const billingPlan = billing?.plan === 'pro' ? 'pro' : 'free';
    const billingProvider = typeof billing?.provider === 'string' ? billing.provider : 'none';
    const remaining = Number(billing?.usage?.remainingRequests ?? 0);
    const limit = Number(billing?.usage?.limitRequests ?? 0);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) {
        return (
            <Card className="max-w-xl">
                <CardHeader>
                    <CardTitle>Error de sesión</CardTitle>
                    <CardDescription>No encontramos una sesión activa.</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Perfil</h2>
                <p className="text-muted-foreground">Edita tus datos y revisa cómo inicias sesión.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Datos de usuario</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={previewAvatar}
                                alt="Avatar de perfil"
                                className="h-16 w-16 rounded-full border bg-muted object-cover"
                            />
                            <div>
                                <p className="text-sm font-semibold">{fullName || 'Sin nombre'}</p>
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="profile-name">Nombre visible</Label>
                            <Input
                                id="profile-name"
                                value={fullName}
                                onChange={(event) => setFullName(event.target.value)}
                                placeholder="Ej: Walter"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="profile-avatar">URL de foto de perfil</Label>
                            <Input
                                id="profile-avatar"
                                value={avatarUrl}
                                onChange={(event) => setAvatarUrl(event.target.value)}
                                placeholder="https://..."
                            />
                        </div>

                        <Button type="button" onClick={handleSave} disabled={isSaving} className="w-full gap-2">
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Guardar cambios
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" />
                            Acceso y seguridad
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-sm font-semibold">Métodos de inicio de sesión activos</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {providers.map((provider) => (
                                    <Badge key={provider} variant="secondary">
                                        {providerLabel(provider)}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">Sugerencia</p>
                            <p className="mt-1">
                                Si usas Google y correo/contraseña, podrás entrar aunque un proveedor falle.
                            </p>
                        </div>

                        <div className="rounded-lg border p-3">
                            <p className="flex items-center gap-2 text-sm font-medium">
                                <UserCircle2 className="h-4 w-4" />
                                UID de usuario
                            </p>
                            <p className="mt-1 break-all text-xs text-muted-foreground">{user.id}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Crown className="h-5 w-5 text-primary" />
                        Plan y suscripción
                    </CardTitle>
                    <CardDescription>
                        Gestiona tu plan Pro y revisa tu uso del asistente.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoadingBilling ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cargando estado...
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Badge variant={billingPlan === 'pro' ? 'default' : 'secondary'}>
                                        {billingPlan === 'pro' ? 'PRO' : 'FREE'}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        Provider: {billingProvider}
                                    </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Asistente: {remaining}/{limit} requests restantes este mes
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {billingPlan !== 'pro' && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleStartCheckout}
                                        disabled={isStartingCheckout || isOpeningPortal}
                                        className="gap-2"
                                    >
                                        {isStartingCheckout ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                                        Pasar a Pro
                                    </Button>
                                )}
                                {(billingProvider === 'stripe' || billingPlan === 'pro') && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleOpenPortal}
                                        disabled={isOpeningPortal || isStartingCheckout}
                                        className="gap-2"
                                    >
                                        {isOpeningPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                                        Gestionar suscripción
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">Tip</p>
                        <p className="mt-1">
                            Si estás en modo test, usa la tarjeta <span className="font-mono">4242 4242 4242 4242</span> para probar el checkout.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
