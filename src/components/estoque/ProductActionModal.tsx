// InsumoSync: ProductActionModal — Confirmação de Desativação de Produto
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
} from 'lucide-react';
import type { Product } from '@/types/database';

interface ProductActionModalProps {
  isOpen: boolean;
  product: Product | null;
  conflictCount?: number; // pedidos ABERTO/EM_ANALISE com este produto
  onClose: () => void;
  onConfirm: (force: boolean) => Promise<void>;
  isSubmitting?: boolean;
}

export function ProductActionModal({
  isOpen,
  product,
  conflictCount = 0,
  onClose,
  onConfirm,
  isSubmitting = false,
}: ProductActionModalProps) {
  const [forceConfirmed, setForceConfirmed] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForceConfirmed(false);
    }
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const hasConflict = conflictCount > 0;
  const canConfirm = !hasConflict || forceConfirmed;

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
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700">
              <EyeOff className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Desativar Produto</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">{product.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="px-5 py-4 space-y-4">
          {/* Info sobre o produto */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <Package className="w-5 h-5" />
            </span>
            <div className="text-xs">
              <p className="font-bold text-slate-900">{product.name}</p>
              <p className="text-slate-500">{product.category} • {product.current_stock} {product.unit} em estoque</p>
            </div>
          </div>

          {/* Aviso padrão */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>O produto será ocultado do catálogo</span>
            </div>
            <p className="pl-5 leading-relaxed text-amber-800/90">
              O produto não aparecerá mais para os restaurantes realizarem pedidos. O histórico de pedidos anteriores será mantido. Você pode reativar o produto a qualquer momento.
            </p>
          </div>

          {/* Aviso de conflito se houver pedidos em aberto */}
          {hasConflict && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-3">
              <div className="flex items-center gap-1.5 font-bold text-red-800">
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                <span>Conflito detectado: {conflictCount} pedido{conflictCount !== 1 ? 's' : ''} em aberto</span>
              </div>
              <p className="pl-5 leading-relaxed text-red-800/90">
                Há pedidos com status <strong>ABERTO</strong> ou <strong>EM ANÁLISE</strong> que contêm este produto. Se forçar a desativação, o item será <strong>zerado (qty = 0)</strong> nesses pedidos com o motivo informado como "Produto inativado pelo depósito".
              </p>

              {/* Checkbox de confirmação */}
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
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-red-800 font-semibold leading-relaxed">
                  Estou ciente de que os pedidos em aberto serão editados, zerando este item com o motivo de inativação do produto.
                </span>
              </label>
            </div>
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(hasConflict && forceConfirmed)}
            disabled={isSubmitting || !canConfirm}
            className={`flex-[2] py-3 font-bold text-sm rounded-2xl text-white transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
              hasConflict && forceConfirmed
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Desativando...
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
        </div>
      </div>
    </div>
  );
}
