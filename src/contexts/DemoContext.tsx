'use client';

// InsumoSync: Demo Context & Persona State Management
// Author: qa-devops-agent / frontend-engineer

import React, { createContext, useContext, useEffect, useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { PersonaType, Restaurant } from '@/types/database';

interface DemoContextType {
  currentPersona: PersonaType;
  switchPersona: (persona: PersonaType) => void;
  activeRestaurant: Restaurant | null;
  setActiveRestaurant: (restaurant: Restaurant | null) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  isPending: boolean;
}

const DEFAULT_RESTAURANT: Restaurant = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Bistrô Paris 6 — Unidade Jardins',
  address: 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP',
  is_active: true,
  created_at: new Date().toISOString(),
};

const DemoContext = createContext<DemoContextType | undefined>(undefined);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const [currentPersona, setCurrentPersona] = useState<PersonaType>('estoque');
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(DEFAULT_RESTAURANT);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Sync state with path on mount & path changes
  useEffect(() => {
    setIsMounted(true);
    const savedSound = localStorage.getItem('insumosync_sound_enabled');
    if (savedSound !== null) {
      setSoundEnabled(savedSound === 'true');
    }

    if (pathname.startsWith('/restaurante')) {
      setCurrentPersona('restaurante');
      localStorage.setItem('insumosync_persona', 'restaurante');
    } else if (pathname.startsWith('/admin')) {
      setCurrentPersona('admin');
      localStorage.setItem('insumosync_persona', 'admin');
    } else if (pathname.startsWith('/estoque')) {
      setCurrentPersona('estoque');
      localStorage.setItem('insumosync_persona', 'estoque');
    }
  }, [pathname]);

  const handleSetSoundEnabled = (enabled: boolean) => {
    setSoundEnabled(enabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('insumosync_sound_enabled', String(enabled));
    }
  };

  const switchPersona = (persona: PersonaType) => {
    setCurrentPersona(persona);
    if (typeof window !== 'undefined') {
      localStorage.setItem('insumosync_persona', persona);
    }
    startTransition(() => {
      router.push(`/${persona}`);
    });
  };

  return (
    <DemoContext.Provider
      value={{
        currentPersona,
        switchPersona,
        activeRestaurant,
        setActiveRestaurant,
        soundEnabled,
        setSoundEnabled: handleSetSoundEnabled,
        isPending,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
}
