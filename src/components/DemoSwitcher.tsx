'use client';

// InsumoSync: Demo Switcher Component (Fixed Top Bar)
// Author: ui-ux-designer / qa-devops-agent

import React from 'react';
import { useDemo } from '@/contexts/DemoContext';
import { PersonaType } from '@/types/database';
import { Package, UtensilsCrossed, ShieldCheck, Volume2, VolumeX, Sparkles } from 'lucide-react';
import clsx from 'clsx';

export const DemoSwitcher: React.FC = () => {
  const { currentPersona, switchPersona, soundEnabled, setSoundEnabled } = useDemo();

  const personas: { id: PersonaType; label: string; shortLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
      id: 'estoque',
      label: 'Estoque Central',
      shortLabel: 'Estoque',
      icon: Package,
    },
    {
      id: 'restaurante',
      label: 'Restaurante',
      shortLabel: 'Cozinha',
      icon: UtensilsCrossed,
    },
    {
      id: 'admin',
      label: 'Administrador',
      shortLabel: 'Admin',
      icon: ShieldCheck,
    },
  ];

  return (
    <header className="sticky top-0 z-50 w-full bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 h-14 flex items-center justify-between gap-2">
        {/* Brand & Mode Tag */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <span className="font-bold text-sm tracking-tight text-slate-100">Insumo<span className="text-blue-400">Sync</span></span>
            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">DEMO</span>
          </div>
        </div>

        {/* Persona Switcher Tabs */}
        <nav aria-label="Demo Persona Switcher" className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700/60 shadow-inner">
          {personas.map((persona) => {
            const Icon = persona.icon;
            const isActive = currentPersona === persona.id;

            return (
              <button
                key={persona.id}
                onClick={() => switchPersona(persona.id)}
                className={clsx(
                  'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold min-h-[36px] transition-all duration-200 select-none active:scale-95',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                )}
                title={`Alternar para modo ${persona.label}`}
              >
                <Icon className={clsx('w-3.5 h-3.5', isActive ? 'text-white' : 'text-slate-400')} />
                <span className="hidden sm:inline">{persona.label}</span>
                <span className="sm:hidden">{persona.shortLabel}</span>
              </button>
            );
          })}
        </nav>

        {/* Sound FX Toggle & Status Indicator */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={clsx(
              'p-2 rounded-lg text-xs font-medium transition-colors border flex items-center justify-center min-w-[36px] min-h-[36px]',
              soundEnabled
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700/60'
            )}
            title={soundEnabled ? 'Áudio Chime Ativado' : 'Áudio Chime Desativado'}
            aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
