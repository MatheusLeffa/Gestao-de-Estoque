// InsumoSync: KitchenPanel — Aba "Minha Cozinha" do restaurante (business-rules seção 5.A)
// Onboarding da contagem inicial, status da contagem do dia, saldos com cobertura e ações.

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ChefHat,
  ClipboardCheck,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ListChecks,
  AlertCircle,
} from 'lucide-react';
import { fetchKitchenStock, submitKitchenCount, registerKitchenLoss } from '@/lib/services/kitchen-service';
import { KitchenCountSheet } from '@/components/restaurante/KitchenCountSheet';
import { KitchenLossSheet } from '@/components/restaurante/KitchenLossSheet';
import { ProductThumbnail } from '@/components/ui/ProductThumbnail';
import type { KitchenStockItem, KitchenStockResponse, KitchenCountItemPayload } from '@/types/database';

interface KitchenPanelProps {
  restaurantId: string;
  /** Muda quando algo externo altera o saldo (ex.: conferência de entrega). */
  refreshKey: number;
  onFeedback: (type: 'success' | 'error', message: string) => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });
}

/** Dias de cobertura com o saldo atual; `null` sem consumo apurado. */
function coverageDays(item: KitchenStockItem): number | null {
  if (item.avg_daily_consumption <= 0) return null;
  return item.quantity / item.avg_daily_consumption;
}

