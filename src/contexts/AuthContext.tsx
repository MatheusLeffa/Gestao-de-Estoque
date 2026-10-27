'use client';

// InsumoSync: Auth Context — sessão, perfil e preferências do aparelho
// Author: frontend-engineer
//
// Substitui o antigo DemoContext. A área ativa deixa de ser escolha livre: vem
// da rota, limitada ao que o papel do perfil permite.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  OFFLINE_PROFILE,
  allowedAreasFor,
  areaFromPath,
  fetchMyProfile,
  fetchRestaurantForProfile,
  signOut as signOutService,
} from '@/lib/services/auth-service';
import type { PersonaType, Profile, Restaurant } from '@/types/database';

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  /** Verdadeiro até a sessão e o perfil estarem resolvidos. */
  loading: boolean;
  /** Aviso a exibir na tela de login (ex.: perfil inativo). */
  authNotice: string | null;
  clearAuthNotice: () => void;
  /** Área aberta agora, derivada da rota e restrita ao papel. */
  currentPersona: PersonaType | null;
  allowedPersonas: PersonaType[];
  activeRestaurant: Restaurant | null;
  signOut: () => Promise<void>;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState<boolean>(!isSupabaseConfigured);
  const [profile, setProfile] = useState<Profile | null>(isSupabaseConfigured ? null : OFFLINE_PROFILE);
  // id do usuário cujo perfil já foi resolvido (com sucesso ou não)
  const [profileResolvedFor, setProfileResolvedFor] = useState<string | null>(null);
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Preferência de som é do aparelho, não do usuário
  useEffect(() => {
    try {
      const savedSound = localStorage.getItem('insumosync_sound_enabled');
      if (savedSound !== null) setSoundEnabled(savedSound === 'true');
    } catch {
      // localStorage indisponível: mantém o padrão
    }
  }, []);

  const handleSetSoundEnabled = (enabled: boolean) => {
    setSoundEnabled(enabled);
    try {
      localStorage.setItem('insumosync_sound_enabled', String(enabled));
    } catch {
      // sem persistência, só nesta aba
    }
  };

  // Sessão do Supabase Auth
  useEffect(() => {
    if (!isSupabaseConfigured) {
      fetchRestaurantForProfile(OFFLINE_PROFILE).then(setActiveRestaurant);
      return;
    }

    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setSessionLoaded(true);
    });

    // Não chamar o Supabase dentro deste callback: o perfil é carregado no efeito abaixo.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setSessionLoaded(true);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Perfil e restaurante do usuário logado
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    if (!userId) {
      setProfile(null);
      setActiveRestaurant(null);
      setProfileResolvedFor(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const myProfile = await fetchMyProfile(userId);
      if (cancelled) return;

      if (!myProfile) {
        setAuthNotice('Seu usuário não tem um perfil ativo no InsumoSync. Procure o administrador.');
        setProfile(null);
        setActiveRestaurant(null);
        setProfileResolvedFor(userId);
        await signOutService();
        return;
      }

      const restaurant = await fetchRestaurantForProfile(myProfile);
      if (cancelled) return;
      setProfile(myProfile);
      setActiveRestaurant(restaurant);
      setProfileResolvedFor(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await signOutService();
  }, []);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  const loading = isSupabaseConfigured && (!sessionLoaded || (userId !== null && profileResolvedFor !== userId));

  const allowedPersonas = profile ? allowedAreasFor(profile.role) : [];
  const routeArea = areaFromPath(pathname);
  const currentPersona =
    profile && routeArea && allowedPersonas.includes(routeArea) ? routeArea : profile?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        authNotice,
        clearAuthNotice,
        currentPersona,
        allowedPersonas,
        activeRestaurant,
        signOut,
        soundEnabled,
        setSoundEnabled: handleSetSoundEnabled,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
