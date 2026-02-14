'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
    BarChart3,
    Brain,
    Bot,
    CreditCard,
    Home,
    LogOut,
    Moon,
    PiggyBank,
    Settings,
    Sun,
    UserCircle2,
    Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase-browser';
import { NotificationCenter } from '@/components/layout/notification-center';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { applyTheme, AppTheme, getStoredTheme } from '@/lib/theme';
import { AssistantAttachmentProvider } from '@/components/providers/assistant-attachment-provider';

function AssistantBrainIcon({ className }: { className?: string }) {
    return (
        <span className={cn('relative inline-flex items-center justify-center', className)}>
            <Bot className="h-8 w-8" />
            <span className="absolute left-[8px] top-[11px] h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <span className="absolute right-[8px] top-[11px] h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
            <Brain className="absolute -right-1 -top-1 h-3.5 w-3.5 text-cyan-300" strokeWidth={2.25} />
        </span>
    );
}

const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home, href: '/dashboard' },
    { id: 'charts', label: 'Stats', icon: BarChart3, href: '/dashboard/charts' },
    { id: 'action', label: 'Asistente', icon: AssistantBrainIcon, href: '/dashboard/assistant', isAction: true },
    { id: 'debts', label: 'Cards', icon: CreditCard, href: '/dashboard/debts' },
    { id: 'profile', label: 'Metas', icon: PiggyBank, href: '/dashboard/savings' },
];

function DashboardShellInner({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const [user, setUser] = useState<any>(null);
    const [theme, setTheme] = useState<AppTheme>('light');

    useEffect(() => {
        const supabase = createClient();
        if (!supabase) return;

        const getUser = async () => {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            setUser(currentUser);
        };

        getUser();
    }, []);

    useEffect(() => {
        const storedTheme = getStoredTheme();
        setTheme(storedTheme);
        applyTheme(storedTheme);
    }, []);

    const userNick = useMemo(() => {
        const email = typeof user?.email === 'string' ? user.email : '';
        const nickFromEmail = email.split('@')[0]?.split('+')[0]?.trim();

        if (nickFromEmail) {
            return nickFromEmail;
        }

        return user?.user_metadata?.full_name?.split(' ')[0] || 'Usuario';
    }, [user]);

    const handleThemeChange = (nextTheme: AppTheme) => {
        setTheme(nextTheme);
        applyTheme(nextTheme);
    };

    const handleSignOut = async () => {
        const supabase = createClient();
        queryClient.clear();
        if (!supabase) {
            window.location.href = '/auth';
            return;
        }
        await supabase.auth.signOut();
        window.location.href = '/auth';
    };

    return (
        <div className="min-h-screen bg-background text-foreground pb-24 md:pb-0 md:pl-20">
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl">
                <div className="container flex h-20 items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className="relative h-12 w-12 rounded-full border-2 border-primary/20 p-0.5 transition hover:border-primary/40"
                                    aria-label="Abrir configuración de perfil"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`}
                                        alt="Avatar"
                                        className="h-full w-full rounded-full bg-muted"
                                    />
                                    <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-72 p-0">
                                <div className="border-b p-4">
                                    <p className="flex items-center gap-2 text-sm font-semibold">
                                        <Settings className="h-4 w-4" />
                                        Configuración
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">{user?.email || 'Sin email'}</p>
                                </div>

                                <div className="border-b p-2">
                                    <Link
                                        href="/dashboard/profile"
                                        className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted"
                                    >
                                        <UserCircle2 className="h-4 w-4" />
                                        Mi perfil
                                    </Link>
                                </div>

                                <div className="space-y-3 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Apariencia</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant={theme === 'light' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => handleThemeChange('light')}
                                            className="justify-start gap-2"
                                        >
                                            <Sun className="h-4 w-4" />
                                            Claro
                                        </Button>
                                        <Button
                                            type="button"
                                            variant={theme === 'dark' ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => handleThemeChange('dark')}
                                            className="justify-start gap-2"
                                        >
                                            <Moon className="h-4 w-4" />
                                            Oscuro
                                        </Button>
                                    </div>
                                </div>

                                <div className="border-t p-4">
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        className="w-full justify-start gap-2"
                                        onClick={handleSignOut}
                                    >
                                        <LogOut className="h-4 w-4" />
                                        Cerrar sesión
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>

                        <div>
                            <p className="text-xs font-medium text-muted-foreground">Hola de nuevo,</p>
                            <h2 className="text-lg font-bold tracking-tight">{userNick}</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <NotificationCenter />
                    </div>
                </div>
            </header>

            <aside className="fixed bottom-0 left-0 top-0 z-50 hidden w-20 flex-col items-center border-r bg-card py-8 md:flex">
                <div className="mb-10 text-primary">
                    <Wallet className="h-8 w-8" />
                </div>
                <nav className="flex flex-1 flex-col gap-6">
                    {navItems.map((item) => (
                        <Link key={item.id} href={item.href} title={item.label}>
                            <div
                                className={cn(
                                    'rounded-2xl p-3 transition-all duration-300',
                                    pathname === item.href
                                        ? 'neon-glow scale-110 bg-primary text-white'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                            >
                                <item.icon className="h-6 w-6" />
                            </div>
                        </Link>
                    ))}
                </nav>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSignOut}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Cerrar sesión"
                >
                    <LogOut className="h-6 w-6" />
                </Button>
            </aside>

            <main className="container mx-auto max-w-7xl px-4 py-6 md:px-8">
                {children}
            </main>

            <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 md:hidden">
                <nav className="mx-auto grid h-20 w-full max-w-md grid-cols-5 items-center justify-items-center rounded-[2.2rem] border border-white/10 bg-background/90 px-3 shadow-2xl backdrop-blur-lg">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;

                        if (item.id === 'action') {
                            return (
                                <Link key={item.id} href={item.href}>
                                    <div className={cn(
                                        'flex h-12 w-12 items-center justify-center rounded-full transition-transform active:scale-90',
                                        isActive ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.6)]' : 'bg-muted text-foreground'
                                    )}>
                                        <item.icon className="h-7 w-7" />
                                    </div>
                                </Link>
                            );
                        }

                        return (
                            <Link key={item.id} href={item.href}>
                                <div
                                    className={cn(
                                        'flex flex-col items-center gap-1 p-2 transition-colors',
                                        isActive ? 'text-primary' : 'text-muted-foreground'
                                    )}
                                >
                                    <item.icon className="h-6 w-6" />
                                    {isActive && <div className="h-1 w-1 rounded-full bg-primary" />}
                                </div>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
}

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    return (
        <AssistantAttachmentProvider>
            <DashboardShellInner>{children}</DashboardShellInner>
        </AssistantAttachmentProvider>
    );
}
