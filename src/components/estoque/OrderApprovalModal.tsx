// InsumoSync: OrderApprovalModal — Separação & Análise de pedidos pelo Depósito (Mobile-First Polish)
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Truck,
  Clock,
  Edit3,
  Loader2,
  Package,
  MessageSquare,
} from 'lucide-react';
import type { Order, OrderItem } from '@/types/database';

interface ApprovalItem {
  item: OrderItem;
  approvedQty: number;
  reductionReason: string;
}

interface OrderApprovalModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onApprove: (
    orderId: string,
    approvedItems: { itemId: string; approvedQty: number; reductionReason?: string }[],
    action: 'approve' | 'delay',
    delayReason?: string,
    depositNotes?: string
  ) => Promise<void>;
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
  const [depositNotes, setDepositNotes] = useState('');
  const [validationError, setValidationError] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Inicializa itens quando o pedido abre
  useEffect(() => {
    if (order && !initialized) {
      setApprovalItems(
        (order.order_items ?? []).map((item) => ({
          item,
          approvedQty: item.approved_qty ?? item.requested_qty,
          reductionReason: item.reduction_reason ?? '',
        }))
      );
      setDepositNotes(order.deposit_notes ?? '');
      setInitialized(true);
    }
  }, [order, initialized]);

  useEffect(() => {
    if (!isOpen) {
      setInitialized(false);
      setAction('approve');
      setDelayReason('');
      setCustomDelayReason('');
      setDepositNotes('');
      setValidationError('');
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const updateQty = (itemId: string, delta: number) => {
    setValidationError('');
    setApprovalItems((prev) =>
      prev.map((ai) => {
        if (ai.item.id !== itemId) return ai;
        const max = ai.item.requested_qty;
        const next = Math.max(0, Math.min(ai.approvedQty + delta, max));
        return { ...ai, approvedQty: next };
      })
    );
  };

  const updateReductionReason = (itemId: string, reason: string) => {
    setValidationError('');
    setApprovalItems((prev) =>
      prev.map((ai) => (ai.item.id === itemId ? { ...ai, reductionReason: reason } : ai))
    );
  };

  const finalDelayReason = delayReason === 'Outro' ? customDelayReason : delayReason;

  // Itens que sofreram redução em relação ao solicitado
  const reducedItems = approvalItems.filter((ai) => ai.approvedQty < ai.item.requested_qty);
  const hasUnjustifiedReductions = reducedItems.some((ai) => !ai.reductionReason.trim());

  const canSubmit =
    action === 'approve'
      ? approvalItems.some((ai) => ai.approvedQty > 0) && !hasUnjustifiedReductions
      : !!finalDelayReason.trim();

  const handleSubmit = async () => {
    if (action === 'approve') {
      if (hasUnjustifiedReductions) {
        setValidationError('Por favor, informe a justificativa individual para todos os itens com quantidade reduzida.');
        return;
      }
      if (approvalItems.every((ai) => ai.approvedQty === 0)) {
        setValidationError('Pelo menos 1 insumo deve ter quantidade aprovada maior que zero.');
        return;
      }
    }

    if (action === 'delay' && !finalDelayReason.trim()) {
      setValidationError('Selecione ou descreva o motivo do atraso.');
      return;
    }

    setValidationError('');
    await onApprove(
      order.id,
      approvalItems.map((ai) => ({
        itemId: ai.item.id,
        approvedQty: ai.approvedQty,
        reductionReason: ai.approvedQty < ai.item.requested_qty ? ai.reductionReason.trim() : undefined,
      })),
      action,
      action === 'delay' ? finalDelayReason : undefined,
      depositNotes.trim() || undefined
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[88dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle Mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header Fixo */}
        <div className="flex items-start justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 shrink-0">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                Separação & Análise do Pedido
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5 truncate">
              #{order.id.slice(0, 8).toUpperCase()} • {order.restaurant?.name ?? 'Restaurante'}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors shrink-0"
            title="Fechar (pedido permanece em análise)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Área de Conteúdo Rolável */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3.5 min-h-0 overscroll-contain">
          {/* Action Selector */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Ação para este pedido:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAction('approve');
                  setValidationError('');
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all min-h-[44px] ${
                  action === 'approve'
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Truck className="w-4 h-4" />
                <span>Aprovar & Despachar</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAction('delay');
                  setValidationError('');
                }}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold border-2 transition-all min-h-[44px] ${
                  action === 'delay'
                    ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Registrar Atraso</span>
              </button>
            </div>
          </div>

          {/* Ajuste de Quantidades (Mobile-Optimized Cards) */}
          {action === 'approve' && (
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                <p className="text-xs font-semibold text-slate-600">Ajuste as quantidades separadas:</p>
              </div>

              {approvalItems.map(({ item, approvedQty, reductionReason }) => {
                const product = item.product;
                const isReduced = approvedQty < item.requested_qty;
                const missingQty = item.requested_qty - approvedQty;

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition-all space-y-2.5 ${
                      isReduced
                        ? 'bg-amber-50/40 border-amber-300 shadow-xs'
                        : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    {/* Título do Produto Completo sem truncate agressivo */}
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-slate-900 leading-snug break-words">
                        {product?.name ?? item.product_id}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[11px] font-medium text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-md">
                          {product?.category}
                        </span>
                        {isReduced && (
                          <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-md text-[11px]">
                            Falta: -{missingQty} {product?.unit}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Linha de Quantidade e Controles de Toque */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                      <div className="text-xs text-slate-500">
                        Pedido: <strong className="text-slate-800">{item.requested_qty} {product?.unit}</strong>
                      </div>

                      {/* Botões numéricos touch confortáveis */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, -1)}
                          disabled={approvedQty <= 0}
                          className="w-10 h-10 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center text-slate-700 active:scale-95 transition-all min-w-[44px] min-h-[44px] shadow-xs"
                          aria-label="Diminuir"
                        >
                          <span className="text-xl font-bold leading-none">−</span>
                        </button>
                        <div className="min-w-[44px] text-center">
                          <span className="text-base font-extrabold text-slate-900 tabular-nums">
                            {approvedQty}
                          </span>
                          <span className="text-[10px] text-slate-400 block -mt-1 font-medium">{product?.unit}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 1)}
                          disabled={approvedQty >= item.requested_qty}
                          className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-30 flex items-center justify-center text-white active:scale-95 transition-all min-w-[44px] min-h-[44px] shadow-xs"
                          aria-label="Aumentar"
                        >
                          <span className="text-xl font-bold leading-none">+</span>
                        </button>
                      </div>
                    </div>

                    {/* Justificativa Obrigatória de Redução */}
                    {isReduced && (
                      <div className="pt-2 border-t border-amber-200/80 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Justificativa da redução <strong className="text-red-600">*</strong>:</span>
                          </label>
                          <span className="text-[10px] text-amber-700 font-medium">Visível na conferência</span>
                        </div>
                        <input
                          type="text"
                          value={reductionReason}
                          onChange={(e) => updateReductionReason(item.id, e.target.value)}
                          placeholder="Ex: Estoque físico insuficiente, avaria de embalagem..."
                          className={`w-full text-xs sm:text-sm px-3 py-2 rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/30 min-h-[40px] ${
                            !reductionReason.trim()
                              ? 'border-red-300 bg-red-50/50 text-slate-900 placeholder:text-red-400'
                              : 'border-amber-300 bg-white text-slate-900'
                          }`}
                        />
                        {!reductionReason.trim() && (
                          <p className="text-[11px] text-red-600 font-semibold">
                            Obrigatório explicar o motivo da redução deste item.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Observações Gerais do Depósito */}
              <div className="pt-1">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
                  <label className="text-xs font-semibold text-slate-700">
                    Observações gerais do depósito (opcional):
                  </label>
                </div>
                <textarea
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  placeholder="Instruções para o entregador ou aviso para o restaurante..."
                  rows={2}
                  className="w-full text-xs sm:text-sm px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none placeholder:text-slate-400"
                />
              </div>
            </div>
          )}

          {/* Modo Atraso */}
          {action === 'delay' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600">Selecione o motivo do atraso:</p>
              <div className="space-y-2">
                {DELAY_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setDelayReason(r)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-xs sm:text-sm border-2 transition-all min-h-[44px] ${
                      delayReason === r
                        ? 'bg-amber-50 border-amber-400 text-amber-800 font-bold'
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
                  placeholder="Descreva detalhadamente o motivo do atraso..."
                  rows={3}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none placeholder:text-slate-400"
                />
              )}
            </div>
          )}

          {/* Obs. do Restaurante */}
          {order.notes && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 flex items-start gap-2">
              <Package className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-800">Obs. do Restaurante</p>
                <p className="text-xs text-blue-700 mt-0.5">{order.notes}</p>
              </div>
            </div>
          )}

          {/* Erro de Validação */}
          {validationError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        {/* Footer Fixo com Safe Area e Fundo Opaco */}
        <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-t border-slate-200 bg-white/95 backdrop-blur-md rounded-b-3xl shrink-0 flex gap-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-lg">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs sm:text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[50px] shadow-xs active:scale-[0.98]"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className={`flex-[2] py-3 font-bold text-xs sm:text-sm rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 min-h-[50px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${
              action === 'approve'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-600 hover:bg-amber-700 text-white'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processando...
              </>
            ) : action === 'approve' ? (
              <>
                <Truck className="w-4 h-4" />
                Confirmar Despacho
              </>
            ) : (
              <>
                <Clock className="w-4 h-4" />
                Registrar Atraso
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
