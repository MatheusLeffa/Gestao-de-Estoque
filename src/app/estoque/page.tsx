// InsumoSync: Depósito Central (Estoque) — Módulo Completo (Fase 4)
// Authors: frontend-engineer / ui-ux-designer / backend-workflow-engine

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Product, Order, OrderStatus } from '@/types/database';
import {
  Package,
  AlertTriangle,
  Truck,
  Clock,
  RefreshCw,
  Plus,
  Search,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Volume2,
  VolumeX,
  Play,
  ArrowRight,
  Filter,
  Check,
  AlertOctagon,
  XCircle,
} from 'lucide-react';
import { useDemo } from '@/contexts/DemoContext';
import { chimeService } from '@/lib/audio/chime';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderApprovalModal } from '@/components/estoque/OrderApprovalModal';
import { RestockModal } from '@/components/estoque/RestockModal';
import { OrderTimelineModal } from '@/components/restaurante/OrderTimelineModal';
import {
  fetchAllOrders,
  transitionOrderStatus,
  updateApprovedItems,
  approvePendingCancellation,
} from '@/lib/services/order-service';
import {
  fetchProducts,
  restockProduct,
  extractCategories,
} from '@/lib/services/inventory-service';

type ActiveTab = 'pedidos' | 'catalogo';

