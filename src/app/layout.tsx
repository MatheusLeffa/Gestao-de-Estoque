import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/AuthGate';

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
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
