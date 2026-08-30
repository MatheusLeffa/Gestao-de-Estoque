// InsumoSync: CartBottomSheet — Gaveta mobile de revisão e envio do carrinho
// Author: ui-ux-designer / frontend-engineer

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, ShoppingBag, Send, Minus, Plus, AlertCircle, Loader2 } from 'lucide-react';
import type { Product } from '@/types/database';

export interface CartItem {
  product: Product;
  qty: number;
}

interface CartBottomSheetProps {
  isOpen: boolean;
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onSubmit: (notes: string) => Promise<void>;
  isSubmitting?: boolean;
}

export function CartBottomSheet({
  isOpen,
  items,
  onClose,
  onUpdateQty,
  onSubmit,
  isSubmitting = false,
}: CartBottomSheetProps) {
  const [notes, setNotes] = useState('');
  const sheetRef = useRef<HTMLDivElement>(null);

  // Trava scroll do body quando aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setNotes('');
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Fecha ao clicar fora da gaveta
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
      if (!isSubmitting) onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Revisar carrinho"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85dvh] animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">Revisar Pedido</h2>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {items.length} {items.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors"
            aria-label="Fechar carrinho"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {items.map(({ product, qty }) => {
            const isAtMax = qty >= product.current_stock;
            return (
              <div
                key={product.id}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{product.name}</p>
                  <p className="text-xs text-slate-500">
                    Disponível: <span className="font-medium text-slate-700">{product.current_stock} {product.unit}</span>
                  </p>
                  {isAtMax && (
                    <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
                      <AlertCircle className="w-3 h-3" /> Máximo disponível atingido
                    </p>
                  )}
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onUpdateQty(product.id, -1)}
                    className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 transition-all shadow-xs min-w-[44px] min-h-[44px]"
                    aria-label={`Diminuir ${product.name}`}
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-slate-900 tabular-nums">{qty}</span>
                  <button
                    onClick={() => onUpdateQty(product.id, 1)}
                    disabled={isAtMax}
                    className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white active:scale-95 transition-all shadow-xs min-w-[44px] min-h-[44px]"
                    aria-label={`Aumentar ${product.name}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Notes & Submit */}
        <div className="px-5 pt-3 pb-6 border-t border-slate-100 space-y-3">
          <div>
            <label htmlFor="cart-notes" className="text-xs font-semibold text-slate-700 mb-1 block">
              Observações para o Depósito (opcional)
            </label>
            <textarea
              id="cart-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: Prioridade alta, urgente para o almoço de domingo..."
              rows={2}
              className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none placeholder:text-slate-400"
            />
          </div>

          <button
            onClick={() => onSubmit(notes)}
            disabled={isSubmitting || items.length === 0}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] shadow-sm flex items-center justify-center gap-2 min-h-[52px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando pedido...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Enviar Pedido ao Depósito
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