export function KitchenPanel({ restaurantId, refreshKey, onFeedback }: KitchenPanelProps) {
  const [state, setState] = useState<KitchenStockResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isCountOpen, setIsCountOpen] = useState(false);
  const [isLossOpen, setIsLossOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setState(await fetchKitchenStock(restaurantId));
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const items = state?.items ?? [];
  const initialized = state?.initialized ?? false;

  const handleCount = async (payload: KitchenCountItemPayload[]): Promise<string | null> => {
    const res = await submitKitchenCount({ restaurantId, items: payload, isInitial: !initialized });
    if (!res.success) return res.error ?? 'Não foi possível registrar a contagem.';

    setIsCountOpen(false);
    if (!initialized) {
      onFeedback('success', '✅ Contagem inicial concluída. A cozinha passa a receber as entregas.');
    } else {
      const parts = [`${res.items_counted ?? payload.length} insumo(s) contado(s)`];
      if ((res.adjusted_items ?? 0) > 0) parts.push(`${res.adjusted_items} acima do esperado (sinalizado ao admin)`);
      onFeedback('success', `✅ Contagem registrada: ${parts.join(' · ')}.`);
    }
    load();
    return null;
  };

  const handleLoss = async (productId: string, quantity: number, reason: string): Promise<string | null> => {
    const res = await registerKitchenLoss({ restaurantId, productId, quantity, reason });
    if (!res.success) return res.error ?? 'Não foi possível registrar a perda.';

    setIsLossOpen(false);
    const name = items.find((it) => it.product_id === productId)?.name ?? 'insumo';
    onFeedback('success', `🗑️ Perda registrada: ${quantity} de ${name}.`);
    load();
    return null;
  };

  if (loading && !state) {
    return (
      <div className="space-y-3">
        <div className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (state && !state.success) {
    return (
      <div className="text-center py-12 space-y-3">
        <AlertCircle className="w-10 h-10 mx-auto text-red-400" />
        <p className="text-sm text-slate-600">{state.error ?? 'Não foi possível carregar o estoque da cozinha.'}</p>
        <button
          onClick={load}
          className="px-4 min-h-[44px] text-xs font-semibold text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const countSheet = (
    <KitchenCountSheet
      isOpen={isCountOpen}
      isInitial={!initialized}
      items={items}
      onClose={() => setIsCountOpen(false)}
      onSubmit={handleCount}
    />
  );

  // ── Onboarding: contagem inicial obrigatória ──
  if (!initialized) {
    const steps = [
      'Separe um momento com a cozinha parada (antes ou depois do turno).',
      'Conte o que há fisicamente de cada insumo. O que não existir pode ficar em branco.',
      'Conclua a contagem: a partir dela, entregas, perdas e consumo passam a ser apurados.',
    ];
    return (
      <>
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-subtle p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
              <ChefHat className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">Ative o estoque da sua cozinha</h2>
              <p className="text-xs text-slate-500">Falta só a contagem inicial.</p>
            </div>
          </div>
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Enquanto a contagem inicial não for feita, entregas recebidas não entram no saldo da cozinha e não é
            possível registrar perdas.
          </p>
          <button
            onClick={() => setIsCountOpen(true)}
            className="w-full min-h-[52px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <ListChecks className="w-5 h-5" /> Fazer Contagem Inicial ({items.length} insumos)
          </button>
        </div>
        {countSheet}
      </>
    );
  }

  // ── Cozinha inicializada ──
  const term = search.trim().toLowerCase();
  const visible = term ? items.filter((it) => it.name.toLowerCase().includes(term)) : items;
  const withStock = items.filter((it) => it.quantity > 0).length;
  const lowCoverage = items.filter((it) => {
    const d = coverageDays(it);
    return d !== null && d < 1;
  }).length;

  return (
    <>
      {/* Status da contagem do dia */}
      <div
        className={`rounded-2xl border p-4 flex items-center gap-3 ${
          state?.counted_today ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
        }`}
      >
        {state?.counted_today ? (
          <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
        ) : (
          <Clock className="w-6 h-6 text-amber-600 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${state?.counted_today ? 'text-emerald-900' : 'text-amber-900'}`}>
            {state?.counted_today ? 'Contagem de hoje realizada' : 'Pendente de contagem hoje'}
          </p>
          <p className={`text-xs ${state?.counted_today ? 'text-emerald-800/80' : 'text-amber-800/80'}`}>
            {state?.last_count_at
              ? state.counted_today
                ? `Última às ${formatTime(state.last_count_at)}. Pode contar de novo se precisar.`
                : `Última contagem em ${formatDateTime(state.last_count_at)}.`
              : 'Nenhuma contagem registrada.'}
          </p>
        </div>
        <button
          onClick={load}
          className="w-11 h-11 rounded-xl hover:bg-white/60 flex items-center justify-center text-slate-500 shrink-0"
          aria-label="Atualizar estoque da cozinha"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Ações */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setIsCountOpen(true)}
          className="min-h-[52px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <ClipboardCheck className="w-4 h-4" /> Fazer Contagem
        </button>
        <button
          onClick={() => setIsLossOpen(true)}
          className="min-h-[52px] bg-white border border-red-200 text-red-700 hover:bg-red-50 font-bold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <Trash2 className="w-4 h-4" /> Registrar Perda
        </button>
      </div>

      {/* Resumo */}
      <div className="flex gap-2 text-xs">
        <span className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600">
          <strong className="text-slate-900">{withStock}</strong> com saldo
        </span>
        <span className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-600">
          <strong className="text-slate-900">{items.length - withStock}</strong> zerados
        </span>
        {lowCoverage > 0 && (
          <span className="px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
            <strong>{lowCoverage}</strong> acabam hoje
          </span>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar insumo na cozinha..."
          className="w-full h-11 pl-9 pr-3 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs"
        />
      </div>

      {/* Saldos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
        {visible.map((it) => {
          const days = coverageDays(it);
          const coverageClass =
            it.quantity <= 0
              ? 'bg-slate-100 text-slate-500'
              : days === null
              ? 'bg-slate-50 text-slate-500'
              : days < 1
              ? 'bg-rose-100 text-rose-700'
              : days < 3
              ? 'bg-amber-100 text-amber-800'
              : 'bg-emerald-50 text-emerald-700';
          const coverageLabel =
            it.quantity <= 0
              ? 'Sem saldo'
              : days === null
              ? 'Sem consumo apurado'
              : days < 1
              ? 'Acaba hoje'
              : `~${days < 10 ? days.toFixed(1).replace('.', ',') : Math.round(days)} dias`;

          return (
            <div
              key={it.product_id}
              className={`p-3 rounded-2xl border bg-white flex items-center gap-3 ${
                it.quantity <= 0 ? 'border-slate-200 opacity-70' : 'border-slate-200/80 shadow-subtle'
              }`}
            >
              <ProductThumbnail imageUrl={it.image_url} name={it.name} category={it.category} size="md" className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{it.name}</p>
                <p className="text-lg font-extrabold text-slate-900 tabular-nums leading-tight">
                  {Math.round(it.quantity * 1000) / 1000} <span className="text-xs font-semibold text-slate-500">{it.unit}</span>
                </p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${coverageClass}`}>{coverageLabel}</span>
                  {it.avg_daily_consumption > 0 && (
                    <span className="text-[10px] text-slate-500">
                      {String(it.avg_daily_consumption).replace('.', ',')} {it.unit}/dia
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8 col-span-full">Nenhum insumo encontrado.</p>
        )}
      </div>

      {countSheet}
      <KitchenLossSheet isOpen={isLossOpen} items={items} onClose={() => setIsLossOpen(false)} onSubmit={handleLoss} />
    </>
  );
}
