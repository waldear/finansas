import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import Providers from '@/components/providers/query-provider';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'FinFlow',
    description: 'Gestiona tus finanzas de forma inteligente y fluida',
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body className={inter.className}>
                <Script id="theme-init" strategy="beforeInteractive">
                    {`try { const theme = localStorage.getItem('finansas-theme') || 'light'; document.documentElement.classList.toggle('dark', theme === 'dark'); } catch (_) {}`}
                </Script>
                <Providers>
                    {children}
                    <Toaster position="top-center" richColors />
                </Providers>
            </body>
        </html>
    );
}
