// InsumoSync: StockForecastModal — Previsibilidade de Estoque e Plano de Reposição
// Author: ui-ux-designer / frontend-engineer / backend-workflow-engine

'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  TrendingDown,
  AlertTriangle,
  Clock,
  Calendar,
  Plus,
  Search,
  CheckCircle2,
  RefreshCw,
  PackageCheck,
  Zap,
} from 'lucide-react';
import type { StockForecastItem, Product } from '@/types/database';
import {
  getUrgencyBadgeConfig,
  formatDaysRemaining,
} from '@/lib/services/inventory-service';

interface StockForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  forecastItems: StockForecastItem[];
  windowDays?: number;
  isLoading?: boolean;
  onRefresh?: () => void;
  onSelectForRestock: (product: Product, suggestedQty: number) => void;
  products: Product[];
}

export function StockForecastModal({
  isOpen,
  onClose,
  forecastItems,
  windowDays = 14,
  isLoading = false,
  onRefresh,
  onSelectForRestock,
  products,
}: StockForecastModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUrgency, setFilterUrgency] = useState<string>('TODOS');

  if (!isOpen) return null;

  // Filtragem
  const filteredItems = forecastItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterUrgency === 'TODOS') return true;
    if (filterUrgency === 'REORDER') return item.needs_reorder;
    if (filterUrgency === 'CRITICO') return item.urgency === 'ESGOTADO' || item.urgency === 'CRITICO';
    if (filterUrgency === 'ALERTA') return item.urgency === 'ALERTA';
    if (filterUrgency === 'ESTAVEL') return item.urgency === 'ESTAVEL' || item.urgency === 'SEM_CONSUMO';

    return true;
  });

  const criticalCount = forecastItems.filter(
    (i) => i.urgency === 'ESGOTADO' || i.urgency === 'CRITICO'
  ).length;
  const alertCount = forecastItems.filter((i) => i.urgency === 'ALERTA').length;
  const reorderCount = forecastItems.filter((i) => i.needs_reorder).length;

  const handleRestockClick = (item: StockForecastItem) => {
    const matchedProduct = products.find((p) => p.id === item.product_id);
    if (matchedProduct) {
      onSelectForRestock(matchedProduct, item.suggested_reorder_qty);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Mobile handle indicator */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  Previsibilidade de Estoque
                </h2>
                <span className="hidden xs:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  Janela: {windowDays} dias
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Recomendações automáticas de reposição baseadas no ritmo de saídas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-50 transition-colors"
                title="Atualizar previsões"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mini KPI Bar */}
        <div className="grid grid-cols-3 gap-2 px-5 py-3 bg-slate-50/80 border-b border-slate-100 shrink-0 text-center">
          <div className="p-2 rounded-xl bg-white border border-slate-200/70">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Repor com Urgência
            </span>
            <span className="text-base sm:text-lg font-extrabold text-red-600">
              {criticalCount}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-white border border-slate-200/70">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Atenção / Alerta
            </span>
            <span className="text-base sm:text-lg font-extrabold text-amber-600">
              {alertCount}
            </span>
          </div>

          <div className="p-2 rounded-xl bg-white border border-slate-200/70">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">
              Total Sugerido
            </span>
            <span className="text-base sm:text-lg font-extrabold text-purple-700">
              {reorderCount} itens
            </span>
          </div>
        </div>

        {/* Search & Urgency filter pills */}
        <div className="p-4 space-y-2.5 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar insumo ou categoria..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 min-h-[40px]"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-xs">
            {[
              { id: 'TODOS', label: 'Todos os Insumos' },
              { id: 'REORDER', label: `Sugeridos Repor (${reorderCount})` },
              { id: 'CRITICO', label: `Críticos (${criticalCount})` },
              { id: 'ALERTA', label: `Alertas (${alertCount})` },
              { id: 'ESTAVEL', label: 'Estáveis' },
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => setFilterUrgency(pill.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all min-h-[36px] ${
                  filterUrgency === pill.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Item List */}
        <div className="overflow-y-auto p-4 space-y-3 flex-1 min-h-0">
          {isLoading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600 mb-2" />
              Calculando estimativas de consumo e cobertura...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <PackageCheck className="w-9 h-9 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">Nenhum insumo encontrado</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Não há insumos correspondentes aos filtros selecionados.
              </p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const badge = getUrgencyBadgeConfig(item.urgency);
              const daysLabel = formatDaysRemaining(item.days_until_stockout, item.urgency);
              const isDanger = item.urgency === 'ESGOTADO' || item.urgency === 'CRITICO';

              return (
                <div
                  key={item.product_id}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                    isDanger
                      ? 'border-red-200 bg-red-50/20'
                      : item.urgency === 'ALERTA'
                      ? 'border-amber-200 bg-amber-50/20'
                      : 'border-slate-200/80 bg-white'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900">
                          {item.name}
                        </h3>
                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {item.category}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border ${badge.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                          {badge.label}
                        </span>
                      </div>

                      {/* Métricas do produto */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-slate-600">
                        <span>
                          Saldo Atual: <strong className="text-slate-900">{item.current_stock} {item.unit}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <TrendingDown className="w-3.5 h-3.5 text-slate-400" />
                          Consumo: <strong className="text-slate-900">{item.avg_daily_consumption} {item.unit}/dia</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          Cobertura: <strong className={isDanger ? 'text-red-600' : 'text-slate-900'}>{daysLabel}</strong>
                        </span>
                      </div>

                      {/* Data prevista de esgotamento */}
                      {item.projected_stockout_date && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            Previsão de término:{' '}
                            <strong className="text-slate-800">
                              {new Date(item.projected_stockout_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </strong>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Ação de Reabastecimento */}
                    {item.needs_reorder ? (
                      <button
                        onClick={() => handleRestockClick(item)}
                        className={`shrink-0 flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-[0.98] min-h-[44px] ${
                          isDanger
                            ? 'bg-red-600 hover:bg-red-700 shadow-xs'
                            : 'bg-purple-600 hover:bg-purple-700 shadow-xs'
                        }`}
                        title="Reabastecer insumo com a quantidade sugerida pré-preenchida"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Solicitar +{item.suggested_reorder_qty} {item.unit}</span>
                      </button>
                    ) : (
                      <div className="shrink-0 flex items-center gap-1 text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl text-xs font-bold border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Estoque Seguro</span>
                      </div>
                    )}
                  </div>

                  {/* Texto de recomendação explicativa */}
                  <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-start gap-1.5 text-xs text-slate-600">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                    <p>{item.recommendation_text}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-b-3xl shrink-0">
          <p className="text-[11px] text-slate-500">
            Cálculo dinâmico baseado em saídas confirmadas dos últimos {windowDays} dias.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors min-h-[40px]"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
