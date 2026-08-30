// InsumoSync: CheckInDeliveryModal — Conferência de entrega pelo restaurante
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState } from 'react';
import { X, CheckCircle2, PackageCheck, PackageX, Loader2, AlertCircle } from 'lucide-react';
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
    description: 'Todos os itens foram recebidos corretamente.',
    icon: CheckCircle2,
    colorClass: 'border-emerald-300 bg-emerald-50 text-emerald-700',
    requiresReason: false,
  },
  {
    type: 'PARCIAL',
    label: 'Entrega Parcial',
    description: 'Apenas parte dos itens foi recebida.',
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

  const selectedOption = DELIVERY_OPTIONS.find((o) => o.type === selected);

  const handleConfirm = async () => {
    if (!selected) return;

    if (selectedOption?.requiresReason && !reason.trim()) {
      setReasonError('Por favor, informe o motivo para prosseguir.');
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
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Conferir Entrega</h2>
            <p className="text-xs text-slate-500 mt-0.5">Como foi a entrega do pedido?</p>
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

        {/* Options */}
        <div className="px-5 py-4 space-y-3">
          {DELIVERY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selected === opt.type;
            return (
              <button
                key={opt.type}
                onClick={() => {
                  setSelected(opt.type);
                  setReason('');
                  setReasonError('');
                }}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition-all min-h-[72px] active:scale-[0.98] ${
                  isSelected
                    ? opt.colorClass + ' ring-2 ring-offset-1 ring-current/30'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-white/60' : 'bg-slate-100'
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{opt.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{opt.description}</p>
                </div>
              </button>
            );
          })}

          {/* Reason input for partial/not delivered */}
          {selectedOption?.requiresReason && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">
                Motivo <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (e.target.value.trim()) setReasonError('');
                }}
                placeholder={
                  selected === 'PARCIAL'
                    ? 'Ex.: Faltaram 3 caixas de alface, motorista não esperou...'
                    : 'Ex.: Pedido extraviado, veículo com defeito...'
                }
                rows={2}
                className={`w-full text-sm px-3 py-2 rounded-xl border resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 placeholder:text-slate-400 ${
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

        {/* Actions */}
        <div className="px-5 pb-6 flex gap-3">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || isSubmitting}
            className="flex-2 flex-[2] py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px]"
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
