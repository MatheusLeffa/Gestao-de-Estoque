'use client';

// InsumoSync: Estoque Central (Depósito) Screen Skeleton
// Author: frontend-engineer / ui-ux-designer

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Product, Order } from '@/types/database';
import { Package, AlertTriangle, Truck, Clock, RefreshCw, Plus, Search } from 'lucide-react';
import { useDemo } from '@/contexts/DemoContext';
import { chimeService } from '@/lib/audio/chime';

export default function EstoquePage() {
  const { soundEnabled } = useDemo();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [productsRes, ordersRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase.from('orders').select('*, restaurant:restaurants(*)').order('created_at', { ascending: false }),
      ]);

      if (productsRes.data) setProducts(productsRes.data as Product[]);
      if (ordersRes.data) setOrders(ordersRes.data as Order[]);
    } catch (e) {
      console.error('Erro ao carregar dados do estoque:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Subscribe to Realtime orders
    const channel = supabase
      .channel('realtime_estoque_orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          if (soundEnabled) {
            chimeService.playOrderChime();
          }
          fetchDashboardData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          fetchDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [soundEnabled]);

  const criticalItems = products.filter((p) => p.current_stock <= p.min_stock_alert);
  const ordersToAnalyze = orders.filter((o) => o.status === 'ABERTO');
  const ordersInTransit = orders.filter((o) => o.status === 'EM_TRANSITO');

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase());
    const matchesLowStock = onlyLowStock ? p.current_stock <= p.min_stock_alert : true;
    return matchesSearch && matchesLowStock;
  });

  return (
    <div className="flex-1 p-3 sm:p-6 space-y-5 pb-24">
      {/* Header with Title & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
              <Package className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Estoque Central</h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Gestão de insumos, triagem e controle de reposição em tempo real</p>
        </div>

        <button
          onClick={() => {
            if (soundEnabled) chimeService.playSuccessPing();
            fetchDashboardData();
          }}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs active:scale-95 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Mini-Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Pedidos para Analisar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Para Analisar</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-slate-900">{ordersToAnalyze.length}</span>
              {ordersToAnalyze.length > 0 && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 animate-pulse">
                  Ação Necessária
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Em Trânsito */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Em Trânsito</span>
            <div className="mt-1">
              <span className="text-2xl font-black text-blue-600">{ordersInTransit.length}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Itens Críticos */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Estoque Crítico</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-black text-red-600">{criticalItems.length}</span>
              {criticalItems.length > 0 && (
                <span className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                  Repor Saldo
                </span>
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Catalog & Search Section */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar insumo ou categoria..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <button
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
              onlyLowStock
                ? 'bg-red-500 text-white border-red-500 shadow-sm'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Apenas Estoque Baixo ({criticalItems.length})</span>
          </button>
        </div>

        {/* Product List */}
        <div className="overflow-hidden border border-slate-100 rounded-xl">
          <div className="divide-y divide-slate-100">
            {filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                Nenhum insumo encontrado.
              </div>
            ) : (
              filteredProducts.map((p) => {
                const isCritical = p.current_stock <= p.min_stock_alert;
                return (
                  <div key={p.id} className="p-3 sm:p-4 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900">{p.name}</span>
                        {isCritical && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                            Crítico
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{p.category}</span>
                        <span>Mínimo: {p.min_stock_alert} {p.unit}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-base font-bold ${isCritical ? 'text-red-600' : 'text-slate-900'}`}>
                        {p.current_stock} <span className="text-xs font-normal text-slate-500">{p.unit}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
