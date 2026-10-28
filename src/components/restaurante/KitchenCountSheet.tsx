// InsumoSync: KitchenCountSheet — Gaveta de contagem física da cozinha (inicial ou diária)
// O consumo exibido é só uma prévia; quem calcula e grava é a RPC submit_kitchen_count.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, ClipboardCheck, Search, Loader2, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import type { KitchenStockItem, KitchenCountItemPayload } from '@/types/database';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';

interface KitchenCountSheetProps {
  isOpen: boolean;
  isInitial: boolean;
  items: KitchenStockItem[];
  onClose: () => void;
  /** Devolve a mensagem de erro do servidor, ou `null` em caso de sucesso. */
  onSubmit: (items: KitchenCountItemPayload[]) => Promise<string | null>;
}

function parseQty(raw: string): number | null {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  return Number(trimmed);
}

function fmt(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function KitchenCountSheet({ isOpen, isInitial, items, onClose, onSubmit }: KitchenCountSheetProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setValues({});
      setSearch('');
      setError('');
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const filled = useMemo(
    () =>
      items
        .map((it) => ({ item: it, counted: parseQty(values[it.product_id] ?? '') }))
        .filter((r): r is { item: KitchenStockItem; counted: number } => r.counted !== null),
    [items, values]
  );

  const invalid = filled.find((r) => !Number.isFinite(r.counted) || r.counted < 0);

  const preview = useMemo(() => {
    let consumed = 0;
    let adjusted = 0;
    for (const { item, counted } of filled) {
      if (!Number.isFinite(counted) || counted < 0) continue;
      const diff = item.quantity - counted;
      if (diff > 0) consumed += 1;
      else if (diff < 0) adjusted += 1;
    }
    return { consumed, adjusted };
  }, [filled]);

  if (!isOpen) return null;

  const term = search.trim().toLowerCase();
  const visible = term ? items.filter((it) => it.name.toLowerCase().includes(term)) : items;

  const handleSubmit = async () => {
    if (invalid) {
      setError(`Quantidade inválida em "${invalid.item.name}". Use um número maior ou igual a zero.`);
      return;
    }
    if (!isInitial && filled.length === 0) {
      setError('Informe o saldo físico de pelo menos um insumo.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    const serverError = await onSubmit(filled.map(({ item, counted }) => ({ product_id: item.product_id, counted_qty: counted })));
    setIsSubmitting(false);
    if (serverError) setError(serverError);
  };

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Contagem da cozinha">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white rounded-t-3xl shadow-2xl w-full sm:max-w-lg sm:mx-auto max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-emerald-600" />
              {isInitial ? 'Contagem Inicial da Cozinha' : 'Contagem do Dia'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {isInitial
                ? 'Informe quanto há de cada insumo agora. O que ficar em branco começa com saldo 0.'
                : 'Informe o saldo físico encontrado. Insumos em branco mantêm o saldo atual.'}
            </p>
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

        {/* Busca */}
        <div className="px-5 pt-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar insumo..."
              className="w-full h-11 pl-9 pr-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {visible.map((it) => {
            const raw = values[it.product_id] ?? '';
            const counted = parseQty(raw);
            const isBad = counted !== null && (!Number.isFinite(counted) || counted < 0);
            const diff = counted !== null && !isBad ? fmt(it.quantity - counted) : null;

            return (
              <div key={it.product_id} className="flex items-center gap-3 p-2.5 rounded-2xl border border-slate-200/80 bg-white">
                <ProductThumbnail imageUrl={it.image_url} name={it.name} category={it.category} size="sm" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 truncate">{it.name}</p>
                  {isInitial ? (
                    <p className="text-[11px] text-slate-500">{it.category}</p>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Esperado: <strong className="text-slate-700">{fmt(it.quantity)} {it.unit}</strong>
                    </p>
                  )}
                  {!isInitial && diff !== null && diff !== 0 && (
                    <p
                      className={`text-[11px] font-semibold flex items-center gap-1 ${
                        diff > 0 ? 'text-slate-700' : 'text-amber-700'
                      }`}
                    >
                      {diff > 0 ? (
                        <>
                          <TrendingDown className="w-3 h-3" /> Consumo: {diff} {it.unit}
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-3 h-3" /> Ajuste: +{fmt(-diff)} {it.unit} (acima do esperado)
                        </>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    placeholder={isInitial ? '0' : '—'}
                    aria-label={`Saldo contado de ${it.name}`}
                    value={raw}
                    onChange={(e) => {
                      setValues((prev) => ({ ...prev, [it.product_id]: e.target.value }));
                      setError('');
                    }}
                    className={`w-20 h-11 px-2 text-sm text-right font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ${
                      isBad ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-slate-50'
                    }`}
                  />
                  <span className="w-8 text-[11px] font-semibold text-slate-500">{it.unit}</span>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <p className="text-center text-sm text-slate-400 py-8">Nenhum insumo encontrado.</p>}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-slate-100 space-y-2.5">
          {error ? (
            <p className="text-xs text-red-600 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              {filled.length} de {items.length} insumos informados
              {!isInitial && filled.length > 0 && (
                <>
                  {' '}· {preview.consumed} com consumo
                  {preview.adjusted > 0 && <span className="text-amber-700"> · {preview.adjusted} acima do esperado</span>}
                </>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm rounded-2xl transition-colors active:scale-[0.98] flex items-center justify-center gap-2 min-h-[52px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Registrando...
              </>
            ) : isInitial ? (
              'Concluir Contagem Inicial'
            ) : (
              'Registrar Contagem'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
