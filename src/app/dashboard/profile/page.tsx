'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase-browser';
import { Loader2, Save, ShieldCheck, UserCircle2 } from 'lucide-react';
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
        </div>
    );
}
