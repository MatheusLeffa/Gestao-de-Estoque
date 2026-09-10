// InsumoSync: RestockModal — Reabastecimento manual de insumos pelo Depósito
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState } from 'react';
import { X, Plus, Package, Loader2, AlertCircle } from 'lucide-react';
import type { Product } from '@/types/database';

interface RestockModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onRestock: (productId: string, quantity: number, reason: string) => Promise<void>;
  isSubmitting?: boolean;
}

const RESTOCK_REASONS = [
  'Chegada de Fornecedor',
  'Transferência entre Unidades',
  'Devolução de Restaurante',
  'Ajuste de Inventário',
];

export function RestockModal({
  isOpen,
  product,
  onClose,
  onRestock,
  isSubmitting = false,
}: RestockModalProps) {
  const [quantity, setQuantity] = useState<string>('');
  const [reason, setReason] = useState('Chegada de Fornecedor');
  const [customReason, setCustomReason] = useState('');
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!isOpen) {
      setQuantity('');
      setError('');
      setReason('Chegada de Fornecedor');
      setCustomReason('');
    }
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const parsedQty = parseFloat(quantity);
  const isValidQty = !isNaN(parsedQty) && parsedQty > 0;
  const finalReason = reason === 'Outro' ? customReason : reason;

  const handleSubmit = async () => {
    if (!isValidQty) {
      setError('Informe uma quantidade válida maior que zero.');
      return;
    }
    setError('');
    await onRestock(product.id, parsedQty, finalReason);
  };

  const quickAdd = (val: number) => {
    setQuantity(String(val));
    setError('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">{product.name}</h2>
              <p className="text-xs text-slate-500">
                Saldo atual: <span className="font-semibold text-slate-700">{product.current_stock} {product.unit}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Quick-add buttons */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Quantidade rápida ({product.unit}):</p>
            <div className="flex gap-2">
              {[5, 10, 20, 50].map((v) => (
                <button
                  key={v}
                  onClick={() => quickAdd(v)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all min-h-[44px] ${
                    quantity === String(v)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  +{v}
                </button>
              ))}
            </div>
          </div>

          {/* Custom qty input */}
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              Ou digite a quantidade:
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={quantity}
              onChange={(e) => { setQuantity(e.target.value); setError(''); }}
              placeholder={`Ex.: 25 ${product.unit}`}
              className={`w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                error ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
              }`}
            />
            {error && (
              <p className="text-xs text-red-500 flex items-center gap-1 mt-1.5">
                <AlertCircle className="w-3 h-3" /> {error}
              </p>
            )}
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Motivo do reabastecimento:</p>
            <div className="flex flex-wrap gap-2">
              {[...RESTOCK_REASONS, 'Outro'].map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all min-h-[36px] ${
                    reason === r
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === 'Outro' && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Descreva o motivo..."
                className="mt-2 w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValidQty || isSubmitting}
            className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px]"
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Atualizando...</>
            ) : (
              <><Plus className="w-4 h-4" /> Adicionar ao Estoque</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
