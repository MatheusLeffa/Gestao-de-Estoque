// InsumoSync: KitchenLossSheet — Gaveta de registro de perda/descarte da cozinha
// Motivo segue o padrão do projeto: opções fixas + "Outro (descrever)" obrigatório.

'use client';

import React, { useEffect, useState } from 'react';
import { X, Trash2, Loader2, AlertCircle } from 'lucide-react';
import type { KitchenStockItem, KitchenLossReason } from '@/types/database';

interface KitchenLossSheetProps {
  isOpen: boolean;
  items: KitchenStockItem[];
  onClose: () => void;
  /** Devolve a mensagem de erro do servidor, ou `null` em caso de sucesso. */
  onSubmit: (productId: string, quantity: number, reason: string) => Promise<string | null>;
}

const LOSS_REASONS: { value: KitchenLossReason; label: string }[] = [
  { value: 'Vencido', label: 'Vencido' },
  { value: 'Estragado / deteriorado', label: 'Estragado / deteriorado' },
  { value: 'Erro de preparo', label: 'Erro de preparo' },
  { value: 'Avaria no armazenamento', label: 'Avaria no armazenamento' },
  { value: 'Outro', label: 'Outro (descrever)' },
];

export function KitchenLossSheet({ isOpen, items, onClose, onSubmit }: KitchenLossSheetProps) {
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<KitchenLossReason | null>(null);
  const [otherText, setOtherText] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setProductId('');
      setQty('');
      setReason(null);
      setOtherText('');
      setError('');
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Só dá para perder o que existe na cozinha
  const available = items.filter((it) => it.quantity > 0);
  const selected = available.find((it) => it.product_id === productId) ?? null;

  const handleSubmit = async () => {
    const quantity = Number(qty.replace(',', '.'));
    if (!selected) return setError('Selecione o insumo perdido.');
    if (!qty.trim() || !Number.isFinite(quantity) || quantity <= 0) return setError('Informe uma quantidade maior que zero.');
    if (quantity > selected.quantity) {
      return setError(`A perda não pode passar do saldo da cozinha (${selected.quantity} ${selected.unit}).`);
    }
    if (!reason) return setError('Escolha o motivo da perda.');
    if (reason === 'Outro' && !otherText.trim()) return setError('Descreva o motivo da perda.');

    setError('');
    setIsSubmitting(true);
    const finalReason = reason === 'Outro' ? `Outro: ${otherText.trim()}` : reason;
    const serverError = await onSubmit(selected.product_id, quantity, finalReason);
    setIsSubmitting(false);
    if (serverError) setError(serverError);
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Registrar perda">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-t-3xl shadow-2xl w-full sm:max-w-lg sm:mx-auto max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-start justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" /> Registrar Perda
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Descartes saem do saldo da cozinha e não contam como consumo.</p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-11 h-11 -mr-2 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500 disabled:opacity-50 shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {available.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">Nenhum insumo com saldo na cozinha para registrar perda.</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor="loss-product" className="text-xs font-semibold text-slate-700 block">
                  Insumo <span className="text-red-500">*</span>
                </label>
                <select
                  id="loss-product"
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setError('');
                  }}
                  className="w-full h-11 px-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                >
                  <option value="">Selecione...</option>
                  {available.map((it) => (
                    <option key={it.product_id} value={it.product_id}>
                      {it.name} — {it.quantity} {it.unit}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="loss-qty" className="text-xs font-semibold text-slate-700 block">
                  Quantidade perdida {selected && `(${selected.unit}, máx. ${selected.quantity})`} <span className="text-red-500">*</span>
                </label>
                <input
                  id="loss-qty"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={selected?.quantity}
                  step="any"
                  value={qty}
                  onChange={(e) => {
                    setQty(e.target.value);
                    setError('');
                  }}
                  placeholder="0"
                  className="w-full h-11 px-3 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-xs font-semibold text-slate-700 mb-1.5">
                  Motivo <span className="text-red-500">*</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {LOSS_REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => {
                        setReason(r.value);
                        setError('');
                      }}
                      aria-pressed={reason === r.value}
                      className={`px-3 min-h-[44px] rounded-xl text-xs font-semibold border transition-all ${
                        reason === r.value
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {reason === 'Outro' && (
                  <textarea
                    value={otherText}
                    onChange={(e) => {
                      setOtherText(e.target.value);
                      setError('');
                    }}
                    rows={2}
                    placeholder="Descreva o que aconteceu..."
                    aria-label="Descrição do motivo"
                    className="w-full mt-2 text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 resize-none focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  />
                )}
              </fieldset>
            </>
          )}
        </div>

        <div className="px-5 pb-6 pt-3 border-t border-slate-100 space-y-2.5">
          {error && (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || available.length === 0}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Registrando...
              </>
            ) : (
              'Registrar Perda'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
