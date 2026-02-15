'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { FinFlowLogo } from '@/components/ui/finflow-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Brain, CheckCircle2, LockKeyhole, Paperclip, Shield, Sparkles } from 'lucide-react';
import { enableAppLock } from '@/lib/app-lock';

const NET_WORTH_VISIBILITY_KEY = 'finansas-net-worth-visible';

type StepId = 0 | 1 | 2 | 3;

function clampStep(step: number): StepId {
    if (step <= 0) return 0;
    if (step >= 3) return 3;
    return step as StepId;
}

export default function OnboardingPage() {
    const router = useRouter();
    const [step, setStep] = useState<StepId>(0);
    const [isLoadingUser, setIsLoadingUser] = useState(true);
    const [isFinishing, setIsFinishing] = useState(false);

    const [fullName, setFullName] = useState('');
    const [hideNetWorth, setHideNetWorth] = useState(false);
    const [enableLock, setEnableLock] = useState(false);
    const [pin, setPin] = useState('');
    const [pin2, setPin2] = useState('');

    const progress = useMemo(() => {
        return Math.round(((step + 1) / 4) * 100);
    }, [step]);

    useEffect(() => {
        const supabase = createClient();
        if (!supabase) {
            setIsLoadingUser(false);
            return;
        }

        const load = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                    window.location.href = '/auth';
                    return;
                }

                const completed = user?.user_metadata?.onboarding_completed;
                if (completed === true) {
                    router.replace('/dashboard');
                    return;
                }

                setFullName(String(user?.user_metadata?.full_name || ''));
            } finally {
                setIsLoadingUser(false);
            }
        };

        void load();
    }, [router]);

    const next = () => setStep((prev) => clampStep(prev + 1));
    const back = () => setStep((prev) => clampStep(prev - 1));

    const persistNetWorthPreference = (hidden: boolean) => {
        try {
            window.localStorage.setItem(NET_WORTH_VISIBILITY_KEY, hidden ? 'hidden' : 'visible');
        } catch {
            // no-op
        }
    };

    const finish = async () => {
        setIsFinishing(true);
        try {
            persistNetWorthPreference(hideNetWorth);

            if (enableLock) {
                const normalizedPin = pin.replace(/\s+/g, '').trim();
                const normalizedPin2 = pin2.replace(/\s+/g, '').trim();
                if (!/^\d{4,6}$/.test(normalizedPin)) {
                    toast.error('El PIN debe tener 4 a 6 dígitos.');
                    return;
                }
                if (normalizedPin !== normalizedPin2) {
                    toast.error('Los PIN no coinciden.');
                    return;
                }

                await enableAppLock(normalizedPin);
            }

            const supabase = createClient();
            if (!supabase) {
                toast.error('Falta configuración de Supabase.');
                return;
            }

            const metadata: Record<string, any> = {
                onboarding_completed: true,
                onboarding_completed_at: new Date().toISOString(),
                onboarding_version: 1,
            };

            const trimmedName = fullName.trim();
            if (trimmedName) {
                metadata.full_name = trimmedName;
            }

            const { error } = await supabase.auth.updateUser({ data: metadata });
            if (error) {
                toast.error(error.message || 'No se pudo finalizar el onboarding.');
                return;
            }

            toast.success('Listo. Bienvenido/a.');
            router.replace('/dashboard');
            router.refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo finalizar el onboarding.');
        } finally {
            setIsFinishing(false);
        }
    };

    const steps = [
        {
            id: 0 as const,
            title: 'Bienvenido a FinFlow',
            subtitle: 'Una app simple, rápida y con IA para ordenar tus finanzas.',
            icon: Sparkles,
            body: (
                <div className="space-y-3 text-sm text-muted-foreground">
                    <div className="grid gap-2">
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                            <p><span className="font-semibold text-foreground">Transacciones</span>: ingresos y gastos con historial.</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                            <p><span className="font-semibold text-foreground">Obligaciones</span>: resúmenes/facturas con vencimientos.</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                            <p><span className="font-semibold text-foreground">Copilot</span>: adjuntá un PDF/foto y confirmá lo detectado.</p>
                        </div>
                        <div className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                            <p><span className="font-semibold text-foreground">Asistente</span>: preguntá, planificá y registrá con comandos.</p>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: 1 as const,
            title: 'Privacidad primero',
            subtitle: 'Controlás lo que se muestra y lo que se adjunta.',
            icon: Shield,
            body: (
                <div className="space-y-4">
                    <label className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/10 p-4 text-sm">
                        <div className="space-y-0.5">
                            <p className="font-semibold">Ocultar patrimonio por defecto</p>
                            <p className="text-xs text-muted-foreground">Ideal si mostrás la app en público o a tu familia.</p>
                        </div>
                        <input
                            type="checkbox"
                            className="h-5 w-5 accent-primary"
                            checked={hideNetWorth}
                            onChange={(e) => setHideNetWorth(e.target.checked)}
                        />
                    </label>

                    <div className="rounded-2xl border bg-muted/10 p-4 text-sm text-muted-foreground">
                        <p className="font-semibold text-foreground mb-1">Modo privado (sin adjuntos)</p>
                        <p>
                            Para resúmenes de tarjeta podés cargar saldo, mínimo y vencimiento sin subir el PDF.
                            Si querés, después lo analizás con el asistente.
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: 2 as const,
            title: 'Tu perfil',
            subtitle: 'Un toque para que se sienta tuya.',
            icon: Brain,
            body: (
                <div className="space-y-4">
                    <div className="rounded-2xl border bg-muted/10 p-4 space-y-2">
                        <p className="text-sm font-semibold">Nombre visible</p>
                        <Input
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Ej: Walter"
                            className="h-11"
                        />
                        <p className="text-xs text-muted-foreground">
                            Esto aparece en el header. Podés cambiarlo después en Perfil.
                        </p>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-2xl border bg-muted/10 p-4 text-sm">
                            <div className="flex items-center gap-2 font-semibold">
                                <Paperclip className="h-4 w-4 text-primary" />
                                Adjuntar resumen
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Probá Copilot con un PDF o foto.</p>
                        </div>
                        <div className="rounded-2xl border bg-muted/10 p-4 text-sm">
                            <div className="flex items-center gap-2 font-semibold">
                                <Brain className="h-4 w-4 text-primary" />
                                Preguntar al asistente
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Usalo para prioridades de pago y consejos.</p>
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: 3 as const,
            title: 'Bloqueo premium',
            subtitle: 'Protegé la app en este dispositivo.',
            icon: LockKeyhole,
            body: (
                <div className="space-y-4">
                    <label className="flex items-center justify-between gap-3 rounded-2xl border bg-muted/10 p-4 text-sm">
                        <div className="space-y-0.5">
                            <p className="font-semibold">Activar bloqueo con PIN</p>
                            <p className="text-xs text-muted-foreground">Se pide PIN al abrir la app (solo este dispositivo).</p>
                        </div>
                        <input
                            type="checkbox"
                            className="h-5 w-5 accent-primary"
                            checked={enableLock}
                            onChange={(e) => setEnableLock(e.target.checked)}
                        />
                    </label>

                    {enableLock && (
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                placeholder="PIN (4-6 dígitos)"
                                type="password"
                                inputMode="numeric"
                                autoComplete="new-password"
                                className="h-11 text-center tracking-[0.35em]"
                            />
                            <Input
                                value={pin2}
                                onChange={(e) => setPin2(e.target.value)}
                                placeholder="Repetir PIN"
                                type="password"
                                inputMode="numeric"
                                autoComplete="new-password"
                                className="h-11 text-center tracking-[0.35em]"
                            />
                        </div>
                    )}

                    <div className="rounded-2xl border bg-muted/10 p-4 text-xs text-muted-foreground">
                        Tip: cuando la publiquemos en stores, podemos sumar huella/FaceID (biometría) para desbloquear.
                    </div>
                </div>
            ),
        },
    ];

    const current = steps[step];

    if (isLoadingUser) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="glass-card rounded-[2.5rem] border-0 p-6 text-center space-y-3">
                    <FinFlowLogo className="h-16 w-16 mx-auto" />
                    <p className="text-sm text-muted-foreground">Preparando tu experiencia...</p>
                    <Progress value={35} className="h-2" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            <div className="relative min-h-screen overflow-hidden px-4 py-8">
                <div className="absolute inset-0 premium-gradient opacity-15" />
                <div className="absolute -top-24 right-[-6rem] h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
                <div className="absolute -bottom-24 left-[-6rem] h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />

                <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col justify-center">
                    <div className="mx-auto w-full space-y-5">
                        <div className="text-center space-y-2">
                            <FinFlowLogo className="h-16 w-16 mx-auto" />
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                                Configuración inicial
                            </p>
                        </div>

                        <div className="glass-card rounded-[2.8rem] border-0 p-6 md:p-8 space-y-5">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                                    <current.icon className="h-4 w-4 text-primary" />
                                    Paso {step + 1} de 4
                                </div>
                                <h1 className="text-3xl font-black tracking-tight">{current.title}</h1>
                                <p className="text-sm text-muted-foreground">{current.subtitle}</p>
                            </div>

                            <Progress value={progress} className="h-2" />

                            {current.body}

                            <div className="flex items-center justify-between pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={back}
                                    disabled={step === 0 || isFinishing}
                                >
                                    Atrás
                                </Button>

                                {step < 3 ? (
                                    <Button type="button" onClick={next} disabled={isFinishing}>
                                        Siguiente
                                    </Button>
                                ) : (
                                    <Button type="button" onClick={() => void finish()} disabled={isFinishing}>
                                        {isFinishing ? 'Guardando...' : 'Finalizar'}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="text-center text-xs text-muted-foreground">
                            Podés cambiar todo después en <span className="font-semibold text-foreground">Perfil</span>.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

