// InsumoSync: Modal de Previsibilidade e Sugestões de Reposição para o Restaurante
// Author: ui-ux-designer / frontend-engineer
// Permite à cozinha visualizar recomendações inteligentes e adicionar ao carrinho em lote.

'use client';

import React, { useState } from 'react';
import {
  X,
  Sparkles,
  ShoppingBag,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Minus,
  Check,
  Flame,
  Info,
} from 'lucide-react';
import clsx from 'clsx';
import type { RestaurantRecommendationItem } from '@/types/database';

interface RestaurantForecastModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendations: RestaurantRecommendationItem[];
  onAddItemsToCart: (items: { productId: string; quantity: number }[]) => void;
}

export const RestaurantForecastModal: React.FC<RestaurantForecastModalProps> = ({
  isOpen,
  onClose,
  recommendations,
  onAddItemsToCart,
}) => {
  // Quantidades customizadas para cada produto no modal
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    recommendations.forEach((item) => {
      initial[item.product_id] = item.recommended_order_qty;
    });
    return initial;
  });

  // Itens selecionados para inclusão no carrinho
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    return new Set(recommendations.map((i) => i.product_id));
  });

  // Filtro interno de urgência
  const [filter, setFilter] = useState<'TODOS' | 'URGENTE' | 'RECOMENDADO'>('TODOS');

  if (!isOpen) return null;

  const handleToggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.product_id)));
    }
  };

  const handleUpdateQty = (productId: string, delta: number, maxStock: number) => {
    setQuantities((prev) => {
      const current = prev[productId] ?? 1;
      const next = Math.max(1, Math.min(maxStock, current + delta));
      return { ...prev, [productId]: next };
    });
  };

  const filteredItems = recommendations.filter((item) => {
    if (filter === 'URGENTE') return item.urgency === 'URGENTE';
    if (filter === 'RECOMENDADO') return item.urgency === 'RECOMENDADO';
    return true;
  });

  const selectedCount = selectedIds.size;
  const totalUnitsToAdd = Array.from(selectedIds).reduce((acc, id) => {
    return acc + (quantities[id] ?? 0);
  }, 0);

  const handleConfirmAdd = () => {
    const itemsToAdd = Array.from(selectedIds).map((id) => ({
      productId: id,
      quantity: quantities[id] ?? 1,
    }));

    if (itemsToAdd.length > 0) {
      onAddItemsToCart(itemsToAdd);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden border border-slate-200 animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="forecast-modal-title"
      >
        {/* Mobile Swipe Handle */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-950 text-white flex items-start justify-between gap-3 border-b border-indigo-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-slate-900 shadow-lg flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="forecast-modal-title" className="text-base sm:text-lg font-bold flex items-center gap-2">
                Sugestões de Reposição da Cozinha
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {recommendations.length} itens
                </span>
              </h2>
              <p className="text-xs text-blue-200 mt-0.5">
                Calculado com base no consumo do restaurante e disponibilidade do estoque central.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors touch-target flex items-center justify-center"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar & Bulk Actions */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setFilter('TODOS')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                filter === 'TODOS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              )}
            >
              Todos ({recommendations.length})
            </button>
            <button
              onClick={() => setFilter('URGENTE')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1',
                filter === 'URGENTE'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-white text-red-700 border border-red-200 hover:bg-red-50'
              )}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Urgentes ({recommendations.filter((i) => i.urgency === 'URGENTE').length})
            </button>
            <button
              onClick={() => setFilter('RECOMENDADO')}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1',
                filter === 'RECOMENDADO'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50'
              )}
            >
              <Flame className="w-3.5 h-3.5" />
              Alta Demanda ({recommendations.filter((i) => i.urgency === 'RECOMENDADO').length})
            </button>
          </div>

          <button
            onClick={handleSelectAll}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline py-1"
          >
            {selectedIds.size === filteredItems.length ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
        </div>

        {/* Product Items List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 divide-y divide-slate-100">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-slate-700">Nenhum insumo pendente neste filtro</p>
              <p className="text-xs text-slate-400 mt-1">Todos os insumos desta categoria estão equilibrados.</p>
            </div>
          ) : (
            filteredItems.map((item) => {
              const isSelected = selectedIds.has(item.product_id);
              const currentQty = quantities[item.product_id] ?? item.recommended_order_qty;

              return (
                <div
                  key={item.product_id}
                  className={clsx(
                    'pt-3 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl transition-colors border',
                    isSelected
                      ? 'bg-blue-50/50 border-blue-200'
                      : 'bg-white border-slate-200 opacity-65 hover:opacity-100'
                  )}
                >
                  {/* Select Checkbox & Product Details */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSelect(item.product_id)}
                      className={clsx(
                        'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors border',
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-slate-300 text-transparent hover:border-slate-400'
                      )}
                      aria-label={`Selecionar ${item.name}`}
                    >
                      <Check className="w-4 h-4" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 leading-tight">
                          {item.name}
                        </span>
                        {item.urgency === 'URGENTE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                            <AlertTriangle className="w-3 h-3" />
                            URGENTE
                          </span>
                        )}
                        {item.urgency === 'RECOMENDADO' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            <Flame className="w-3 h-3" />
                            ALTA DEMANDA
                          </span>
                        )}
                        {item.urgency === 'ROTINA' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            ROTINA
                          </span>
                        )}
                      </div>

                      {/* Reasons & Metrics */}
                      <p className="text-xs text-slate-600 mt-1 flex items-start gap-1">
                        <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span>{item.recommendation_reason}</span>
                      </p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1.5 flex-wrap">
                        <span>
                          Depósito Central: <strong className="text-slate-700">{item.available_stock} {item.unit}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Consumo médio: <strong className="text-slate-700">{item.avg_daily_consumption} {item.unit}/dia</strong>
                        </span>
                        {item.days_since_last_order !== null && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5 text-slate-600">
                              <Clock className="w-3 h-3 text-slate-400" />
                              Último pedido há {item.days_since_last_order} dias
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quantity Stepper */}
                  <div className="flex items-center justify-end gap-2 pl-9 sm:pl-0">
                    <span className="text-xs text-slate-500 hidden sm:inline">Qtd:</span>
                    <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shadow-sm">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.product_id, -1, item.available_stock)}
                        disabled={currentQty <= 1}
                        className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 touch-target flex items-center justify-center"
                        aria-label="Diminuir quantidade"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={item.available_stock}
                        value={currentQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val > 0) {
                            handleUpdateQty(item.product_id, val - currentQty, item.available_stock);
                          }
                        }}
                        className="w-12 text-center text-xs font-bold text-slate-800 focus:outline-none"
                      />
                      <span className="pr-1.5 text-[11px] font-semibold text-slate-500">{item.unit}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.product_id, 1, item.available_stock)}
                        disabled={currentQty >= item.available_stock}
                        className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 touch-target flex items-center justify-center"
                        aria-label="Aumentar quantidade"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600 text-center sm:text-left">
            <span>
              Selecionados: <strong className="text-blue-700">{selectedCount}</strong> de {filteredItems.length} insumos
            </span>
            <span className="mx-2">•</span>
            <span>
              Total: <strong className="text-slate-900">{totalUnitsToAdd} unidades</strong>
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmAdd}
              disabled={selectedCount === 0}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <ShoppingBag className="w-4 h-4" />
              Adicionar ao Carrinho ({totalUnitsToAdd})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
