'use client';

// InsumoSync: Administrador (Gestão & Analytics) Screen Skeleton
// Author: analytics-specialist / frontend-engineer

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Order, Product } from '@/types/database';
import { ShieldCheck, TrendingUp, AlertOctagon, CheckCircle2, Clock, Truck } from 'lucide-react';
import { useDemo } from '@/contexts/DemoContext';
import { chimeService } from '@/lib/audio/chime';

export default function AdminPage() {
  const { soundEnabled } = useDemo();
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAdminData = async () => {
    try {
      setLoading(true);
      const [ordersRes, productsRes] = await Promise.all([
        supabase.from('orders').select('*, restaurant:restaurants(*)').order('created_at', { ascending: false }),
        supabase.from('products').select('*'),
      ]);

      if (ordersRes.data) setOrders(ordersRes.data as Order[]);
      if (productsRes.data) setProducts(productsRes.data as Product[]);
    } catch (e) {
      console.error('Erro ao carregar dados do admin:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const totalOrders = orders.length;
  const completedOrders = orders.filter((o) => o.status.startsWith('CONCLUIDO_'));
  const delayedOrders = orders.filter((o) => o.status === 'EM_ATRASO' || o.delay_reason);
  const onTimePercentage = totalOrders > 0 ? Math.round(((totalOrders - delayedOrders.length) / totalOrders) * 100) : 100;
  const criticalProducts = products.filter((p) => p.current_stock <= p.min_stock_alert);

  return (
    <div className="flex-1 p-3 sm:p-6 space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Painel do Administrador Geral</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Indicadores executivos, pontualidade de reposição e auditoria de estoques</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* KPI 1 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <span className="text-xs font-medium text-slate-500">Taxa de Pontualidade</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-emerald-600">{onTimePercentage}%</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Entregas sem atrasos</span>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <span className="text-xs font-medium text-slate-500">Total de Pedidos</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-slate-900">{totalOrders}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Movimentações no ciclo</span>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <span className="text-xs font-medium text-slate-500">Pedidos com Atraso</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-amber-600">{delayedOrders.length}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Motivos apontados</span>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle">
          <span className="text-xs font-medium text-slate-500">Itens Críticos</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-black text-red-600">{criticalProducts.length}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">Abaixo do ponto de pedido</span>
        </div>
      </div>

      {/* Orders Table Overview */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-subtle space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Visão Geral dos Pedidos da Rede</h2>

        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left text-xs">
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
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-400">
                    Nenhum pedido registrado no sistema.
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-900">#{o.id.substring(0, 8)}</td>
                    <td className="p-3 font-medium">{o.restaurant?.name || 'Filial'}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800">
                        {o.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-500">
                      {o.delay_reason || o.completion_type || o.notes || '—'}
                    </td>
                    <td className="p-3 text-slate-400">
                      {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
