import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DemoProvider } from '@/contexts/DemoContext';
import { DemoSwitcher } from '@/components/DemoSwitcher';

export const metadata: Metadata = {
  title: 'InsumoSync — Gestão Inteligente de Estoque para Restaurantes',
  description: 'Sincronia em tempo real entre o estoque central e a sua cozinha. Gestão de reposição, auditoria e conferência de entregas.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f172a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col font-sans">
        <DemoProvider>
          <DemoSwitcher />
          <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col">
            {children}
          </main>
        </DemoProvider>
      </body>
    </html>
  );
}
