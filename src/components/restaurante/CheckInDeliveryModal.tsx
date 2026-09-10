// InsumoSync: CheckInDeliveryModal — Conferência de entrega pelo restaurante com comparativo de itens e justificativas do depósito
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  PackageCheck,
  PackageX,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Package,
  FileText,
  MessageSquare,
} from 'lucide-react';
import type { Order, CompletionType } from '@/types/database';

interface CheckInDeliveryModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onConfirm: (completionType: CompletionType, reason?: string) => Promise<void>;
  isSubmitting?: boolean;
}

const DELIVERY_OPTIONS: {
  type: CompletionType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  requiresReason: boolean;
}[] = [
  {
    type: 'TOTAL',
    label: 'Entrega Total',
    description: 'Todos os itens enviados foram recebidos corretamente.',
    icon: CheckCircle2,
    colorClass: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    requiresReason: false,
  },
  {
    type: 'PARCIAL',
    label: 'Entrega Parcial',
    description: 'Apenas parte dos itens enviados foi recebida.',
    icon: PackageCheck,
    colorClass: 'border-amber-300 bg-amber-50 text-amber-700',
    requiresReason: true,
  },
  {
    type: 'NAO_ENTREGUE',
    label: 'Não Entregue',
    description: 'Nenhum item foi entregue.',
    icon: PackageX,
    colorClass: 'border-red-300 bg-red-50 text-red-700',
    requiresReason: true,
  },
];

export function CheckInDeliveryModal({
  isOpen,
  order,
  onClose,
  onConfirm,
  isSubmitting = false,
}: CheckInDeliveryModalProps) {
  const [selected, setSelected] = useState<CompletionType | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  if (!isOpen || !order) return null;

  const items = order.order_items ?? [];
  const selectedOption = DELIVERY_OPTIONS.find((o) => o.type === selected);

  const handleConfirm = async () => {
    if (!selected) return;

    if (selectedOption?.requiresReason && !reason.trim()) {
      setReasonError('Por favor, informe o motivo para prosseguir com a conferência.');
      return;
    }

    setReasonError('');
    await onConfirm(selected, reason.trim() || undefined);
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSelected(null);
      setReason('');
      setReasonError('');
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar entrega"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Sheet / Modal */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle Mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Conferir Entrega</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Pedido #{order.id.slice(0, 8).toUpperCase()} • Conferência de chegada
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo Rolável */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Observações do Depósito (se houver) */}
          {order.deposit_notes && (
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-800">
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>Observação do Depósito Central:</span>
              </div>
              <p className="text-xs text-blue-800/90 pl-5 leading-relaxed">
                {order.deposit_notes}
              </p>
            </div>
          )}

          {/* Comparativo de Insumos: Solicitado vs Enviado */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-slate-500" />
                <span>Insumos do Pedido (Conferência):</span>
              </p>
              <span className="text-[11px] text-slate-400 font-medium">
                {items.length} {items.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            <div className="space-y-2 border border-slate-200/80 rounded-2xl p-2.5 bg-slate-50/50">
              {items.map((item) => {
                const product = item.product;
                const requested = Number(item.requested_qty);
                const approved = item.approved_qty !== null ? Number(item.approved_qty) : requested;
                const isReduced = approved < requested;
                const isZero = approved === 0;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isZero
                        ? 'bg-red-50/40 border-red-200'
                        : isReduced
                        ? 'bg-amber-50/40 border-amber-200'
                        : 'bg-white border-slate-200/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {product?.name ?? 'Insumo'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {product?.category}
                        </p>
                      </div>

                      {/* Quantidades Solicitado x Enviado */}
                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-slate-900">
                          Enviado:{' '}
                          <span className={isReduced ? 'text-amber-700 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                            {approved} {product?.unit}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          (Pedido: {requested} {product?.unit})
                        </div>
                      </div>
                    </div>

                    {/* Alerta e Justificativa de Redução do Depósito */}
                    {isReduced && (
                      <div className="mt-2 pt-2 border-t border-amber-200/70 space-y-1">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-amber-800">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>
                            {isZero ? 'Item não enviado pelo depósito' : `Reduzido pelo depósito (-${requested - approved} ${product?.unit})`}
                          </span>
                        </div>
                        {item.reduction_reason ? (
                          <p className="text-xs text-amber-900 bg-amber-100/60 px-2.5 py-1.5 rounded-lg font-medium">
                            <strong>Motivo do Depósito:</strong> {item.reduction_reason}
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-700 italic">
                            Sem justificativa registrada pelo depósito.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Opções de Desfecho da Entrega */}
          <div className="pt-2 space-y-2.5">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Como foi a entrega física recebida?
            </p>

            <div className="space-y-2">
              {DELIVERY_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isSelected = selected === opt.type;
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => {
                      setSelected(opt.type);
                      setReason('');
                      setReasonError('');
                    }}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all min-h-[64px] active:scale-[0.98] ${
                      isSelected
                        ? opt.colorClass + ' ring-2 ring-offset-1 ring-current/30 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-white/70' : 'bg-slate-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-bold text-xs sm:text-sm">{opt.label}</p>
                      <p className="text-[11px] opacity-75 mt-0.5">{opt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Input de motivo para Parcial ou Não Entregue */}
            {selectedOption?.requiresReason && (
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-700 block">
                  Motivo da Divergência / Faltas <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setReasonError('');
                  }}
                  placeholder={
                    selected === 'PARCIAL'
                      ? 'Ex.: Motorista entregou 1 caixa a menos do que o constava na nota...'
                      : 'Ex.: Pedido extraviado, mercadoria recusada por problemas térmicos...'
                  }
                  rows={2}
                  className={`w-full text-xs sm:text-sm px-3 py-2 rounded-xl border resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-slate-400 ${
                    reasonError ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
                  }`}
                />
                {reasonError && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {reasonError}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-slate-100 flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || isSubmitting}
            className="flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Confirmando...
              </>
            ) : (
              'Confirmar Entrega'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
