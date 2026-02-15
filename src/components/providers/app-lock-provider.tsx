'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FinFlowLogo } from '@/components/ui/finflow-logo';
import { createClient } from '@/lib/supabase-browser';
import {
    clearAppLockSessionUnlocked,
    disableAppLock,
    isAppLockEnabled,
    isAppLockSessionUnlocked,
    markAppLockSessionUnlocked,
    verifyAppLockPin,
} from '@/lib/app-lock';
import { Loader2, LockKeyhole, LogOut, RotateCcw } from 'lucide-react';

type LockState = 'checking' | 'locked' | 'unlocked';

export function AppLockProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isExcludedRoute = useMemo(() => pathname === '/dashboard/onboarding', [pathname]);
    const [state, setState] = useState<LockState>('checking');
    const [pin, setPin] = useState('');
    const [isUnlocking, setIsUnlocking] = useState(false);

    useEffect(() => {
        if (isExcludedRoute) {
            setState('unlocked');
            return;
        }

        try {
            if (!isAppLockEnabled()) {
                setState('unlocked');
                return;
            }

            setState(isAppLockSessionUnlocked() ? 'unlocked' : 'locked');
        } catch {
            setState('unlocked');
        }
    }, [isExcludedRoute]);

    const signOut = async () => {
        const supabase = createClient();
        try {
            await supabase?.auth.signOut();
        } catch {
            // no-op
        } finally {
            window.location.href = '/auth';
        }
    };

    const handleUnlock = async () => {
        if (!pin.trim()) return;
        setIsUnlocking(true);
        try {
            const ok = await verifyAppLockPin(pin);
            if (!ok) {
                toast.error('PIN incorrecto.');
                return;
            }
            markAppLockSessionUnlocked();
            setPin('');
            setState('unlocked');
            toast.success('Desbloqueado.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo desbloquear.');
        } finally {
            setIsUnlocking(false);
        }
    };

    const handleResetLock = async () => {
        const approved = window.confirm(
            'Esto desactiva el bloqueo en este dispositivo y cierra sesión. ' +
            'Luego podrás iniciar sesión nuevamente.\n\n¿Continuar?'
        );
        if (!approved) return;

        try {
            disableAppLock();
            clearAppLockSessionUnlocked();
        } catch {
            // no-op
        }

        await signOut();
    };

    if (state === 'checking') {
        return (
            <div className="min-h-[100dvh] flex items-center justify-center p-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    if (state === 'unlocked') {
        return <>{children}</>;
    }

    return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-5">
                <div className="text-center space-y-2">
                    <FinFlowLogo className="h-16 w-16 mx-auto" />
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">Bloqueo activo</p>
                    <h1 className="text-2xl font-black tracking-tight">Ingresá tu PIN</h1>
                    <p className="text-sm text-muted-foreground">
                        Este bloqueo es local en este dispositivo.
                    </p>
                </div>

                <div className="glass-card rounded-[2rem] border-0 p-5 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <LockKeyhole className="h-4 w-4 text-primary" />
                        Desbloquear
                    </div>

                    <Input
                        value={pin}
                        onChange={(event) => setPin(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleUnlock();
                            }
                        }}
                        type="password"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="PIN (4-6 dígitos)"
                        className="h-11 text-center tracking-[0.45em]"
                        disabled={isUnlocking}
                    />

                    <Button
                        type="button"
                        className="w-full h-11 gap-2"
                        onClick={() => void handleUnlock()}
                        disabled={isUnlocking || !pin.trim()}
                    >
                        {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                        Desbloquear
                    </Button>

                    <div className="grid grid-cols-2 gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="h-10 gap-2"
                            onClick={() => void signOut()}
                            disabled={isUnlocking}
                            title="Cerrar sesión"
                        >
                            <LogOut className="h-4 w-4" />
                            Salir
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="h-10 gap-2"
                            onClick={() => void handleResetLock()}
                            disabled={isUnlocking}
                            title="Desactivar bloqueo y cerrar sesión"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Reiniciar
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

