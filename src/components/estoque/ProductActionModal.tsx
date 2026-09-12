// InsumoSync: ProductActionModal — Desativação e Remoção Definitiva de Produto
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  EyeOff,
  AlertOctagon,
  Loader2,
  AlertTriangle,
  Package,
  ShieldAlert,
  Trash2,
  Archive,
} from 'lucide-react';
import type { Product, ProductActionMode } from '@/types/database';

interface ProductActionModalProps {
  isOpen: boolean;
  product: Product | null;
  /** `deactivate` oculta do catálogo preservando histórico; `delete` remove em definitivo. */
  mode: ProductActionMode;
  /** Pedidos ABERTO/EM_ANALISE com este insumo (vem da RPC `check_product_usage`). */
  conflictCount?: number;
  /** Itens de pedido de qualquer status que já referenciaram o insumo. */
  historyCount?: number;
  /** Ainda consultando o uso no banco. */
  isLoadingUsage?: boolean;
  onClose: () => void;
  onConfirm: (force: boolean) => Promise<void>;
  /** Alterna o modal de remoção para desativação quando a deleção é inviável. */
  onSwitchToDeactivate?: () => void;
  isSubmitting?: boolean;
}

export function ProductActionModal({
  isOpen,
  product,
  mode,
  conflictCount = 0,
  historyCount = 0,
  isLoadingUsage = false,
  onClose,
  onConfirm,
  onSwitchToDeactivate,
  isSubmitting = false,
}: ProductActionModalProps) {
  const [forceConfirmed, setForceConfirmed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForceConfirmed(false);
    }
  }, [isOpen, mode, product?.id]);

  if (!isOpen || !product) return null;

  const isDelete = mode === 'delete';
  const hasConflict = conflictCount > 0;

  // Deleção definitiva só é possível para insumo que nunca apareceu em um pedido.
  // O FK order_items.product_id é ON DELETE RESTRICT: o banco recusaria de qualquer forma.
  const blockedByHistory = isDelete && historyCount > 0;

  const canConfirm =
    !isLoadingUsage && !blockedByHistory && (isDelete || !hasConflict || forceConfirmed);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
      />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle Mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span
              className={`p-1.5 rounded-lg ${
                isDelete ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {isDelete ? <Trash2 className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isDelete ? 'Remover Produto em Definitivo' : 'Desativar Produto'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors min-w-[32px]"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-5 py-4 space-y-4">
          {/* Identificação do insumo */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <Package className="w-5 h-5" />
            </span>
            <div className="text-xs min-w-0">
              <p className="font-bold text-slate-900 truncate">{product.name}</p>
              <p className="text-slate-500">
                {product.category} • {product.current_stock} {product.unit} em estoque
              </p>
            </div>
          </div>

          {isLoadingUsage ? (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verificando o uso deste insumo nos pedidos...
            </div>
          ) : blockedByHistory ? (
            /* Deleção bloqueada: o insumo tem histórico e removê-lo apagaria pedidos */
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-3">
              <div className="flex items-center gap-1.5 font-bold text-red-800">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>Remoção definitiva bloqueada</span>
              </div>
              <p className="pl-5 leading-relaxed text-red-800/90">
                Este insumo já participou de <strong>{historyCount} item(ns) de pedido</strong>.
                Removê-lo em definitivo apagaria esse histórico e quebraria a rastreabilidade
                dos pedidos já realizados.
              </p>
              <p className="pl-5 leading-relaxed text-red-800/90">
                Use a <strong>desativação</strong>: o insumo some do catálogo do restaurante,
                o histórico permanece intacto e você pode reativá-lo quando quiser.
              </p>
              {onSwitchToDeactivate && (
                <button
                  type="button"
                  onClick={onSwitchToDeactivate}
                  className="ml-5 mt-1 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors active:scale-[0.98] min-h-[44px]"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Desativar em vez de remover
                </button>
              )}
            </div>
          ) : isDelete ? (
            /* Deleção liberada: insumo nunca usado */
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-red-800">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>Esta ação é irreversível</span>
              </div>
              <p className="pl-5 leading-relaxed text-red-800/90">
                Este insumo nunca foi usado em nenhum pedido, então pode ser removido com
                segurança. O cadastro e o seu histórico de movimentações de estoque serão
                apagados em definitivo.
              </p>
            </div>
          ) : (
            <>
              {/* Desativação: aviso padrão */}
              <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>O produto será ocultado do catálogo</span>
                </div>
                <p className="pl-5 leading-relaxed text-amber-800/90">
                  O insumo não aparecerá mais para os restaurantes realizarem pedidos. O
                  histórico de pedidos anteriores será mantido e você pode reativá-lo a
                  qualquer momento.
                </p>
              </div>

              {/* Desativação com pedidos em aberto: exige ciência explícita */}
              {hasConflict && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-3">
                  <div className="flex items-center gap-1.5 font-bold text-red-800">
                    <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      Conflito detectado: {conflictCount} pedido
                      {conflictCount !== 1 ? 's' : ''} em aberto
                    </span>
                  </div>
                  <p className="pl-5 leading-relaxed text-red-800/90">
                    Há pedidos <strong>ABERTO</strong> ou <strong>EM ANÁLISE</strong> com este
                    insumo. Ao forçar a desativação, o item será <strong>zerado</strong> nesses
                    pedidos com o motivo registrado como inativação do catálogo, e o saldo
                    reservado <strong>volta automaticamente para o estoque</strong>.
                  </p>
                  <p className="pl-5 leading-relaxed text-red-800/90">
                    Pedido que ficar sem nenhum item será <strong>cancelado automaticamente</strong>,
                    com o motivo registrado na linha do tempo do restaurante.
                  </p>

                  <label className="flex items-start gap-2.5 mt-2 cursor-pointer">
                    <div
                      onClick={() => setForceConfirmed((v) => !v)}
                      className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        forceConfirmed
                          ? 'bg-red-600 border-red-600'
                          : 'bg-white border-red-300 hover:border-red-500'
                      }`}
                    >
                      {forceConfirmed && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-red-800 font-semibold leading-relaxed">
                      Estou ciente de que os pedidos em aberto serão editados, zerando este item
                      com o motivo de inativação do produto.
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white rounded-b-3xl flex gap-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
          >
            {blockedByHistory ? 'Fechar' : 'Cancelar'}
          </button>

          {!blockedByHistory && (
            <button
              type="button"
              onClick={() => onConfirm(hasConflict && forceConfirmed)}
              disabled={isSubmitting || !canConfirm}
              className={`flex-[2] py-3 font-bold text-sm rounded-2xl text-white transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
                isDelete || (hasConflict && forceConfirmed)
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isDelete ? 'Removendo...' : 'Desativando...'}
                </>
              ) : isDelete ? (
                <>
                  <Trash2 className="w-4 h-4" />
                  Remover em Definitivo
                </>
              ) : hasConflict && forceConfirmed ? (
                <>
                  <AlertOctagon className="w-4 h-4" />
                  Forçar Desativação
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4" />
                  Desativar Produto
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
