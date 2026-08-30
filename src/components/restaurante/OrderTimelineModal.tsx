// InsumoSync: OrderTimelineModal — Timeline visual de acompanhamento do pedido
// Author: ui-ux-designer / frontend-engineer

'use client';

import React from 'react';
import { X, Clock, Package, AlertCircle } from 'lucide-react';
import type { Order, OrderStatusLog } from '@/types/database';
import { StatusBadge } from '@/components/ui/StatusBadge';

function formatDateTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

interface OrderTimelineModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
}

export function OrderTimelineModal({ isOpen, order, onClose }: OrderTimelineModalProps) {
  if (!isOpen || !order) return null;

  const logs: OrderStatusLog[] = order.order_status_logs ?? [];
  const sorted = [...logs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Acompanhamento do pedido"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet / Modal */}
      <div className="relative bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-300">
        {/* Handle (mobile only) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Acompanhamento</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pedido criado em {formatDateTime(order.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} size="md" />
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Order notes */}
          {order.notes && (
            <div className="mb-4 p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-2">
              <Package className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600">{order.notes}</p>
            </div>
          )}

          {/* Delay reason */}
          {order.delay_reason && (
            <div className="mb-4 p-3 rounded-2xl bg-orange-50 border border-orange-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-orange-700">Motivo do Atraso</p>
                <p className="text-xs text-orange-600 mt-0.5">{order.delay_reason}</p>
              </div>
            </div>
          )}

          {/* Steps */}
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              Nenhum registro de histórico disponível.
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[19px] top-6 bottom-6 w-0.5 bg-slate-100" />

              <div className="space-y-4">
                {sorted.map((log, i) => {
                  const isLast = i === sorted.length - 1;
                  return (
                    <div key={log.id} className="flex gap-3 items-start">
                      {/* Dot */}
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 z-10 shadow-xs ${
                          isLast
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white border-2 border-slate-200 text-slate-400'
                        }`}
                      >
                        <Clock className="w-4 h-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <StatusBadge status={log.to_status} />
                          <span className="text-[11px] text-slate-400">{formatRelative(log.created_at)}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{formatDateTime(log.created_at)}</p>
                        {log.reason && (
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{log.reason}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Order items summary */}
          {order.order_items && order.order_items.length > 0 && (
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Itens do Pedido
              </h3>
              <div className="space-y-1">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center text-sm py-1.5 border-b border-slate-50 last:border-0">
                    <span className="text-slate-700 truncate">{item.product?.name ?? item.product_id}</span>
                    <span className="text-xs font-semibold text-slate-900 shrink-0 ml-2">
                      {item.requested_qty} {item.product?.unit ?? ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
