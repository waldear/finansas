'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase-browser';
import { Crown, ExternalLink, Loader2, LockKeyhole, Save, ShieldCheck, UserCircle2, Users, Plus, Link2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { disableAppLock, enableAppLock, isAppLockEnabled, verifyAppLockPin } from '@/lib/app-lock';
import { useSpace } from '@/components/providers/space-provider';

function providerLabel(provider: string) {
    if (provider === 'google') return 'Google';
    if (provider === 'email') return 'Correo y contraseña';
    return provider;
}

export default function ProfilePage() {
    const { spaces, activeSpaceId, activeSpace, isLoading: isLoadingSpaces, error: spacesError, refresh, setActiveSpace } = useSpace();
    const [user, setUser] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [fullName, setFullName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [billing, setBilling] = useState<any>(null);
    const [isLoadingBilling, setIsLoadingBilling] = useState(false);
    const [isStartingCheckout, setIsStartingCheckout] = useState(false);
    const [isOpeningPortal, setIsOpeningPortal] = useState(false);
    const [deviceLockEnabled, setDeviceLockEnabled] = useState(false);
    const [isUpdatingDeviceLock, setIsUpdatingDeviceLock] = useState(false);
    const [deviceLockCurrentPin, setDeviceLockCurrentPin] = useState('');
    const [deviceLockNewPin, setDeviceLockNewPin] = useState('');
    const [deviceLockNewPin2, setDeviceLockNewPin2] = useState('');

    const [spaceName, setSpaceName] = useState('Familia');
    const [isCreatingSpace, setIsCreatingSpace] = useState(false);
    const [joinCode, setJoinCode] = useState('');
    const [isJoiningSpace, setIsJoiningSpace] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [inviteExpiresInDays, setInviteExpiresInDays] = useState('');
    const [isCreatingInvite, setIsCreatingInvite] = useState(false);
    const [inviteCopied, setInviteCopied] = useState(false);

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

    useEffect(() => {
        try {
            setDeviceLockEnabled(isAppLockEnabled());
        } catch {
            setDeviceLockEnabled(false);
        }
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

    const handleEnableDeviceLock = async () => {
        const pin = deviceLockNewPin.replace(/\s+/g, '').trim();
        const pin2 = deviceLockNewPin2.replace(/\s+/g, '').trim();

        if (!/^\d{4,6}$/.test(pin)) {
            toast.error('El PIN debe tener 4 a 6 dígitos.');
            return;
        }
        if (pin !== pin2) {
            toast.error('Los PIN no coinciden.');
            return;
        }

        setIsUpdatingDeviceLock(true);
        try {
            await enableAppLock(pin);
            setDeviceLockEnabled(true);
            setDeviceLockNewPin('');
            setDeviceLockNewPin2('');
            toast.success('Bloqueo activado en este dispositivo.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo activar el bloqueo.');
        } finally {
            setIsUpdatingDeviceLock(false);
        }
    };

    const handleDisableDeviceLock = async () => {
        const currentPin = deviceLockCurrentPin.replace(/\s+/g, '').trim();
        if (!/^\d{4,6}$/.test(currentPin)) {
            toast.error('Ingresa tu PIN actual para desactivar.');
            return;
        }

        setIsUpdatingDeviceLock(true);
        try {
            const ok = await verifyAppLockPin(currentPin);
            if (!ok) {
                toast.error('PIN incorrecto.');
                return;
            }
            disableAppLock();
            setDeviceLockEnabled(false);
            setDeviceLockCurrentPin('');
            toast.success('Bloqueo desactivado en este dispositivo.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo desactivar el bloqueo.');
        } finally {
            setIsUpdatingDeviceLock(false);
        }
    };

    const handleChangeDeviceLockPin = async () => {
        const currentPin = deviceLockCurrentPin.replace(/\s+/g, '').trim();
        const nextPin = deviceLockNewPin.replace(/\s+/g, '').trim();
        const nextPin2 = deviceLockNewPin2.replace(/\s+/g, '').trim();

        if (!/^\d{4,6}$/.test(currentPin)) {
            toast.error('Ingresa tu PIN actual.');
            return;
        }
        if (!/^\d{4,6}$/.test(nextPin)) {
            toast.error('El nuevo PIN debe tener 4 a 6 dígitos.');
            return;
        }
        if (nextPin !== nextPin2) {
            toast.error('Los nuevos PIN no coinciden.');
            return;
        }

        setIsUpdatingDeviceLock(true);
        try {
            const ok = await verifyAppLockPin(currentPin);
            if (!ok) {
                toast.error('PIN actual incorrecto.');
                return;
            }

            await enableAppLock(nextPin);
            setDeviceLockEnabled(true);
            setDeviceLockCurrentPin('');
            setDeviceLockNewPin('');
            setDeviceLockNewPin2('');
            toast.success('PIN actualizado.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el PIN.');
        } finally {
            setIsUpdatingDeviceLock(false);
        }
    };

    const handleCreateSpace = async () => {
        const name = spaceName.trim();
        if (!name) {
            toast.error('Poné un nombre para el espacio.');
            return;
        }

        setIsCreatingSpace(true);
        try {
            const response = await fetch('/api/spaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, type: 'family' }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.error || 'No se pudo crear el espacio.');
            }

            toast.success('Espacio creado');
            setSpaceName('Familia');
            setInviteCode(null);
            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo crear el espacio.');
        } finally {
            setIsCreatingSpace(false);
        }
    };

    const handleJoinSpace = async () => {
        const code = joinCode.trim();
        if (!code) {
            toast.error('Pegá el código de invitación.');
            return;
        }

        setIsJoiningSpace(true);
        try {
            const response = await fetch('/api/spaces/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ code }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.error || 'No se pudo unir al espacio.');
            }

            toast.success('Te uniste al espacio');
            setJoinCode('');
            setInviteCode(null);
            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo unir al espacio.');
        } finally {
            setIsJoiningSpace(false);
        }
    };

    const handleCreateInvite = async () => {
        if (!activeSpaceId) return;
        if (activeSpace?.type !== 'family') {
            toast.error('Primero crea o activa un espacio de Familia.');
            return;
        }

        const expiresDays = inviteExpiresInDays.trim() ? Number(inviteExpiresInDays.trim()) : null;
        if (expiresDays != null && (!Number.isFinite(expiresDays) || expiresDays <= 0)) {
            toast.error('Vencimiento inválido. Dejalo vacío o poné un número mayor a 0.');
            return;
        }

        setIsCreatingInvite(true);
        try {
            const response = await fetch('/api/spaces/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    spaceId: activeSpaceId,
                    expiresInDays: expiresDays,
                }),
            });
            const body = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(body?.error || 'No se pudo crear la invitación.');
            }
            const code = body?.invite?.code ? String(body.invite.code) : null;
            if (!code) {
                throw new Error('No recibimos el código de invitación.');
            }
            setInviteCode(code);
            setInviteCopied(false);
            toast.success('Código generado');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo crear la invitación.');
        } finally {
            setIsCreatingInvite(false);
        }
    };

    const handleCopyInvite = async () => {
        if (!inviteCode) return;
        try {
            await navigator.clipboard.writeText(inviteCode);
            setInviteCopied(true);
            setTimeout(() => setInviteCopied(false), 1200);
        } catch {
            toast.error('No pudimos copiar. Seleccioná el texto y copiá manualmente.');
        }
    };

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

                        <div className="rounded-lg border p-3 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="flex items-center gap-2 text-sm font-medium">
                                    <LockKeyhole className="h-4 w-4 text-primary" />
                                    Bloqueo de la app (este dispositivo)
                                </p>
                                <Badge variant={deviceLockEnabled ? 'default' : 'secondary'}>
                                    {deviceLockEnabled ? 'ACTIVO' : 'INACTIVO'}
                                </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                Protege el acceso con PIN. Solo aplica en este dispositivo/navegador (no en tu cuenta).
                            </p>

                            {deviceLockEnabled ? (
                                <div className="grid gap-2">
                                    <Input
                                        value={deviceLockCurrentPin}
                                        onChange={(event) => setDeviceLockCurrentPin(event.target.value)}
                                        placeholder="PIN actual"
                                        type="password"
                                        inputMode="numeric"
                                        autoComplete="current-password"
                                        className="h-10 text-center tracking-[0.35em]"
                                        disabled={isUpdatingDeviceLock}
                                    />
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input
                                            value={deviceLockNewPin}
                                            onChange={(event) => setDeviceLockNewPin(event.target.value)}
                                            placeholder="Nuevo PIN"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="new-password"
                                            className="h-10 text-center tracking-[0.35em]"
                                            disabled={isUpdatingDeviceLock}
                                        />
                                        <Input
                                            value={deviceLockNewPin2}
                                            onChange={(event) => setDeviceLockNewPin2(event.target.value)}
                                            placeholder="Repetir nuevo PIN"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="new-password"
                                            className="h-10 text-center tracking-[0.35em]"
                                            disabled={isUpdatingDeviceLock}
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void handleChangeDeviceLockPin()}
                                            disabled={isUpdatingDeviceLock}
                                        >
                                            Cambiar PIN
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => void handleDisableDeviceLock()}
                                            disabled={isUpdatingDeviceLock}
                                        >
                                            Desactivar
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <Input
                                            value={deviceLockNewPin}
                                            onChange={(event) => setDeviceLockNewPin(event.target.value)}
                                            placeholder="PIN (4-6 dígitos)"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="new-password"
                                            className="h-10 text-center tracking-[0.35em]"
                                            disabled={isUpdatingDeviceLock}
                                        />
                                        <Input
                                            value={deviceLockNewPin2}
                                            onChange={(event) => setDeviceLockNewPin2(event.target.value)}
                                            placeholder="Repetir PIN"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="new-password"
                                            className="h-10 text-center tracking-[0.35em]"
                                            disabled={isUpdatingDeviceLock}
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="w-fit"
                                        onClick={() => void handleEnableDeviceLock()}
                                        disabled={isUpdatingDeviceLock}
                                    >
                                        Activar bloqueo
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card id="spaces">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        Espacios y familia
                    </CardTitle>
                    <CardDescription>
                        Crea un espacio compartido para probar la app con tu familia. Todo lo que registres dentro de un espacio se comparte entre sus miembros.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {spacesError ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                            {spacesError}
                        </div>
                    ) : null}

                    <div className="rounded-lg border p-3">
                        <p className="text-sm font-semibold">Espacio activo</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {isLoadingSpaces ? 'Cargando...' : activeSpace ? `${activeSpace.name} (${activeSpace.type})` : 'Sin espacio activo'}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <p className="text-sm font-semibold">Tus espacios</p>
                        <div className="space-y-2">
                            {spaces.map((space) => {
                                const isActive = space.id === activeSpaceId;
                                return (
                                    <div key={space.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold">{space.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {space.type === 'family' ? 'Familia' : 'Personal'} • {space.role.toUpperCase()} • {space.id.slice(0, 8)}...
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isActive ? (
                                                <Badge>ACTIVO</Badge>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void setActiveSpace(space.id)}
                                                    disabled={isLoadingSpaces}
                                                >
                                                    Activar
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            {!isLoadingSpaces && spaces.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Aún no hay espacios.</p>
                            ) : null}
                        </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border p-4 space-y-3">
                            <p className="text-sm font-semibold flex items-center gap-2">
                                <Plus className="h-4 w-4" />
                                Crear espacio Familia
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="space-name">Nombre</Label>
                                <Input
                                    id="space-name"
                                    value={spaceName}
                                    onChange={(event) => setSpaceName(event.target.value)}
                                    placeholder="Ej: Familia Pérez"
                                    disabled={isCreatingSpace}
                                />
                            </div>
                            <Button type="button" onClick={() => void handleCreateSpace()} disabled={isCreatingSpace} className="w-full gap-2">
                                {isCreatingSpace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Crear
                            </Button>
                        </div>

                        <div className="rounded-xl border p-4 space-y-3">
                            <p className="text-sm font-semibold flex items-center gap-2">
                                <Link2 className="h-4 w-4" />
                                Unirme con código
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="join-code">Código</Label>
                                <Input
                                    id="join-code"
                                    value={joinCode}
                                    onChange={(event) => setJoinCode(event.target.value)}
                                    placeholder="Pegá el código de invitación"
                                    disabled={isJoiningSpace}
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                />
                            </div>
                            <Button type="button" variant="outline" onClick={() => void handleJoinSpace()} disabled={isJoiningSpace} className="w-full gap-2">
                                {isJoiningSpace ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                                Unirme
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-xl border p-4 space-y-3">
                        <p className="text-sm font-semibold flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Invitar a un familiar
                        </p>
                        <p className="text-xs text-muted-foreground">
                            Genera un código y compártelo. Cualquiera con el código podrá unirse al espacio (no lo compartas con desconocidos).
                        </p>

                        <div className="grid gap-3 md:grid-cols-3 md:items-end">
                            <div className="md:col-span-1 space-y-2">
                                <Label htmlFor="invite-exp">Vence en (días)</Label>
                                <Input
                                    id="invite-exp"
                                    value={inviteExpiresInDays}
                                    onChange={(event) => setInviteExpiresInDays(event.target.value)}
                                    placeholder="Opcional"
                                    inputMode="numeric"
                                    disabled={isCreatingInvite}
                                />
                                <p className="text-[11px] text-muted-foreground">Vacío = sin vencimiento.</p>
                            </div>
                            <div className="md:col-span-2 flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    onClick={() => void handleCreateInvite()}
                                    disabled={isCreatingInvite || !activeSpaceId || activeSpace?.type !== 'family'}
                                    className="gap-2"
                                >
                                    {isCreatingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                                    Generar código
                                </Button>

                                {inviteCode ? (
                                    <div className="flex flex-1 items-center gap-2 rounded-lg border px-3 py-2">
                                        <code className="flex-1 select-all break-all text-xs">{inviteCode}</code>
                                        <Button type="button" size="icon" variant="outline" onClick={() => void handleCopyInvite()} aria-label="Copiar código">
                                            {inviteCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex-1 text-xs text-muted-foreground self-center">Genera un código para mostrarlo acá.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

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
