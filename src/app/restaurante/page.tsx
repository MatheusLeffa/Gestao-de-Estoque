'use client';

// InsumoSync: Restaurante (Filial / Cozinha) Screen Skeleton
// Author: frontend-engineer / ui-ux-designer

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Product, Order } from '@/types/database';
import { UtensilsCrossed, ShoppingBag, Clock, Plus, Minus, Search, CheckCircle2 } from 'lucide-react';
import { useDemo } from '@/contexts/DemoContext';
import { chimeService } from '@/lib/audio/chime';

export default function RestaurantePage() {
  const { activeRestaurant, soundEnabled } = useDemo();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCatalogAndOrders = async () => {
    try {
      setLoading(true);
      const [productsRes, ordersRes] = await Promise.all([
        supabase.from('products').select('*').order('name'),
        supabase
          .from('orders')
          .select('*, order_items(*, product:products(*))')
          .eq('restaurant_id', activeRestaurant?.id || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
          .order('created_at', { ascending: false }),
      ]);

      if (productsRes.data) setProducts(productsRes.data as Product[]);
      if (ordersRes.data) setOrders(ordersRes.data as Order[]);
    } catch (e) {
      console.error('Erro ao carregar catálogo:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogAndOrders();

    const channel = supabase
      .channel('realtime_restaurant_orders')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => {
          if (soundEnabled) chimeService.playSuccessPing();
          fetchCatalogAndOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeRestaurant, soundEnabled]);

  const categories = ['Todos', ...Array.from(new Set(products.map((p) => p.category)))];

  const updateCartQty = (productId: string, delta: number, maxStock: number) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      const next = Math.max(0, Math.min(current + delta, maxStock));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
    if (soundEnabled && delta > 0) chimeService.playSuccessPing();
  };

  const totalCartItems = Object.values(cart).reduce((sum, q) => sum + q, 0);

  const filteredProducts = products.filter((p) => {
    const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 p-3 sm:p-6 space-y-5 pb-28">
      {/* Restaurant Header */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <UtensilsCrossed className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900">{activeRestaurant?.name}</h1>
              <p className="text-xs text-slate-500">{activeRestaurant?.address}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
            Conectado ao Depósito Central
          </span>
        </div>
      </div>

      {/* Categories & Search */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar insumos no catálogo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all select-none ${
                activeCategory === cat
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {filteredProducts.map((p) => {
          const inCart = cart[p.id] || 0;
          const isOutOfStock = p.current_stock <= 0;

          return (
            <div
              key={p.id}
              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                inCart > 0
                  ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300/40 shadow-xs'
                  : 'bg-white border-slate-200/80 shadow-subtle'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-sm text-slate-900">{p.name}</span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    {p.category}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>Disponível no Depósito:</span>
                  <span className={`font-bold ${isOutOfStock ? 'text-red-500' : 'text-slate-700'}`}>
                    {p.current_stock} {p.unit}
                  </span>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Qtd. Pedido:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateCartQty(p.id, -1, p.current_stock)}
                    disabled={inCart === 0}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 active:scale-95 transition-all"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-slate-900">{inCart}</span>
                  <button
                    onClick={() => updateCartQty(p.id, 1, p.current_stock)}
                    disabled={isOutOfStock || inCart >= p.current_stock}
                    className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white active:scale-95 transition-all shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Mobile Cart Bar */}
      {totalCartItems > 0 && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-40 bg-slate-900 text-white p-3.5 rounded-2xl shadow-float flex items-center justify-between border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-sm">
              {totalCartItems}
            </div>
            <div>
              <p className="text-xs font-semibold">Itens no Carrinho</p>
              <p className="text-[11px] text-slate-400">Pronto para envio ao depósito</p>
            </div>
          </div>

          <button
            onClick={() => {
              if (soundEnabled) chimeService.playSuccessPing();
              alert('Carrinho em Bottom Sheet será aberto na Fase 3!');
            }}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-colors active:scale-95 shadow-sm"
          >
            Revisar Pedido
          </button>
        </div>
      )}
    </div>
  );
}
