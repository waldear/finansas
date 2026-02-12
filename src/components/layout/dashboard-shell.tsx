'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    PlusCircle,
    List,
    CreditCard,
    Bot,
    BarChart3,
    LogOut,
    User,
    Settings,
    Bell,
    Home,
    Search,
    QrCode,
    Sparkles,
    PiggyBank
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase-browser';
import { NotificationCenter } from '@/components/layout/notification-center';
import { cn } from '@/lib/utils';

const navItems = [
    { id: 'dashboard', label: 'Home', icon: Home, href: '/dashboard' },
    { id: 'charts', label: 'Stats', icon: BarChart3, href: '/dashboard/charts' },
    { id: 'action', label: 'Pay', icon: QrCode, href: '/dashboard/copilot', isAction: true },
    { id: 'debts', label: 'Cards', icon: CreditCard, href: '/dashboard/debts' },
    { id: 'profile', label: 'Metas', icon: PiggyBank, href: '/dashboard/savings' },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const supabase = createClient();
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();
    }, []);

    const handleSignOut = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = '/auth';
    };

    return (
        <div className="min-h-screen bg-background text-foreground pb-24 md:pb-0 md:pl-20">
            {/* Header */}
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-xl">
                <div className="container flex h-20 items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <div className="relative h-12 w-12 rounded-full border-2 border-primary/20 p-0.5">
                            <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`}
                                alt="Avatar"
                                className="h-full w-full rounded-full bg-muted"
                            />
                            <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground font-medium">Hola de nuevo,</p>
                            <h2 className="text-lg font-bold tracking-tight">
                                {user?.user_metadata?.full_name?.split(' ')[0] || 'Usuario'}
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* <NotificationCenter /> - Temporarily disabled for debugging */}
                    </div>
                </div>
            </header>

            {/* Desktop Sidebar (Optional, but improved for desktop) */}
            <aside className="fixed left-0 top-0 bottom-0 z-50 hidden w-20 flex-col items-center py-8 border-r bg-card md:flex">
                <div className="mb-10 text-primary">
                    <Sparkles className="h-8 w-8" />
                </div>
                <nav className="flex flex-1 flex-col gap-6">
                    {navItems.map((item) => (
                        <Link key={item.id} href={item.href} title={item.label}>
                            <div className={cn(
                                "p-3 rounded-2xl transition-all duration-300",
                                pathname === item.href
                                    ? "bg-primary text-white neon-glow scale-110"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}>
                                <item.icon className="h-6 w-6" />
                            </div>
                        </Link>
                    ))}
                </nav>
                <Button variant="ghost" size="icon" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive">
                    <LogOut className="h-6 w-6" />
                </Button>
            </aside>

            {/* Main Content */}
            <main className="container max-w-7xl mx-auto px-4 py-6 md:px-8">
                {children}
            </main>

            {/* Mobile Bottom Navigation */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md md:hidden">
                <nav className="glass border border-white/10 rounded-[2.5rem] flex items-center justify-between px-4 py-3 shadow-2xl">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;

                        if (item.id === 'action') {
                            return (
                                <Link key={item.id} href={item.href}>
                                    <div className="relative -top-8 h-16 w-16 rounded-full bg-primary flex items-center justify-center text-white neon-glow border-4 border-background transition-transform active:scale-90">
                                        <item.icon className="h-8 w-8" />
                                    </div>
                                </Link>
                            );
                        }

                        return (
                            <Link key={item.id} href={item.href}>
                                <div className={cn(
                                    "flex flex-col items-center gap-1 p-2 transition-colors",
                                    isActive ? "text-primary" : "text-muted-foreground"
                                )}>
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
