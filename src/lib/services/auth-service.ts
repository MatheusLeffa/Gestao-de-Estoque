// InsumoSync: Auth Service — Fase 5.7
// Author: frontend-engineer
//
// Login por e-mail e senha no Supabase Auth e leitura do perfil em `profiles`.
// A autorização de verdade está no banco (RLS e auth_guard nas RPCs); aqui só
// decidimos para onde o usuário vai e traduzimos os erros para português.

import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { mockStore } from '@/lib/services/mock-store';
import type { AppRole, PersonaType, Profile, Restaurant } from '@/types/database';

export interface AuthResult {
  success: boolean;
  error?: string;
}

// ─── Rotas por papel ─────────────────────────────────────────────────────────

const ROLE_AREAS: Record<AppRole, PersonaType[]> = {
  admin: ['estoque', 'restaurante', 'admin'],
  estoque: ['estoque'],
  restaurante: ['restaurante'],
};

/** Áreas que o papel pode abrir, na ordem das abas do AppNav. */
export function allowedAreasFor(role: AppRole): PersonaType[] {
  return ROLE_AREAS[role];
}

/** Rota inicial de cada papel. */
export function homeRouteFor(role: AppRole): string {
  return role === 'admin' ? '/admin' : `/${role}`;
}

/** Área do app correspondente à rota, ou `null` para rotas fora delas. */
export function areaFromPath(pathname: string): PersonaType | null {
  if (pathname.startsWith('/estoque')) return 'estoque';
  if (pathname.startsWith('/restaurante')) return 'restaurante';
  if (pathname.startsWith('/admin')) return 'admin';
  return null;
}

export function canAccessPath(role: AppRole, pathname: string): boolean {
  const area = areaFromPath(pathname);
  return area !== null && ROLE_AREAS[role].includes(area);
}

// ─── Tradução de erros ───────────────────────────────────────────────────────

function translateAuthError(error: AuthError): string {
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }

  switch (error.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed':
      return 'E-mail ainda não confirmado. Peça ao administrador para liberar o acesso.';
    case 'user_banned':
      return 'Usuário bloqueado. Procure o administrador.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.';
    default:
      return 'Não foi possível entrar agora. Tente de novo em instantes.';
  }
}

// ─── Sessão ──────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured) {
    return { success: false, error: 'Supabase não configurado neste ambiente.' };
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    return { success: false, error: 'Informe e-mail e senha.' };
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    if (error) return { success: false, error: translateAuthError(error) };
    return { success: true };
  } catch {
    return { success: false, error: 'Sem conexão com o servidor. Verifique a internet e tente de novo.' };
  }
}

/** Encerra a sessão e fecha todos os canais Realtime abertos. */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured) return;
  await supabase.removeAllChannels();
  // scope 'local' encerra a sessão mesmo sem rede; o token expira sozinho no servidor.
  await supabase.auth.signOut({ scope: 'local' });
}

export async function getSession(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ─── Perfil ──────────────────────────────────────────────────────────────────

/** Perfil usado quando o Supabase não está configurado (só dev local, mock-store). */
export const OFFLINE_PROFILE: Profile = {
  id: 'offline',
  role: 'admin',
  restaurant_id: null,
  full_name: 'Modo offline',
  is_active: true,
};

/** Perfil ativo do usuário logado, ou `null` se não houver perfil ativo. */
export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, restaurant_id, full_name, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[auth-service] fetchMyProfile error:', error.message);
    return null;
  }

  const profile = data as Profile | null;
  return profile && profile.is_active ? profile : null;
}

/**
 * Restaurante operado na área `/restaurante`: o do perfil ou, para um `admin`
 * sem restaurante vinculado, o primeiro restaurante ativo.
 */
export async function fetchRestaurantForProfile(profile: Profile): Promise<Restaurant | null> {
  if (!isSupabaseConfigured) return mockStore.getRestaurant();

  if (profile.restaurant_id) {
    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', profile.restaurant_id)
      .maybeSingle();
    if (error) console.error('[auth-service] fetchRestaurant error:', error.message);
    return (data as Restaurant | null) ?? null;
  }

  if (profile.role !== 'admin') return null;

  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) console.error('[auth-service] fetchRestaurant error:', error.message);
  return (data as Restaurant | null) ?? null;
}

// ─── Respostas de RPC negadas pelo auth_guard ────────────────────────────────

/**
 * Repassa a resposta da RPC. Se o banco disser que a sessão não vale mais
 * (`UNAUTHENTICATED`), encerra a sessão local: o AuthGate leva para `/login`.
 * `FORBIDDEN` segue adiante e a tela mostra o `error` que veio do banco.
 */
export function guardRpcResponse<T extends { success: boolean; code?: string }>(data: T): T {
  if (!data.success && data.code === 'UNAUTHENTICATED') {
    void signOut();
  }
  return data;
}
