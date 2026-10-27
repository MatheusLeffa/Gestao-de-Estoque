'use client';

// InsumoSync: App Navigation (Fixed Top Bar)
// Author: frontend-engineer
//
// Substitui o DemoSwitcher. Mostra só as áreas que o papel permite, o nome do
// usuário, o controle de som e o botão Sair.

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { PersonaType } from '@/types/database';
import { Package, UtensilsCrossed, ShieldCheck, Volume2, VolumeX, Sparkles, LogOut, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const AREAS: Record<PersonaType, { label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }> = {
  estoque: { label: 'Estoque Central', shortLabel: 'Estoque', icon: Package },
  restaurante: { label: 'Restaurante', shortLabel: 'Cozinha', icon: UtensilsCrossed },
  admin: { label: 'Administrador', shortLabel: 'Admin', icon: ShieldCheck },
};

export const AppNav: React.FC = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);
  const { profile, currentPersona, allowedPersonas, soundEnabled, setSoundEnabled, signOut } = useAuth();

  const firstName = profile?.full_name.trim().split(/\s+/)[0] ?? '';
  const hasTabs = allowedPersonas.length > 1;

  const goTo = (persona: PersonaType) => {
    if (persona === currentPersona) return;
    startTransition(() => router.push(`/${persona}`));
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 flex items-center justify-between gap-2">
        {/* Marca */}
        <div className={clsx('items-center gap-2 flex-shrink-0', hasTabs ? 'hidden sm:flex' : 'flex')}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-100">Insumo<span className="text-blue-400">Sync</span></span>
        </div>

        {/* Áreas do papel */}
        {hasTabs ? (
          <nav aria-label="Áreas do sistema" className="flex items-center bg-slate-800/90 p-0.5 rounded-xl border border-slate-700/60 shadow-inner">
            {allowedPersonas.map((persona) => {
              const { label, shortLabel, icon: Icon } = AREAS[persona];
              const isActive = currentPersona === persona;

              return (
                <button
                  key={persona}
                  onClick={() => goTo(persona)}
                  disabled={isPending}
                  aria-current={isActive ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-1.5 px-2 sm:px-3 rounded-lg text-xs font-semibold min-h-[44px] transition-all duration-200 select-none active:scale-95',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                  )}
                  title={label}
                >
                  <Icon className={clsx('w-3.5 h-3.5', isActive ? 'text-white' : 'text-slate-400')} />
                  <span className="hidden sm:inline">{label}</span>
                  <span className="sm:hidden">{shortLabel}</span>
                </button>
              );
            })}
          </nav>
        ) : (
          currentPersona && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 truncate">
              {React.createElement(AREAS[currentPersona].icon, { className: 'w-3.5 h-3.5 text-blue-400' })}
              {AREAS[currentPersona].label}
            </span>
          )
        )}

        {/* Usuário, som e saída */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {firstName && (
            <span className="hidden md:inline text-xs font-medium text-slate-300 mr-1 max-w-[120px] truncate" title={profile?.full_name}>
              {firstName}
            </span>
          )}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={clsx(
              'rounded-lg border flex items-center justify-center min-w-[44px] min-h-[44px] transition-colors',
              soundEnabled
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700/60'
            )}
            title={soundEnabled ? 'Áudio Chime Ativado' : 'Áudio Chime Desativado'}
            aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          {profile?.id !== 'offline' && (
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700/60 hover:text-white flex items-center justify-center gap-1.5 min-w-[44px] min-h-[44px] px-2 transition-colors disabled:opacity-60"
              title="Sair"
              aria-label="Sair"
            >
              {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span className="hidden sm:inline text-xs font-semibold">Sair</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