export default function EstoquePage() {
  const { soundEnabled, setSoundEnabled } = useDemo();
  const toggleSound = () => setSoundEnabled(!soundEnabled);

  // Dados principais
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Navegação por abas
  const [activeTab, setActiveTab] = useState<ActiveTab>('pedidos');

  // Filtros - Pedidos
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('TODOS');
  const [orderSearch, setOrderSearch] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());

  // Filtros - Catálogo
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [onlyLowStock, setOnlyLowStock] = useState(false);

  // Modais
  const [selectedOrderForApproval, setSelectedOrderForApproval] = useState<Order | null>(null);
  const [selectedOrderForTimeline, setSelectedOrderForTimeline] = useState<Order | null>(null);
  const [selectedProductForRestock, setSelectedProductForRestock] = useState<Product | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Toast banner em tempo real
  const [realtimeToast, setRealtimeToast] = useState<{ message: string; visible: boolean }>({
    message: '',
    visible: false,
  });

  const showToast = (message: string) => {
    setRealtimeToast({ message, visible: true });
    setTimeout(() => {
      setRealtimeToast((prev) => ({ ...prev, visible: false }));
    }, 4500);
  };

  // Carregamento de dados
  const loadData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const [productsData, ordersData] = await Promise.all([
        fetchProducts(),
        fetchAllOrders(60),
      ]);
      setProducts(productsData);
      setOrders(ordersData);
    } catch (e) {
      console.error('Erro ao carregar dados do Depósito:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Inscrição Supabase Realtime
    const ordersChannel = supabase
      .channel('realtime_deposito_orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          if (soundEnabled) {
            chimeService.playOrderChime();
          }
          showToast('🔔 Novo pedido recebido de restaurante!');
          loadData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        () => {
          loadData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
    };
  }, [loadData, soundEnabled]);

  // Contadores & Métricas
  const criticalItems = products.filter((p) => p.current_stock <= p.min_stock_alert);
  const openOrders = orders.filter((o) => o.status === 'ABERTO');
  const analyzingOrders = orders.filter((o) => o.status === 'EM_ANALISE');
  const transitOrders = orders.filter((o) => o.status === 'EM_TRANSITO');
  const delayedOrders = orders.filter((o) => o.status === 'EM_ATRASO');
  const pendingCancelOrders = orders.filter((o) => o.status === 'CANCELAMENTO_PENDENTE');

  // Categorias únicas
  const categories = extractCategories(products);

  // Toggle de itens do pedido expandidos
  const toggleOrderExpand = (orderId: string) => {
    setExpandedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  // ─── Ações de Pedidos ────────────────────────────────────────────────────────

  // Iniciar Separação (ABERTO -> EM_ANALISE)
  const handleStartAnalysis = async (order: Order) => {
    setIsSubmittingAction(true);
    try {
      const res = await transitionOrderStatus({
        orderId: order.id,
        fromStatus: 'ABERTO',
        toStatus: 'EM_ANALISE',
        reason: 'Separação e triagem de itens iniciada no depósito central.',
      });

      if (res.success) {
        if (soundEnabled) chimeService.playSuccessPing();
        showToast(`Pedido #${order.id.slice(0, 8).toUpperCase()} agora está Em Análise!`);
        await loadData(true);
      } else {
        alert(res.error ?? 'Falha ao iniciar separação.');
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Despachar Pedido (EM_ANALISE / EM_ATRASO -> EM_TRANSITO)
  const handleDispatchOrder = async (order: Order) => {
    setIsSubmittingAction(true);
    try {
      const res = await transitionOrderStatus({
        orderId: order.id,
        fromStatus: order.status,
        toStatus: 'EM_TRANSITO',
        reason: 'Itens conferidos e expedidos para transporte até o restaurante.',
      });

      if (res.success) {
        if (soundEnabled) chimeService.playSuccessPing();
        showToast(`🚚 Pedido #${order.id.slice(0, 8).toUpperCase()} despachado em trânsito!`);
        await loadData(true);
      } else {
        alert(res.error ?? 'Falha ao despachar pedido.');
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Submeter aprovação / atraso via OrderApprovalModal
  const handleApproveOrderModal = async (
    orderId: string,
    approvedItems: { itemId: string; approvedQty: number }[],
    action: 'approve' | 'delay',
    delayReason?: string
  ) => {
    setIsSubmittingAction(true);
    try {
      // 1. Atualiza quantidades aprovadas nos itens
      if (action === 'approve' && approvedItems.length > 0) {
        const itemRes = await updateApprovedItems(approvedItems);
        if (!itemRes.success) {
          alert(itemRes.error ?? 'Erro ao salvar quantidades aprovadas.');
          return;
        }
      }

      const targetOrder = orders.find((o) => o.id === orderId);
      if (!targetOrder) return;

      if (action === 'approve') {
        // Se estava ABERTO, transiciona para EM_ANALISE e depois EM_TRANSITO
        if (targetOrder.status === 'ABERTO') {
          await transitionOrderStatus({
            orderId,
            fromStatus: 'ABERTO',
            toStatus: 'EM_ANALISE',
            reason: 'Triagem concluída pelo operador do depósito.',
          });
        }
        const res = await transitionOrderStatus({
          orderId,
          fromStatus: targetOrder.status === 'ABERTO' ? 'EM_ANALISE' : targetOrder.status,
          toStatus: 'EM_TRANSITO',
          reason: 'Pedido aprovado com quantidades validadas e expedido para transporte.',
        });

        if (!res.success) {
          alert(res.error ?? 'Erro ao despachar.');
          return;
        }
        if (soundEnabled) chimeService.playSuccessPing();
        showToast(`✅ Pedido #${orderId.slice(0, 8).toUpperCase()} aprovado e despachado!`);
      } else {
        // Registrar Atraso
        if (targetOrder.status === 'ABERTO') {
          await transitionOrderStatus({
            orderId,
            fromStatus: 'ABERTO',
            toStatus: 'EM_ANALISE',
            reason: 'Triagem iniciada.',
          });
        }
        const res = await transitionOrderStatus({
          orderId,
          fromStatus: targetOrder.status === 'ABERTO' ? 'EM_ANALISE' : targetOrder.status,
          toStatus: 'EM_ATRASO',
          delayReason: delayReason ?? 'Atraso operacional no depósito.',
        });

        if (!res.success) {
          alert(res.error ?? 'Erro ao registrar atraso.');
          return;
        }
        if (soundEnabled) chimeService.playSuccessPing();
        showToast(`⚠️ Atraso registrado para pedido #${orderId.slice(0, 8).toUpperCase()}`);
      }

      setSelectedOrderForApproval(null);
      await loadData(true);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Aprovar cancelamento pendente do restaurante
  const handleApproveCancellation = async (order: Order) => {
    if (!confirm(`Deseja aprovar o cancelamento do pedido #${order.id.slice(0, 8).toUpperCase()}? O estoque reservado será estornado automaticamente.`)) {
      return;
    }

    setIsSubmittingAction(true);
    try {
      const res = await approvePendingCancellation(order.id);
      if (res.success) {
        if (soundEnabled) chimeService.playSuccessPing();
        showToast(`Pedido #${order.id.slice(0, 8).toUpperCase()} cancelado e estoque estornado!`);
        await loadData(true);
      } else {
        alert(res.error ?? 'Falha ao estornar cancelamento.');
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Reabastecer insumo via RestockModal
  const handleRestockSubmit = async (productId: string, quantity: number, reason: string) => {
    setIsSubmittingAction(true);
    try {
      const res = await restockProduct({ productId, quantity, reason });
      if (res.success) {
        if (soundEnabled) chimeService.playSuccessPing();
        showToast(`📦 +${quantity} adicionados a ${res.productName}! Novo saldo: ${res.newStock}`);
        setSelectedProductForRestock(null);
        await loadData(true);
      } else {
        alert(res.error ?? 'Erro ao reabastecer insumo.');
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Filtragem de pedidos
  const filteredOrders = orders.filter((o) => {
    const matchesStatus =
      orderStatusFilter === 'TODOS'
        ? true
        : orderStatusFilter === 'ABERTO'
        ? o.status === 'ABERTO'
        : orderStatusFilter === 'EM_ANALISE'
        ? o.status === 'EM_ANALISE'
        : orderStatusFilter === 'EM_ATRASO'
        ? o.status === 'EM_ATRASO'
        : orderStatusFilter === 'EM_TRANSITO'
        ? o.status === 'EM_TRANSITO'
        : orderStatusFilter === 'CONCLUIDOS'
        ? o.status.startsWith('CONCLUIDO_')
        : orderStatusFilter === 'CANCELADOS'
        ? o.status === 'CANCELADO' || o.status === 'CANCELAMENTO_PENDENTE'
        : true;

    const restaurantName = o.restaurant?.name?.toLowerCase() ?? '';
    const orderCode = o.id.slice(0, 8).toLowerCase();
    const query = orderSearch.toLowerCase();
    const matchesSearch = restaurantName.includes(query) || orderCode.includes(query);

    return matchesStatus && matchesSearch;
  });

  // Filtragem de catálogo
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      p.category.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
    const matchesLowStock = onlyLowStock ? p.current_stock <= p.min_stock_alert : true;
    return matchesSearch && matchesCategory && matchesLowStock;
  });

  return (
    <div className="flex-1 p-3 sm:p-6 space-y-5 pb-28 max-w-6xl mx-auto w-full">
      {/* Realtime Toast Banner */}
      {realtimeToast.visible && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2.5 border border-slate-700 animate-in fade-in slide-in-from-top-3 duration-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <p className="text-xs sm:text-sm font-medium">{realtimeToast.message}</p>
        </div>
      )}

      {/* Header Principal */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Package className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Depósito Central</h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Realtime Ativo
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Triagem de pedidos, despacho de reposição e controle de estoque
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Som e Atualizar */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={toggleSound}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${
              soundEnabled
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
            title={soundEnabled ? 'Áudio ativado' : 'Áudio mudo'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            <span className="hidden xs:inline">{soundEnabled ? 'Som Ativo' : 'Mudo'}</span>
          </button>

          <button
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl shadow-xs active:scale-95 transition-all min-h-[44px]"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden xs:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* Cards de Métricas Operacionais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Pedidos Abertos */}
        <button
          onClick={() => {
            setActiveTab('pedidos');
            setOrderStatusFilter('ABERTO');
          }}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all active:scale-[0.98] min-h-[44px] ${
            activeTab === 'pedidos' && orderStatusFilter === 'ABERTO'
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Aguardando Triagem</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-slate-900">{openOrders.length}</span>
            <span className="text-[11px] text-slate-400 font-medium">pedidos abertos</span>
          </div>
        </button>

        {/* Card 2: Em Análise / Separação */}
        <button
          onClick={() => {
            setActiveTab('pedidos');
            setOrderStatusFilter('EM_ANALISE');
          }}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all active:scale-[0.98] min-h-[44px] ${
            activeTab === 'pedidos' && orderStatusFilter === 'EM_ANALISE'
              ? 'bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Em Separação</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Play className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-indigo-900">{analyzingOrders.length}</span>
            <span className="text-[11px] text-indigo-500 font-medium">em conferência</span>
          </div>
        </button>

        {/* Card 3: Em Trânsito */}
        <button
          onClick={() => {
            setActiveTab('pedidos');
            setOrderStatusFilter('EM_TRANSITO');
          }}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all active:scale-[0.98] min-h-[44px] ${
            activeTab === 'pedidos' && orderStatusFilter === 'EM_TRANSITO'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Em Transporte</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-amber-900">{transitOrders.length}</span>
            <span className="text-[11px] text-amber-600 font-medium">na estrada</span>
          </div>
        </button>

        {/* Card 4: Insumos Críticos */}
        <button
          onClick={() => {
            setActiveTab('catalogo');
            setOnlyLowStock(true);
          }}
          className={`p-3.5 sm:p-4 rounded-2xl border text-left transition-all active:scale-[0.98] min-h-[44px] ${
            activeTab === 'catalogo' && onlyLowStock
              ? 'bg-red-50 border-red-300 ring-2 ring-red-500/20 shadow-xs'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Estoque Crítico</span>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${criticalItems.length > 0 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-500'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={`text-2xl font-bold ${criticalItems.length > 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {criticalItems.length}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">insumos em falta</span>
          </div>
        </button>
      </div>

      {/* Alertas Importantes: Pedidos em Atraso ou Cancelamento Pendente */}
      {(delayedOrders.length > 0 || pendingCancelOrders.length > 0) && (
        <div className="space-y-2">
          {pendingCancelOrders.map((order) => (
            <div
              key={order.id}
              className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5">
                <AlertOctagon className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs sm:text-sm font-bold text-amber-900">
                    Cancelamento solicitado pelo restaurante ({order.restaurant?.name})
                  </p>
                  <p className="text-xs text-amber-700">
                    Pedido #{order.id.slice(0, 8).toUpperCase()} aguarda validação para estorno de estoque.
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleApproveCancellation(order)}
                disabled={isSubmittingAction}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all min-h-[44px] shrink-0"
              >
                Aprovar & Devolver Estoque
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Seletor Principal de Abas */}
      <div className="flex bg-slate-200/70 p-1 rounded-2xl gap-1">
        <button
          onClick={() => setActiveTab('pedidos')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] ${
            activeTab === 'pedidos'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Triagem & Pedidos</span>
          {openOrders.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-600 text-white">
              {openOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('catalogo')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all min-h-[44px] ${
            activeTab === 'catalogo'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Catálogo & Reabastecimento</span>
          {criticalItems.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white">
              {criticalItems.length}
            </span>
          )}
        </button>
      </div>

      {/* ─── CONTEÚDO DA ABA 1: TRIAGEM & PEDIDOS ─────────────────────────────── */}
      {activeTab === 'pedidos' && (
        <div className="space-y-4">
          {/* Barra de Filtros e Busca */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por código (#A1B2) ou nome do restaurante..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[44px]"
              />
            </div>

            {/* Pílulas de Status */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {[
                { id: 'TODOS', label: 'Todos' },
                { id: 'ABERTO', label: `Abertos (${openOrders.length})` },
                { id: 'EM_ANALISE', label: `Em Análise (${analyzingOrders.length})` },
                { id: 'EM_ATRASO', label: `Em Atraso (${delayedOrders.length})` },
                { id: 'EM_TRANSITO', label: `Em Trânsito (${transitOrders.length})` },
                { id: 'CONCLUIDOS', label: 'Concluídos' },
                { id: 'CANCELADOS', label: 'Cancelados' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setOrderStatusFilter(pill.id)}
                  className={`px-3 py-2 rounded-xl font-semibold whitespace-nowrap transition-all min-h-[40px] ${
                    orderStatusFilter === pill.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de Pedidos */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
              Carregando pedidos do depósito...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Nenhum pedido encontrado</p>
              <p className="text-xs text-slate-400 mt-1">Ajuste os filtros de busca ou aguarde novos pedidos dos restaurantes.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const isExpanded = expandedOrderIds.has(order.id);
                const items = order.order_items ?? [];
                const totalUnits = items.reduce((acc, it) => acc + Number(it.requested_qty || 0), 0);

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all overflow-hidden"
                  >
                    {/* Header do Card de Pedido */}
                    <div className="p-3.5 sm:p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg">
                            #{order.id.slice(0, 8).toUpperCase()}
                          </span>
                          <StatusBadge status={order.status} />
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{new Date(order.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>

                      {/* Restaurante & Notas */}
                      <div className="mt-2.5">
                        <h3 className="font-bold text-sm sm:text-base text-slate-900">
                          {order.restaurant?.name ?? 'Restaurante'}
                        </h3>
                        {order.notes && (
                          <p className="text-xs text-slate-500 italic mt-0.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                            &quot;{order.notes}&quot;
                          </p>
                        )}
                      </div>

                      {/* Alerta de Atraso se houver */}
                      {order.delay_reason && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>
                            <strong>Motivo do Atraso:</strong> {order.delay_reason}
                          </span>
                        </div>
                      )}

                      {/* Resumo de Itens e Botão Expansor */}
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">
                          {items.length} {items.length === 1 ? 'insumo' : 'insumos'} ({totalUnits} unid. no total)
                        </span>

                        <button
                          onClick={() => toggleOrderExpand(order.id)}
                          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 min-h-[36px]"
                        >
                          <span>{isExpanded ? 'Ocultar Itens' : 'Ver Insumos'}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Detalhamento de Itens (Expansível) */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 bg-slate-50/70 p-3 rounded-xl">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Insumos Solicitados:
                          </p>
                          <div className="divide-y divide-slate-200/60">
                            {items.map((item) => (
                              <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                                <div>
                                  <p className="font-semibold text-slate-900">{item.product?.name ?? 'Insumo'}</p>
                                  <span className="text-[11px] text-slate-500">{item.product?.category}</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-slate-900">
                                    {item.approved_qty ?? item.requested_qty} {item.product?.unit}
                                  </span>
                                  {item.approved_qty !== null && item.approved_qty !== item.requested_qty && (
                                    <p className="text-[10px] text-amber-600">
                                      (solicitado: {item.requested_qty})
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Barra de Ações Operacionais */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                        {/* Botão de Ver Timeline */}
                        <button
                          onClick={() => setSelectedOrderForTimeline(order)}
                          className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 flex items-center gap-1.5 transition-all min-h-[44px]"
                          title="Ver histórico de auditoria"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Timeline</span>
                        </button>

                        {/* Ações contextuais de acordo com o status */}
                        {order.status === 'ABERTO' && (
                          <>
                            <button
                              onClick={() => setSelectedOrderForApproval(order)}
                              disabled={isSubmittingAction}
                              className="px-3 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 flex items-center gap-1.5 transition-all min-h-[44px]"
                            >
                              <span>Triar / Ajustar</span>
                            </button>

                            <button
                              onClick={() => handleStartAnalysis(order)}
                              disabled={isSubmittingAction}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1.5 shadow-xs transition-all active:scale-95 min-h-[44px]"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Iniciar Separação</span>
                            </button>
                          </>
                        )}

                        {order.status === 'EM_ANALISE' && (
                          <>
                            <button
                              onClick={() => setSelectedOrderForApproval(order)}
                              disabled={isSubmittingAction}
                              className="px-3 py-2 rounded-xl text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center gap-1.5 transition-all min-h-[44px]"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Apontar Atraso</span>
                            </button>

                            <button
                              onClick={() => handleDispatchOrder(order)}
                              disabled={isSubmittingAction}
                              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs transition-all active:scale-95 min-h-[44px]"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Despachar em Trânsito</span>
                            </button>
                          </>
                        )}

                        {order.status === 'EM_ATRASO' && (
                          <button
                            onClick={() => handleDispatchOrder(order)}
                            disabled={isSubmittingAction}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 flex items-center gap-1.5 shadow-xs transition-all active:scale-95 min-h-[44px]"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Resolver & Despachar</span>
                          </button>
                        )}

                        {order.status === 'CANCELAMENTO_PENDENTE' && (
                          <button
                            onClick={() => handleApproveCancellation(order)}
                            disabled={isSubmittingAction}
                            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 flex items-center gap-1.5 shadow-xs transition-all active:scale-95 min-h-[44px]"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Aprovar Cancelamento</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── CONTEÚDO DA ABA 2: CATÁLOGO & REABASTECIMENTO ───────────────────── */}
      {activeTab === 'catalogo' && (
        <div className="space-y-4">
          {/* Barra de Busca e Filtros */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar insumo por nome ou categoria..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 min-h-[44px]"
                />
              </div>

              <button
                onClick={() => setOnlyLowStock(!onlyLowStock)}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all min-h-[44px] ${
                  onlyLowStock
                    ? 'bg-red-500 text-white border-red-500 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Apenas Estoque Baixo ({criticalItems.length})</span>
              </button>
            </div>

            {/* Pílulas de Categorias */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-2 rounded-xl font-semibold whitespace-nowrap transition-all min-h-[40px] ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de Insumos */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
              Carregando catálogo de insumos...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300">
              <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Nenhum insumo encontrado</p>
              <p className="text-xs text-slate-400 mt-1">Limpe os filtros para visualizar os outros produtos.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredProducts.map((p) => {
                const isCritical = p.current_stock <= p.min_stock_alert;
                const ratio = Math.min(100, Math.round((p.current_stock / (p.min_stock_alert * 2)) * 100));

                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-2xl border transition-all bg-white flex flex-col justify-between gap-3 shadow-xs hover:border-slate-300 ${
                      isCritical ? 'border-red-200 bg-red-50/20' : 'border-slate-200/80'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-sm sm:text-base text-slate-900">{p.name}</h3>
                          <span className="inline-block mt-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                            {p.category}
                          </span>
                        </div>

                        {isCritical ? (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-extrabold bg-red-100 text-red-700 border border-red-200 shrink-0">
                            ⚠️ Crítico
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            Estoque OK
                          </span>
                        )}
                      </div>

                      {/* Barra de saúde do estoque */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>Disponível: <strong className="text-slate-900">{p.current_stock} {p.unit}</strong></span>
                          <span>Alerta Mínimo: {p.min_stock_alert} {p.unit}</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isCritical ? 'bg-red-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.max(5, ratio)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Botão de Reabastecer */}
                    <button
                      onClick={() => setSelectedProductForRestock(p)}
                      className="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] min-h-[44px]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Reabastecer Insumo</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAIS ─────────────────────────────────────────────────────────── */}

      {/* Modal de Triagem e Aprovação de Pedido */}
      <OrderApprovalModal
        isOpen={!!selectedOrderForApproval}
        order={selectedOrderForApproval}
        onClose={() => setSelectedOrderForApproval(null)}
        onApprove={handleApproveOrderModal}
        isSubmitting={isSubmittingAction}
      />

      {/* Modal de Reabastecimento Manual */}
      <RestockModal
        isOpen={!!selectedProductForRestock}
        product={selectedProductForRestock}
        onClose={() => setSelectedProductForRestock(null)}
        onRestock={handleRestockSubmit}
        isSubmitting={isSubmittingAction}
      />

      {/* Modal de Timeline e Auditoria */}
      <OrderTimelineModal
        isOpen={!!selectedOrderForTimeline}
        order={selectedOrderForTimeline}
        onClose={() => setSelectedOrderForTimeline(null)}
      />
    </div>
  );
}
