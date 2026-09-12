// InsumoSync: DispatchConfirmModal — Confirmação de Despacho do Depósito
// Author: ui-ux-designer / backend-workflow-engine
//
// O despacho é o ponto sem volta da triagem: a máquina de estados não permite
// que um pedido EM_TRANSITO volte para EM_ANALISE, então as quantidades ficam
// congeladas. Esta tela é a última chance do operador conferir o que está indo,
// por isso ela mostra o conteúdo real da carga — e não apenas um "tem certeza?".

'use client';

import React from 'react';
import {
  X,
  Truck,
  Loader2,
  AlertTriangle,
  PackageCheck,
  PackageX,
  MessageSquare,
  Lock,
} from 'lucide-react';
import type { Order, OrderItem } from '@/types/database';

interface DispatchConfirmModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onConfirm: (order: Order) => Promise<void>;
  isSubmitting?: boolean;
}

/** Quantidade efetivamente despachada: o aprovado, com o solicitado como base. */
function shippedQty(item: OrderItem): number {
  return item.approved_qty ?? item.requested_qty;
}

export function DispatchConfirmModal({
  isOpen,
  order,
  onClose,
  onConfirm,
  isSubmitting = false,
}: DispatchConfirmModalProps) {
  if (!isOpen || !order) return null;

  const items = order.order_items ?? [];
  const reducedItems = items.filter((i) => shippedQty(i) < i.requested_qty);
  const removedItems = items.filter((i) => shippedQty(i) === 0);
  const shippedItems = items.filter((i) => shippedQty(i) > 0);
  const totalUnits = items.reduce((acc, i) => acc + shippedQty(i), 0);

  // O mesmo botão atende EM_ANALISE e EM_ATRASO; o título reflete de onde veio.
  const isResolvingDelay = order.status === 'EM_ATRASO';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
      />

      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300">
        {/* Handle Mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
              <Truck className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">
                {isResolvingDelay ? 'Resolver Atraso e Despachar' : 'Confirmar Despacho'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium truncate">
                #{order.id.slice(0, 8).toUpperCase()} · {order.restaurant?.name ?? 'Filial'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 disabled:opacity-50 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Resumo da carga */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800 text-xs">
              <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {shippedItems.length} insumo{shippedItems.length !== 1 ? 's' : ''} seguindo para entrega
                {' · '}
                {totalUnits} unid. no total
              </span>
            </div>
          </div>

          {/* Itens da carga */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Conferência da carga
            </p>

            {items.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">
                Este pedido não possui itens registrados.
              </p>
            ) : (
              items.map((item) => {
                const shipped = shippedQty(item);
                const isReduced = shipped < item.requested_qty;
                const isRemoved = shipped === 0;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border text-xs ${
                      isRemoved
                        ? 'bg-red-50 border-red-200'
                        : isReduced
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {item.product?.name ?? 'Insumo'}
                        </p>
                        <p className="text-slate-500 text-[11px]">
                          {item.product?.category ?? '—'}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        {isRemoved ? (
                          <span className="inline-flex items-center gap-1 font-extrabold text-red-700">
                            <PackageX className="w-3.5 h-3.5" />
                            Não será enviado
                          </span>
                        ) : (
                          <span className="font-extrabold text-slate-900">
                            {shipped} {item.product?.unit ?? ''}
                          </span>
                        )}
                        {isReduced && !isRemoved && (
                          <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
                            solicitado: {item.requested_qty} {item.product?.unit ?? ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {isReduced && item.reduction_reason && (
                      <p className="mt-2 pt-2 border-t border-black/5 text-[11px] leading-relaxed text-slate-600">
                        <span className="font-bold">Justificativa:</span> {item.reduction_reason}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Observações do depósito, se houver */}
          {order.deposit_notes && (
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-blue-800 mb-1">
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>Observações que seguem para o restaurante</span>
              </div>
              <p className="pl-5 leading-relaxed text-blue-800/90">{order.deposit_notes}</p>
            </div>
          )}

          {/* Aviso de reduções */}
          {reducedItems.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {reducedItems.length} item{reducedItems.length !== 1 ? 'ns' : ''} com quantidade reduzida
                  {removedItems.length > 0 && `, sendo ${removedItems.length} zerado(s)`}
                </span>
              </div>
              <p className="pl-5 leading-relaxed text-amber-800/90 mt-1">
                O restaurante verá a comparação entre o solicitado e o enviado, junto das
                justificativas, no momento da conferência de entrega.
              </p>
            </div>
          )}

          {/* Aviso de irreversibilidade */}
          <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>As quantidades ficam congeladas após o despacho</span>
            </div>
            <p className="pl-5 leading-relaxed mt-1">
              Um pedido em trânsito não retorna para análise. A partir daqui só é possível
              apontar atraso, cancelar a entrega ou concluí-la na conferência do restaurante.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 bg-white rounded-b-3xl flex gap-3 shrink-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
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
            onClick={() => onConfirm(order)}
            disabled={isSubmitting}
            className="flex-[2] py-3 font-bold text-sm rounded-2xl text-white bg-emerald-600 hover:bg-emerald-700 transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px] shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Despachando...
              </>
            ) : (
              <>
                <Truck className="w-4 h-4" />
                Confirmar Despacho
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
