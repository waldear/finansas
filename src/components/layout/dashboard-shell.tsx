'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    PlusCircle,
    List,
    CreditCard,
    Lightbulb,
    Wallet,
    TrendingUp,
    TrendingDown,
    Menu,
    FileText,
    Bot,
    BarChart3,
    Download,
    LogOut,
    User,
    Tag,
    PiggyBank,
    RefreshCw,
    Settings,
    X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { createClient } from '@/lib/supabase-browser';

const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
    { id: 'transactions', label: 'Transacciones', icon: PlusCircle, href: '/dashboard/transactions' },
    { id: 'history', label: 'Historial', icon: List, href: '/dashboard/history' },
    { id: 'charts', label: 'Gráficos', icon: BarChart3, href: '/dashboard/charts' },
    { id: 'debts', label: 'Deudas', icon: CreditCard, href: '/dashboard/debts' },
    { id: 'savings', label: 'Metas', icon: PiggyBank, href: '/dashboard/savings' },
    { id: 'pdf', label: 'Analizar PDF', icon: FileText, href: '/dashboard/pdf' },
    { id: 'assistant', label: 'Asistente', icon: Bot, href: '/dashboard/assistant' },
];

export default function DashboardShell({ children }: { children: React.ReactNode }) {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const pathname = usePathname();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.href = '/auth';
    };

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="container flex h-16 items-center justify-between px-4">
                    <div className="flex items-center gap-4">
                        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden">
                                    <Menu className="h-6 w-6" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-64 p-0">
                                <div className="flex flex-col h-full">
                                    <div className="p-6 border-b">
                                        <h2 className="text-lg font-bold flex items-center gap-2">
                                            <Wallet className="h-6 w-6 text-primary" />
                                            Control Financiero
                                        </h2>
                                    </div>
                                    <nav className="flex-1 p-4 space-y-1">
                                        {menuItems.map((item) => (
                                            <Link
                                                key={item.id}
                                                href={item.href}
                                                onClick={() => setIsMobileMenuOpen(false)}
                                            >
                                                <Button
                                                    variant={pathname === item.href ? 'secondary' : 'ghost'}
                                                    className="w-full justify-start gap-3 h-11"
                                                >
                                                    <item.icon className="h-4 w-4" />
                                                    {item.label}
                                                </Button>
                                            </Link>
                                        ))}
                                    </nav>
                                    <div className="p-4 border-t">
                                        <Button variant="ghost" className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleSignOut}>
                                            <LogOut className="h-4 w-4" />
                                            Cerrar Sesión
                                        </Button>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent flex items-center gap-2">
                            <Wallet className="h-6 w-6 text-primary" />
                            <span className="hidden sm:inline">Mi Control Financiero</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-2 md:gap-4">
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                            <User className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </header>

            <div className="container flex-1 items-start md:grid md:grid-cols-[240px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 p-4 md:p-6">
                {/* Sidebar */}
                <aside className="fixed top-20 z-30 -ml-2 hidden h-[calc(100vh-5rem)] w-full shrink-0 overflow-y-auto border-r md:sticky md:block">
                    <nav className="space-y-1 pr-4">
                        {menuItems.map((item) => (
                            <Link key={item.id} href={item.href}>
                                <Button
                                    variant={pathname === item.href ? 'secondary' : 'ghost'}
                                    className="w-full justify-start gap-3 h-11 mb-1"
                                >
                                    <item.icon className="h-4 w-4" />
                                    {item.label}
                                </Button>
                            </Link>
                        ))}
                    </nav>
                    <div className="mt-8 pt-8 border-t pr-4">
                        <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive transition-colors" onClick={handleSignOut}>
                            <LogOut className="h-4 w-4" />
                            Salir
                        </Button>
                    </div>
                </aside>

                {/* Dashboard Content */}
                <main className="flex w-full flex-col overflow-hidden">
                    {children}
                </main>
            </div>
        </div>
    );
}
