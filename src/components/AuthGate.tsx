'use client';

// InsumoSync: Auth Gate — proteção de rotas no cliente
// Author: frontend-engineer
//
// Conveniência de navegação: o dado está protegido no banco (RLS + auth_guard).
// Enquanto a sessão carrega, nada da área protegida é renderizado.

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Store } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppNav } from '@/components/AppNav';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { areaFromPath, canAccessPath, homeRouteFor } from '@/lib/services/auth-service';

const LOGIN_ROUTE = '/login';

function Splash() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-24 text-slate-500" role="status">
      <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
      <span className="text-sm font-medium">Carregando InsumoSync…</span>
    </div>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppNav />
      <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col">{children}</main>
    </>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session, profile, loading, activeRestaurant } = useAuth();

  const isLoginRoute = pathname === LOGIN_ROUTE;
  const isAuthenticated = Boolean(session && profile) || (!isSupabaseConfigured && Boolean(profile));

  // Rota de destino quando a atual não serve; `null` quando a atual é válida.
  let redirectTo: string | null = null;
  if (!loading) {
    if (isLoginRoute) {
      if (isAuthenticated && profile) redirectTo = homeRouteFor(profile.role);
    } else if (!isAuthenticated || !profile) {
      redirectTo = LOGIN_ROUTE;
    } else if (!canAccessPath(profile.role, pathname)) {
      redirectTo = homeRouteFor(profile.role);
    }
  }

  useEffect(() => {
    if (redirectTo && redirectTo !== pathname) router.replace(redirectTo);
  }, [redirectTo, pathname, router]);

  if (loading || redirectTo) {
    return <Splash />;
  }

  if (isLoginRoute) {
    return <main className="flex-1 w-full flex flex-col">{children}</main>;
  }

  if (areaFromPath(pathname) === 'restaurante' && !activeRestaurant) {
    return (
      <AppShell>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 py-24 text-center text-slate-600">
          <Store className="w-8 h-8 text-slate-400" />
          <p className="text-sm font-medium max-w-xs">
            Nenhum restaurante ativo está vinculado ao seu perfil. Procure o administrador.
          </p>
        </div>
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}
