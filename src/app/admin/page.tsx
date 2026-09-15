'use client';

// InsumoSync: Administrador (Gestão & Analytics) — Fase 5
// Authors: analytics-specialist / frontend-engineer / ui-ux-designer
//
// Nenhuma métrica é calculada aqui. Toda agregação vem pronta da RPC
// get_admin_analytics(), cuja definição normativa está em
// docs/business-rules.md seção 6.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Package,
  RefreshCw,
  XCircle,
  Loader2,
  Timer,
} from 'lucide-react';
import type { AdminAnalyticsResponse, Order, StockForecastingResponse } from '@/types/database';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SortControl } from '@/components/ui/SortControl';
import { sortItems, dateValue, type SortDirection } from '@/lib/utils/sorting';
import { fetchAllOrders } from '@/lib/services/order-service';
import {
  fetchAdminAnalytics,
  formatOnTimeRate,
  onTimeRateTone,
} from '@/lib/services/analytics-service';
import {
  OutcomesChart,
  DelayReasonsChart,
  ConsumptionChart,
  OrdersTimelineChart,
} from '@/components/admin/AnalyticsCharts';
import { StockForecastCard } from '@/components/admin/StockForecastCard';
import { fetchStockForecasting } from '@/lib/services/inventory-service';

type AdminOrderSortKey = 'created_at' | 'updated_at' | 'status' | 'restaurant';

const ADMIN_ORDER_SORT_OPTIONS: { value: AdminOrderSortKey; label: string }[] = [
  { value: 'created_at', label: 'Data de criação' },
  { value: 'updated_at', label: 'Última atualização' },
  { value: 'status', label: 'Status' },
  { value: 'restaurant', label: 'Restaurante' },
];

export default function AdminPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse | null>(null);
  const [forecast, setForecast] = useState<StockForecastingResponse | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ordenação da tabela de pedidos
  const [orderSort, setOrderSort] = useState<AdminOrderSortKey>('created_at');
  const [orderSortDir, setOrderSortDir] = useState<SortDirection>('desc');

  const loadData = useCallback(async (isSilent = false) => {
    if (isSilent) setRefreshing(true);
    else setLoading(true);

    try {
      const [analyticsRes, ordersRes, forecastRes] = await Promise.all([
        fetchAdminAnalytics(),
        fetchAllOrders(60),
        fetchStockForecasting(14),
      ]);

      if (!analyticsRes.success) {
        setError(analyticsRes.error ?? 'Não foi possível carregar os indicadores.');
      } else {
        setError(null);
        setAnalytics(analyticsRes);
      }
      setOrders(ordersRes);
      if (forecastRes.success) {
        setForecast(forecastRes);
      }
    } catch (e) {
      setError('Falha inesperada ao carregar o painel.');
      console.error('Erro ao carregar dados do admin:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sortedOrders = sortItems(
    orders,
    (o) => {
      switch (orderSort) {
        case 'created_at':
          return dateValue(o.created_at);
        case 'updated_at':
          return dateValue(o.updated_at);
        case 'status':
          return o.status;
        case 'restaurant':
          return o.restaurant?.name ?? null;
      }
    },
    orderSortDir
  );

  const kpis = analytics?.kpis;
  const onTimeLabel = formatOnTimeRate(kpis?.on_time_rate);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin" />
        <p className="text-xs font-medium">Consolidando indicadores da rede...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-3 sm:p-6 space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Painel do Administrador</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Indicadores executivos, pontualidade de reposição e auditoria de estoques
          </p>
        </div>

        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="shrink-0 w-11 h-11 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors disabled:opacity-50"
          title="Atualizar indicadores"
          aria-label="Atualizar indicadores"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Pontualidade — o único KPI que pode ser indefinido */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <div className="flex items-center gap-1.5 text-slate-500">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Taxa de Pontualidade</span>
          </div>
          <div className="mt-1">
            {onTimeLabel ? (
              <span className={`text-2xl font-black ${onTimeRateTone(kpis?.on_time_rate)}`}>
                {onTimeLabel}
              </span>
            ) : (
              <span className="text-lg font-bold text-slate-400">Sem dados</span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {kpis?.delivered_base
              ? `${kpis.on_time_count} de ${kpis.delivered_base} entrega(s) no prazo`
              : 'Nenhuma entrega concluída ainda'}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Package className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Total de Pedidos</span>
          </div>
          <span className="text-2xl font-black text-slate-900 mt-1 block">
            {kpis?.total_orders ?? 0}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block">
            {kpis?.in_progress_count ?? 0} em andamento · {kpis?.cancelled_count ?? 0} cancelado(s)
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Timer className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Entregas com Atraso</span>
          </div>
          <span className="text-2xl font-black text-amber-600 mt-1 block">
            {kpis?.delayed_count ?? 0}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block">
            Passaram por impedimento no ciclo
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <div className="flex items-center gap-1.5 text-slate-500">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Itens Críticos</span>
          </div>
          <span className="text-2xl font-black text-red-600 mt-1 block">
            {kpis?.critical_items ?? 0}
          </span>
          <span className="text-[10px] text-slate-400 mt-1 block">
            de {kpis?.active_products ?? 0} insumo(s) ativo(s)
          </span>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <OrdersTimelineChart data={analytics?.orders_timeline ?? []} />
        <OutcomesChart data={analytics?.outcomes ?? []} />
        <DelayReasonsChart data={analytics?.delay_reasons ?? []} />
        <ConsumptionChart data={analytics?.consumption ?? []} />
      </div>

      {/* Previsibilidade de Estoque & Reposição */}
      <StockForecastCard
        items={forecast?.items ?? []}
        summary={forecast?.summary}
        windowDays={forecast?.window_days ?? 14}
        isLoading={loading || refreshing}
      />

      {/* Visão geral dos pedidos */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-subtle space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Visão Geral dos Pedidos da Rede</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {orders.length} pedido(s) mais recente(s)
            </p>
          </div>

          <SortControl
            options={ADMIN_ORDER_SORT_OPTIONS}
            value={orderSort}
            direction={orderSortDir}
            onChange={setOrderSort}
            onDirectionChange={setOrderSortDir}
            label="Ordenar pedidos por"
            className="w-full sm:w-auto sm:min-w-[280px]"
          />
        </div>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs min-w-[560px]">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3">Pedido</th>
                <th className="p-3">Restaurante</th>
                <th className="p-3">Status</th>
                <th className="p-3">Motivo / Desfecho</th>
                <th className="p-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {sortedOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    Nenhum pedido registrado no sistema.
                  </td>
                </tr>
              ) : (
                sortedOrders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">
                      #{o.id.substring(0, 8).toUpperCase()}
                    </td>
                    <td className="p-3 font-medium">{o.restaurant?.name ?? 'Filial'}</td>
                    <td className="p-3">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="p-3 text-slate-500">
                      {o.delay_reason || o.completion_type || o.notes || '—'}
                    </td>
                    <td className="p-3 text-slate-400 whitespace-nowrap">
                      {new Date(o.created_at).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
