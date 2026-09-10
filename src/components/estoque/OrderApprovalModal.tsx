// InsumoSync: OrderApprovalModal — Triagem e aprovação de pedidos pelo Depósito
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Truck,
  Clock,
  Edit3,
  Loader2,
  Package,
} from 'lucide-react';
import type { Order, OrderItem } from '@/types/database';

interface ApprovalItem {
  item: OrderItem;
  approvedQty: number;
}

interface OrderApprovalModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onApprove: (orderId: string, approvedItems: { itemId: string; approvedQty: number }[], action: 'approve' | 'delay', delayReason?: string) => Promise<void>;
  isSubmitting?: boolean;
}

const DELAY_REASONS = [
  'Falta de Produto',
  'Transporte Indisponível',
  'Problema Logístico',
  'Aguardando Reposição de Fornecedor',
  'Outro',
];

export function OrderApprovalModal({
  isOpen,
  order,
  onClose,
  onApprove,
  isSubmitting = false,
}: OrderApprovalModalProps) {
  const [approvalItems, setApprovalItems] = useState<ApprovalItem[]>([]);
  const [action, setAction] = useState<'approve' | 'delay'>('approve');
  const [delayReason, setDelayReason] = useState('');
  const [customDelayReason, setCustomDelayReason] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Initialize items when order changes
  React.useEffect(() => {
    if (order && !initialized) {
      setApprovalItems(
        (order.order_items ?? []).map((item) => ({
          item,
          approvedQty: item.requested_qty,
        }))
      );
      setInitialized(true);
    }
  }, [order, initialized]);

  React.useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
      setAction('approve');
      setDelayReason('');
      setCustomDelayReason('');
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const updateQty = (itemId: string, delta: number) => {
    setApprovalItems((prev) =>
      prev.map((ai) => {
        if (ai.item.id !== itemId) return ai;
        const max = ai.item.requested_qty;
        const next = Math.max(0, Math.min(ai.approvedQty + delta, max));
        return { ...ai, approvedQty: next };
      })
    );
  };

  const finalDelayReason = delayReason === 'Outro' ? customDelayReason : delayReason;
  const canSubmit =
    action === 'approve'
      ? approvalItems.some((ai) => ai.approvedQty > 0)
      : !!finalDelayReason.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onApprove(
      order.id,
      approvalItems.map((ai) => ({ itemId: ai.item.id, approvedQty: ai.approvedQty })),
      action,
      action === 'delay' ? finalDelayReason : undefined
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Triagem do Pedido</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">#{order.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Action Selector */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-xs font-semibold text-slate-600 mb-2">Ação para este pedido:</p>
            <div className="flex gap-2">
              <button
                onClick={() => setAction('approve')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all min-h-[44px] ${
                  action === 'approve'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Truck className="w-4 h-4" />
                Aprovar & Despachar
              </button>
              <button
                onClick={() => setAction('delay')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all min-h-[44px] ${
                  action === 'delay'
                    ? 'bg-amber-50 border-amber-400 text-amber-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Registrar Atraso
              </button>
            </div>
          </div>

          {/* Items with qty adjustment (approve mode) */}
          {action === 'approve' && (
            <div className="px-5 pb-3 space-y-2">
              <div className="flex items-center gap-1.5 mb-2">
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs font-semibold text-slate-600">Ajuste as quantidades aprovadas:</p>
              </div>
              {approvalItems.map(({ item, approvedQty }) => {
                const product = item.product;
                const isPartial = approvedQty < item.requested_qty;
                return (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {product?.name ?? item.product_id}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Solicitado: <span className="font-medium">{item.requested_qty} {product?.unit}</span>
                        {isPartial && (
                          <span className="ml-2 text-amber-600 font-medium">→ Parcial</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => updateQty(item.id, -1)}
                        disabled={approvedQty <= 0}
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center text-slate-700 active:scale-95 transition-all min-w-[44px] min-h-[44px]"
                      >
                        <span className="text-base font-bold">−</span>
                      </button>
                      <span className="w-10 text-center text-sm font-bold text-slate-900 tabular-nums">
                        {approvedQty}
                      </span>
                      <button
                        onClick={() => updateQty(item.id, 1)}
                        disabled={approvedQty >= item.requested_qty}
                        className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 flex items-center justify-center text-white active:scale-95 transition-all min-w-[44px] min-h-[44px]"
                      >
                        <span className="text-base font-bold">+</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {approvalItems.every((ai) => ai.approvedQty === 0) && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Pelo menos 1 item deve ter quantidade aprovada &gt; 0.
                </div>
              )}
            </div>
          )}

          {/* Delay reason (delay mode) */}
          {action === 'delay' && (
            <div className="px-5 pb-3 space-y-3">
              <p className="text-xs font-semibold text-slate-600">Selecione o motivo do atraso:</p>
              <div className="space-y-2">
                {DELAY_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setDelayReason(r)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl text-sm border-2 transition-all min-h-[44px] ${
                      delayReason === r
                        ? 'bg-amber-50 border-amber-400 text-amber-800 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {delayReason === 'Outro' && (
                <textarea
                  value={customDelayReason}
                  onChange={(e) => setCustomDelayReason(e.target.value)}
                  placeholder="Descreva o motivo do atraso..."
                  rows={2}
                  className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none placeholder:text-slate-400"
                />
              )}
            </div>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="mx-5 mb-3 p-3 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-2">
              <Package className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-blue-700">Obs. do Restaurante</p>
                <p className="text-xs text-blue-600 mt-0.5">{order.notes}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`flex-[2] py-3 font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] disabled:opacity-50 disabled:cursor-not-allowed ${
              action === 'approve'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processando...</>
            ) : action === 'approve' ? (
              <><Truck className="w-4 h-4" /> Confirmar Despacho</>
            ) : (
              <><Clock className="w-4 h-4" /> Registrar Atraso</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
