'use client';

// InsumoSync: Restaurante — Módulo Completo Mobile-First (Fase 3)
// Author: frontend-engineer / ui-ux-designer / backend-workflow-engine

import React, { useCallback, useEffect, useState } from 'react';
import {
  UtensilsCrossed,
  ShoppingBag,
  ClipboardList,
  Plus,
  Minus,
  Search,
  RefreshCw,
  MapPin,
  Wifi,
} from 'lucide-react';
import { useDemo } from '@/contexts/DemoContext';
import { chimeService } from '@/lib/audio/chime';
import { supabase } from '@/lib/supabase/client';

import { fetchProducts, filterProducts, extractCategories } from '@/lib/services/inventory-service';
import { fetchOrders, placeOrder, transitionOrderStatus, cancelOrder } from '@/lib/services/order-service';

import { CartBottomSheet, type CartItem } from '@/components/restaurante/CartBottomSheet';
import { OrderTimelineModal } from '@/components/restaurante/OrderTimelineModal';
import { CheckInDeliveryModal } from '@/components/restaurante/CheckInDeliveryModal';
import { StatusBadge } from '@/components/ui/StatusBadge';

import type { Product, Order, CompletionType } from '@/types/database';
import { SortControl } from '@/components/ui/SortControl';
import { sortItems, dateValue, type SortDirection } from '@/lib/utils/sorting';

// ─── Constantes ──────────────────────────────────────────────────────────────

const DEMO_RESTAURANT_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

type Tab = 'catalogo' | 'pedidos';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── Componente Principal ─────────────────────────────────────────────────────

type RestProductSortKey = 'name' | 'stock' | 'category';
type RestOrderSortKey = 'created_at' | 'updated_at' | 'status';

const REST_PRODUCT_SORT_OPTIONS: { value: RestProductSortKey; label: string }[] = [
  { value: 'name', label: 'Nome' },
  { value: 'stock', label: 'Saldo disponível' },
  { value: 'category', label: 'Categoria' },
];

const REST_ORDER_SORT_OPTIONS: { value: RestOrderSortKey; label: string }[] = [
  { value: 'created_at', label: 'Data do pedido' },
  { value: 'updated_at', label: 'Última atualização' },
  { value: 'status', label: 'Status' },
];

