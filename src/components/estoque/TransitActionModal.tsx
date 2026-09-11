// InsumoSync: TransitActionModal — Gestão de ocorrências em trânsito (Atraso ou Cancelamento)
// Author: ui-ux-designer / backend-workflow-engine

'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  AlertTriangle,
  XCircle,
  Truck,
  Clock,
  Loader2,
  Package,
  AlertOctagon,
} from 'lucide-react';
import type { Order } from '@/types/database';

interface TransitActionModalProps {
  isOpen: boolean;
  order: Order | null;
  initialAction?: 'delay' | 'cancel';
  onClose: () => void;
  onConfirm: (action: 'delay' | 'cancel', reason: string) => Promise<void>;
  isSubmitting?: boolean;
}

const TRANSIT_DELAY_REASONS = [
  'Congestionamento intenso / Trânsito parado',
  'Pane mecânica no veículo de transporte',
  'Acidente na via / Bloqueio de rota',
  'Atraso na liberação ou logística do entregador',
  'Condições climáticas adversas (chuva forte/alagamento)',
  'Outro (descrever)',
];

const TRANSIT_CANCEL_REASONS = [
  'Avaria / Perda total da carga no trajeto',
  'Acidente grave com o veículo de transporte',
  'Extravio ou furto de mercadoria em trânsito',
  'Restaurante cancelou previamente o recebimento',
  'Insumos sofreram alteração térmica irreversível',
  'Outro (descrever)',
];

export function TransitActionModal({
  isOpen,
  order,
  initialAction = 'delay',
  onClose,
  onConfirm,
  isSubmitting = false,
}: TransitActionModalProps) {
  const [action, setAction] = useState<'delay' | 'cancel'>(initialAction);
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setAction(initialAction);
      setSelectedReason('');
      setCustomReason('');
      setError('');
    }
  }, [isOpen, initialAction]);

  if (!isOpen || !order) return null;

  const reasonList = action === 'delay' ? TRANSIT_DELAY_REASONS : TRANSIT_CANCEL_REASONS;
  const isCustom = selectedReason === 'Outro (descrever)';
  const finalReason = isCustom ? customReason.trim() : selectedReason;

  const handleSubmit = async () => {
    if (!selectedReason) {
      setError('Por favor, selecione um motivo para registrar a ocorrência.');
      return;
    }
    if (isCustom && !customReason.trim()) {
      setError('Por favor, descreva detalhadamente a justificativa.');
      return;
    }

    setError('');
    await onConfirm(action, finalReason);
  };

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

      {/* Sheet Modal */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle Mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
                <Truck className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Ocorrência de Entrega em Trânsito
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Pedido #{order.id.slice(0, 8).toUpperCase()} • {order.restaurant?.name}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Seletor da Ação */}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Selecione o tipo de ocorrência:</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAction('delay');
                  setSelectedReason('');
                  setError('');
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-bold text-xs sm:text-sm transition-all min-h-[48px] active:scale-[0.98] ${
                  action === 'delay'
                    ? 'bg-amber-50 border-amber-400 text-amber-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Apontar Atraso</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAction('cancel');
                  setSelectedReason('');
                  setError('');
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 font-bold text-xs sm:text-sm transition-all min-h-[48px] active:scale-[0.98] ${
                  action === 'cancel'
                    ? 'bg-red-50 border-red-400 text-red-800 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <XCircle className="w-4 h-4 text-red-600" />
                <span>Cancelar Entrega</span>
              </button>
            </div>
          </div>

          {/* Aviso especial em caso de cancelamento */}
          {action === 'cancel' && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-red-800">
                <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                <span>Atenção: Estorno Automático de Estoque</span>
              </div>
              <p className="leading-relaxed text-red-800/90 pl-5">
                O cancelamento em trânsito devolverá imediatamente o saldo dos insumos ao estoque do depósito central. Essa ação não pode ser desfeita.
              </p>
            </div>
          )}

          {/* Motivos pré-definidos */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700">
              Motivo obrigatório da ocorrência <span className="text-red-500">*</span>:
            </p>

            <div className="space-y-1.5">
              {reasonList.map((r) => {
                const isSelected = selectedReason === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setSelectedReason(r);
                      setError('');
                    }}
                    className={`w-full text-left p-3 rounded-xl border text-xs sm:text-sm transition-all min-h-[44px] ${
                      isSelected
                        ? action === 'cancel'
                          ? 'bg-red-50 border-red-400 text-red-900 font-bold shadow-xs'
                          : 'bg-amber-50 border-amber-400 text-amber-900 font-bold shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Campo livre se for 'Outro' */}
          {isCustom && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-700 block">
                Descreva detalhadamente a ocorrência <span className="text-red-500">*</span>:
              </label>
              <textarea
                value={customReason}
                onChange={(e) => {
                  setCustomReason(e.target.value);
                  if (e.target.value.trim()) setError('');
                }}
                placeholder="Informe o que ocorreu durante o trajeto..."
                rows={3}
                className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none placeholder:text-slate-400"
              />
            </div>
          )}

          {/* Mensagem de Erro */}
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer com Safe Area */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white rounded-b-3xl shrink-0 flex gap-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-2xl transition-colors disabled:opacity-50 min-h-[52px]"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedReason || (isCustom && !customReason.trim())}
            className={`flex-[2] py-3 font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed text-white ${
              action === 'cancel'
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-amber-600 hover:bg-amber-700'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Registrando...
              </>
            ) : action === 'cancel' ? (
              <>
                <XCircle className="w-4 h-4" />
                Confirmar Cancelamento
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
