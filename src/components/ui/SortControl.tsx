// InsumoSync: SortControl — Seletor de Ordenação Reutilizável
// Author: ui-ux-designer / frontend-engineer
//
// Select nativo mais botão de direção. O select nativo é deliberado: em mobile
// ele abre a roleta do próprio sistema operacional, que é mais confortável que
// qualquer dropdown customizado e já vem acessível de fábrica.

'use client';

import React, { useId } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react';
import type { SortDirection, SortOption } from '@/lib/utils/sorting';

interface SortControlProps<T extends string> {
  options: SortOption<T>[];
  value: T;
  direction: SortDirection;
  onChange: (value: T) => void;
  onDirectionChange: (direction: SortDirection) => void;
  /** Rótulo do campo, oculto visualmente mas lido por leitores de tela. */
  label?: string;
  className?: string;
}

export function SortControl<T extends string>({
  options,
  value,
  direction,
  onChange,
  onDirectionChange,
  label = 'Ordenar por',
  className = '',
}: SortControlProps<T>) {
  const selectId = useId();
  const isAsc = direction === 'asc';
  const activeLabel = options.find((o) => o.value === value)?.label ?? '';

  return (
    <div className={`flex items-stretch gap-2 ${className}`}>
      <label htmlFor={selectId} className="sr-only">
        {label}
      </label>

      <div className="relative flex-1 min-w-0">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="w-full appearance-none pl-3 pr-8 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[44px] cursor-pointer"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              Ordenar por: {o.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">
          ▼
        </span>
      </div>

      <button
        type="button"
        onClick={() => onDirectionChange(isAsc ? 'desc' : 'asc')}
        className="shrink-0 px-3 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 flex items-center gap-1.5 transition-colors min-h-[44px] min-w-[44px] justify-center active:scale-[0.98]"
        title={`${activeLabel}: ${isAsc ? 'crescente' : 'decrescente'}. Clique para inverter.`}
        aria-label={`Inverter ordenação. Atualmente ${isAsc ? 'crescente' : 'decrescente'}.`}
      >
        {isAsc ? (
          <ArrowUpNarrowWide className="w-4 h-4" />
        ) : (
          <ArrowDownWideNarrow className="w-4 h-4" />
        )}
        <span className="text-[11px] font-bold hidden sm:inline">
          {isAsc ? 'Crescente' : 'Decrescente'}
        </span>
      </button>
    </div>
  );
}
