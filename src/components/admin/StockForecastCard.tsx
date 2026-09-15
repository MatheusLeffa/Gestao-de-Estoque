// InsumoSync: StockForecastCard — Previsibilidade de Estoque para o Administrador
// Author: analytics-specialist / ui-ux-designer / frontend-engineer

'use client';

import React from 'react';
import {
  Sparkles,
  TrendingDown,
  AlertTriangle,
  Clock,
  Calendar,
  Package,
  Inbox,
  CheckCircle2,
} from 'lucide-react';
import type { StockForecastItem, StockForecastingSummary } from '@/types/database';
import {
  getUrgencyBadgeConfig,
  formatDaysRemaining,
} from '@/lib/services/inventory-service';

interface StockForecastCardProps {
  items: StockForecastItem[];
  summary?: StockForecastingSummary;
  windowDays?: number;
  isLoading?: boolean;
}

export function StockForecastCard({
  items,
  summary,
  windowDays = 14,
  isLoading = false,
}: StockForecastCardProps) {
  // Ordena os itens mais urgentes primeiro
  const reorderItems = items.filter((i) => i.needs_reorder);
  const displayItems = reorderItems.length > 0 ? reorderItems.slice(0, 6) : items.slice(0, 6);

  return (
    <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-subtle space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
              <Sparkles className="w-4 h-4" />
            </span>
            <h2 className="text-sm font-bold text-slate-900">
              Previsibilidade de Estoque & Reposição
            </h2>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Projeção baseada nas saídas da rede nos últimos {windowDays} dias
          </p>
        </div>

        {summary && (
          <div className="flex items-center gap-2 text-xs font-semibold">
            {summary.critical_count > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200 text-[10px]">
                {summary.critical_count} crítico(s)
              </span>
            )}
            {summary.alert_count > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-[10px]">
                {summary.alert_count} em alerta
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 border border-purple-200 text-[10px]">
              {summary.total_reorder_items} para repor
            </span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="h-[180px] flex flex-col items-center justify-center gap-2 text-slate-400">
          <p className="text-xs font-medium">Calculando projeções de consumo...</p>
        </div>
      ) : displayItems.length === 0 ? (
        <div className="h-[160px] flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
          <Inbox className="w-7 h-7" />
          <p className="text-xs font-medium text-slate-600">Nenhum insumo em risco no momento</p>
          <p className="text-[11px] text-slate-400">Todos os produtos ativos possuem cobertura segura de estoque.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs min-w-[540px]">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Insumo</th>
                <th className="p-3">Saldo / Alerta</th>
                <th className="p-3">Consumo Diário</th>
                <th className="p-3">Previsão de Término</th>
                <th className="p-3">Sugestão de Reposição</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {displayItems.map((item) => {
                const badge = getUrgencyBadgeConfig(item.urgency);
                const daysLabel = formatDaysRemaining(item.days_until_stockout, item.urgency);
                const isCritical = item.urgency === 'ESGOTADO' || item.urgency === 'CRITICO';

                return (
                  <tr key={item.product_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="text-[10px] text-slate-400">{item.category}</div>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span className={`font-bold ${isCritical ? 'text-red-600' : 'text-slate-900'}`}>
                        {item.current_stock} {item.unit}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        mín. {item.min_stock_alert} {item.unit}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span className="font-semibold text-slate-800">
                        {item.avg_daily_consumption} {item.unit}/dia
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        total {item.total_outflow} {item.unit}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border mb-1 ${badge.badgeClass}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                        {daysLabel}
                      </span>
                      {item.projected_stockout_date ? (
                        <div className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(item.projected_stockout_date + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400">—</div>
                      )}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {item.needs_reorder ? (
                        <div>
                          <span className={`font-bold ${isCritical ? 'text-red-600' : 'text-purple-700'}`}>
                            +{item.suggested_reorder_qty} {item.unit}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            cobertura para 14 dias
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Cobertura OK
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