export default function RestaurantePage() {
  const { activeRestaurant, soundEnabled } = useDemo();
  const restaurantId = activeRestaurant?.id ?? DEMO_RESTAURANT_ID;

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<Tab>('catalogo');

  // ── Catalog state ──
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todos');

  // Ordenação das listas
  const [productSort, setProductSort] = useState<RestProductSortKey>('name');
  const [productSortDir, setProductSortDir] = useState<SortDirection>('asc');
  const [orderSort, setOrderSort] = useState<RestOrderSortKey>('created_at');
  const [orderSortDir, setOrderSortDir] = useState<SortDirection>('desc');

  // ── Cart state ──
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderFeedback, setOrderFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Orders state ──
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // ── Modal state ──
  const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
  const [checkInOrder, setCheckInOrder] = useState<Order | null>(null);
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState(false);

  // ─── Loaders ────────────────────────────────────────────────────────────────

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    const data = await fetchProducts();
    setProducts(data);
    setLoadingProducts(false);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    const data = await fetchOrders({ restaurantId });
    setOrders(data);
    setLoadingOrders(false);
  }, [restaurantId]);

  useEffect(() => {
    loadProducts();
    loadOrders();
  }, [loadProducts, loadOrders]);

  // ─── Realtime ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const channel = supabase
      .channel(`restaurante_realtime_${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          loadOrders();
          if (soundEnabled) chimeService.playSuccessPing();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products' },
        () => {
          loadProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, soundEnabled, loadOrders, loadProducts]);

  // ─── Cart Handlers ────────────────────────────────────────────────────────

  const updateCartQty = (productId: string, delta: number) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setCart((prev) => {
      const current = prev[productId] ?? 0;
      const next = Math.max(0, Math.min(current + delta, product.current_stock));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });

    if (soundEnabled && delta > 0) chimeService.playSuccessPing();
  };

  const clearCart = () => setCart({});

  const cartItems: CartItem[] = Object.entries(cart)
    .map(([productId, qty]) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return null;
      return { product, qty };
    })
    .filter(Boolean) as CartItem[];

  const totalCartItems = Object.values(cart).reduce((sum, q) => sum + q, 0);

  // ─── Order Submission ─────────────────────────────────────────────────────

  const handleSubmitOrder = async (notes: string) => {
    setIsSubmittingOrder(true);
    setOrderFeedback(null);

    const result = await placeOrder({
      restaurantId,
      items: cartItems.map(({ product, qty }) => ({
        product_id: product.id,
        requested_qty: qty,
      })),
      notes,
    });

    setIsSubmittingOrder(false);

    if (result.success) {
      if (soundEnabled) chimeService.playOrderChime();
      clearCart();
      setIsCartOpen(false);
      setOrderFeedback({ type: 'success', message: '✅ Pedido enviado ao depósito com sucesso!' });
      setActiveTab('pedidos');
      loadOrders();
      loadProducts();
      setTimeout(() => setOrderFeedback(null), 5000);
    } else {
      setOrderFeedback({
        type: 'error',
        message: result.conflictItem
          ? `⚠️ Saldo insuficiente: "${result.conflictItem.productName}". Disponível: ${result.conflictItem.available}, solicitado: ${result.conflictItem.requested}.`
          : `❌ ${result.error}`,
      });
    }
  };

  // ─── Delivery Check-in ────────────────────────────────────────────────────

  const handleConfirmDelivery = async (completionType: CompletionType, reason?: string) => {
    if (!checkInOrder) return;
    setIsConfirmingDelivery(true);

    const toStatus =
      completionType === 'TOTAL'
        ? 'CONCLUIDO_TOTAL'
        : completionType === 'PARCIAL'
        ? 'CONCLUIDO_PARCIAL'
        : 'CONCLUIDO_NAO_ENTREGUE';

    const result = await transitionOrderStatus({
      orderId: checkInOrder.id,
      fromStatus: checkInOrder.status,
      toStatus,
      reason,
      completionType,
    });

    setIsConfirmingDelivery(false);
    if (result.success) {
      if (soundEnabled) chimeService.playSuccessPing();
      setCheckInOrder(null);
      loadOrders();
    }
  };

  // ─── Cancel Order ─────────────────────────────────────────────────────────

  const handleCancelOrder = async (order: Order) => {
    if (!confirm('Confirma o cancelamento deste pedido?')) return;
    const result = await cancelOrder(order.id, order.status);
    if (result.success) {
      if (soundEnabled) chimeService.playSuccessPing();
      loadOrders();
    } else {
      alert(result.error ?? 'Não foi possível cancelar.');
    }
  };

  // ─── Derived state ────────────────────────────────────────────────────────

  const categories = extractCategories(products);
  const filteredProducts = filterProducts(products, search, activeCategory);

  const sortedProducts = sortItems(
    filteredProducts,
    (p) => {
      switch (productSort) {
        case 'name':
          return p.name;
        case 'stock':
          return p.current_stock;
        case 'category':
          return p.category;
      }
    },
    productSortDir
  );

  // O mesmo critério vale para os pedidos ativos e para o histórico: são duas
  // seções da mesma lista, e ordená-las de formas diferentes confundiria a leitura.
  const orderAccessor = (o: Order) => {
    switch (orderSort) {
      case 'created_at':
        return dateValue(o.created_at);
      case 'updated_at':
        return dateValue(o.updated_at);
      case 'status':
        return o.status;
    }
  };

  const activeOrders = sortItems(
    orders.filter((o) =>
      ['ABERTO', 'EM_ANALISE', 'EM_ATRASO', 'CANCELAMENTO_PENDENTE', 'EM_TRANSITO'].includes(o.status)
    ),
    orderAccessor,
    orderSortDir
  );
  const pastOrders = sortItems(
    orders.filter((o) =>
      ['CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO'].includes(o.status)
    ),
    orderAccessor,
    orderSortDir
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex-1 flex flex-col min-h-0 pb-24">
        {/* Header */}
        <div className="px-3 sm:px-6 pt-3 sm:pt-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <UtensilsCrossed className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  {activeRestaurant?.name ?? 'Restaurante'}
                </h1>
                {activeRestaurant?.address && (
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" /> {activeRestaurant.address}
                  </p>
                )}
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 self-start sm:self-auto">
              <Wifi className="w-3 h-3" /> Conectado ao Depósito
            </span>
          </div>

          {/* Feedback banner */}
          {orderFeedback && (
            <div
              className={`mb-3 px-4 py-3 rounded-2xl text-sm font-medium ${
                orderFeedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {orderFeedback.message}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl mb-4">
            <button
              onClick={() => setActiveTab('catalogo')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xl transition-all min-h-[44px] ${
                activeTab === 'catalogo'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              Catálogo de Insumos
            </button>
            <button
              onClick={() => setActiveTab('pedidos')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold rounded-xl transition-all min-h-[44px] ${
                activeTab === 'pedidos'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Meus Pedidos
              {activeOrders.length > 0 && (
                <span className="bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {activeOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── CATÁLOGO TAB ── */}
        {activeTab === 'catalogo' && (
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 space-y-4">
            {/* Search & Category Filters */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar insumos no catálogo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all select-none min-h-[36px] ${
                      activeCategory === cat
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Ordenação do catálogo */}
              <SortControl
                options={REST_PRODUCT_SORT_OPTIONS}
                value={productSort}
                direction={productSortDir}
                onChange={setProductSort}
                onDirectionChange={setProductSortDir}
                label="Ordenar insumos por"
                className="max-w-sm"
              />
            </div>

            {/* Product Cards */}
            {loadingProducts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : sortedProducts.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhum insumo encontrado.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {sortedProducts.map((p) => {
                  const inCart = cart[p.id] ?? 0;
                  const isOutOfStock = p.current_stock <= 0;
                  const isLowStock = p.current_stock > 0 && p.current_stock <= p.min_stock_alert;
                  const isAtMax = inCart >= p.current_stock;

                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                        inCart > 0
                          ? 'bg-emerald-50/40 border-emerald-300 ring-1 ring-emerald-300/40 shadow-xs'
                          : isOutOfStock
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200/80 shadow-subtle hover:shadow-card'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="font-semibold text-sm text-slate-900 leading-snug">{p.name}</span>
                          {isOutOfStock ? (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-600">
                              Esgotado
                            </span>
                          ) : isLowStock ? (
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700">
                              ⚠️ Baixo
                            </span>
                          ) : null}
                        </div>
                        <span className="text-[11px] font-medium text-slate-500">{p.category}</span>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Disponível:</span>
                          <span className={`font-bold ${isOutOfStock ? 'text-red-500' : isLowStock ? 'text-amber-600' : 'text-slate-700'}`}>
                            {p.current_stock} {p.unit}
                          </span>
                        </div>
                      </div>

                      {/* Qty Selector */}
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500">Qtd. Pedido:</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateCartQty(p.id, -1)}
                            disabled={inCart === 0}
                            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-slate-700 active:scale-95 transition-all"
                            aria-label="Diminuir"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-slate-900 tabular-nums">{inCart}</span>
                          <button
                            onClick={() => updateCartQty(p.id, 1)}
                            disabled={isOutOfStock || isAtMax}
                            className="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white active:scale-95 transition-all shadow-xs"
                            aria-label="Aumentar"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PEDIDOS TAB ── */}
        {activeTab === 'pedidos' && (
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Pedidos Ativos</h2>
              <button
                onClick={loadOrders}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                aria-label="Atualizar pedidos"
              >
                <RefreshCw className={`w-4 h-4 ${loadingOrders ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Ordenação aplicada tanto aos pedidos ativos quanto ao histórico */}
            <SortControl
              options={REST_ORDER_SORT_OPTIONS}
              value={orderSort}
              direction={orderSortDir}
              onChange={setOrderSort}
              onDirectionChange={setOrderSortDir}
              label="Ordenar pedidos por"
              className="max-w-sm"
            />

            {loadingOrders ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-24 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : activeOrders.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhum pedido ativo no momento.</p>
                <button
                  onClick={() => setActiveTab('catalogo')}
                  className="mt-3 text-xs text-emerald-600 font-semibold underline underline-offset-2"
                >
                  Fazer um pedido →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onViewTimeline={() => setTimelineOrder(order)}
                    onCheckIn={() => setCheckInOrder(order)}
                    onCancel={() => handleCancelOrder(order)}
                  />
                ))}
              </div>
            )}

            {pastOrders.length > 0 && (
              <>
                <h2 className="text-sm font-bold text-slate-800 pt-2">Histórico</h2>
                <div className="space-y-2">
                  {pastOrders.slice(0, 5).map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      onViewTimeline={() => setTimelineOrder(order)}
                      onCheckIn={null}
                      onCancel={null}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Floating Cart Bar ── */}
      {totalCartItems > 0 && activeTab === 'catalogo' && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96 z-40 bg-slate-900 text-white p-3.5 rounded-2xl shadow-float flex items-center justify-between border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-sm">
              {totalCartItems}
            </div>
            <div>
              <p className="text-xs font-semibold">Itens no Carrinho</p>
              <p className="text-[11px] text-slate-400">
                {cartItems.length} {cartItems.length === 1 ? 'produto' : 'produtos'} selecionados
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsCartOpen(true)}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-colors active:scale-95 shadow-sm min-h-[44px]"
          >
            Revisar Pedido
          </button>
        </div>
      )}

      {/* ── Modais ── */}
      <CartBottomSheet
        isOpen={isCartOpen}
        items={cartItems}
        onClose={() => setIsCartOpen(false)}
        onUpdateQty={updateCartQty}
        onSubmit={handleSubmitOrder}
        isSubmitting={isSubmittingOrder}
      />

      <OrderTimelineModal
        isOpen={!!timelineOrder}
        order={timelineOrder}
        onClose={() => setTimelineOrder(null)}
      />

      <CheckInDeliveryModal
        isOpen={!!checkInOrder}
        order={checkInOrder}
        onClose={() => setCheckInOrder(null)}
        onConfirm={handleConfirmDelivery}
        isSubmitting={isConfirmingDelivery}
      />
    </>
  );
}

// ─── OrderCard Sub-component ──────────────────────────────────────────────────

function OrderCard({
  order,
  onViewTimeline,
  onCheckIn,
  onCancel,
}: {
  order: Order;
  onViewTimeline: () => void;
  onCheckIn: (() => void) | null;
  onCancel: (() => void) | null;
}) {
  const itemCount = order.order_items?.length ?? 0;
  const canCheckIn = order.status === 'EM_TRANSITO';
  const canCancel = order.status === 'ABERTO' || order.status === 'EM_ANALISE';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-subtle p-4 space-y-3">
      {/* Top Row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-slate-400">#{order.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {itemCount} {itemCount === 1 ? 'item' : 'itens'} · {formatRelative(order.created_at)}
          </p>
        </div>
        <StatusBadge status={order.status} size="md" />
      </div>

      {order.notes && (
        <p className="text-xs text-slate-600 italic leading-relaxed line-clamp-2">{order.notes}</p>
      )}

      {order.delay_reason && (
        <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-xl px-3 py-1.5">
          ⚠️ {order.delay_reason}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onViewTimeline}
          className="flex-1 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors min-h-[44px]"
        >
          Ver Timeline
        </button>
        {canCheckIn && onCheckIn && (
          <button
            onClick={onCheckIn}
            className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors min-h-[44px]"
          >
            Conferir Entrega
          </button>
        )}
        {canCancel && onCancel && (
          <button
            onClick={onCancel}
            className="py-2 px-3 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-xl transition-colors min-h-[44px]"
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
