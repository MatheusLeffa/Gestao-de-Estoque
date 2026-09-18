// InsumoSync: Analytics Service — Fase 5
// Author: analytics-specialist / frontend-engineer
//
// Todas as agregações vêm prontas do PostgreSQL pela RPC get_admin_analytics().
// O cliente não varre pedidos nem soma quantidades: a definição normativa de cada
// métrica vive em docs/business-rules.md seção 6 e é implementada no banco.

import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { mockStore } from '@/lib/services/mock-store';
import type { AdminAnalyticsResponse } from '@/types/database';

export async function fetchAdminAnalytics(): Promise<AdminAnalyticsResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.getAdminAnalytics();
  }

  const { data, error } = await supabase.rpc('get_admin_analytics');

  if (error) {
    return { success: false, error: `Erro ao carregar indicadores: ${error.message}` };
  }

  return data as AdminAnalyticsResponse;
}

// ─── Formatação para exibição ────────────────────────────────────────────────

/** Rótulos legíveis dos desfechos de entrega. */
export const OUTCOME_LABELS: Record<string, string> = {
  CONCLUIDO_TOTAL: 'Entregue Total',
  CONCLUIDO_PARCIAL: 'Entregue Parcial',
  CONCLUIDO_NAO_ENTREGUE: 'Não Entregue',
};

/**
 * Formata a taxa de pontualidade. Retorna `null` quando a métrica é indefinida,
 * para que a tela exiba estado vazio em vez de um percentual inventado.
 */
export function formatOnTimeRate(rate: number | null | undefined): string | null {
  if (rate === null || rate === undefined) return null;
  return `${Number(rate).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

/** Converte `YYYY-MM-DD` em `DD/MM` para os eixos dos gráficos. */
export function formatDayLabel(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}/${month}`;
}

/** Cor do indicador de pontualidade conforme a faixa de desempenho. */
export function onTimeRateTone(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return 'text-slate-400';
  if (rate >= 90) return 'text-emerald-600';
  if (rate >= 70) return 'text-amber-600';
  return 'text-red-600';
}
