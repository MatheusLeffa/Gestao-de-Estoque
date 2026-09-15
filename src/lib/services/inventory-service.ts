// InsumoSync: Inventory Service — Fase 2
// Author: backend-workflow-engine / cloud-db-architect

import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { mockStore } from '@/lib/services/mock-store';
import type {
  Product,
  RestockProductResponse,
  ProductUpsertPayload,
  ProductUpsertResponse,
  DeactivateProductResponse,
  ProductUsageResponse,
  DeleteProductResponse,
  StockForecastingResponse,
  StockForecastItem,
  ForecastUrgency,
} from '@/types/database';

// ─── Catálogo de Produtos ─────────────────────────────────────────────────────

export async function fetchProducts(includeInactive = false): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getProducts(includeInactive);
  }

  let query = supabase
    .from('products')
    .select('*')
    .order('category')
    .order('name');

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[inventory-service] fetchProducts error:', error.message);
    return [];
  }

  return (data ?? []) as Product[];
}

export async function fetchProductById(productId: string): Promise<Product | null> {
  if (!isSupabaseConfigured) {
    return mockStore.getProductById(productId);
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error) return null;
  return data as Product;
}

// ─── Estoque Crítico (abaixo do mínimo) ──────────────────────────────────────

export async function fetchLowStockProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured) {
    return mockStore.getProducts(false).filter((p) => p.current_stock <= p.min_stock_alert);
  }

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('current_stock');

  if (error) return [];
  return ((data ?? []) as Product[]).filter(
    (p) => p.current_stock <= p.min_stock_alert
  );
}

// ─── Reabastecimento de Produto (operador do depósito) ───────────────────────

export interface RestockParams {
  productId: string;
  quantity: number;
  reason?: string;
}

export interface RestockResult {
  success: boolean;
  newStock?: number;
  productName?: string;
  error?: string;
}

export async function restockProduct(params: RestockParams): Promise<RestockResult> {
  if (params.quantity <= 0) {
    return { success: false, error: 'A quantidade de reabastecimento deve ser maior que zero.' };
  }

  if (!isSupabaseConfigured) {
    const res = mockStore.restockProduct(params.productId, params.quantity, params.reason ?? 'Reabastecimento offline');
    return {
      success: res.success,
      newStock: res.new_stock,
      productName: res.product_name,
      error: res.error,
    };
  }

  const { data, error } = await supabase.rpc('restock_product', {
    p_product_id: params.productId,
    p_quantity: params.quantity,
    p_reason: params.reason ?? 'Reabastecimento manual pelo depósito',
  });

  if (error) {
    return { success: false, error: `Erro ao reabastecer: ${error.message}` };
  }

  const result = data as RestockProductResponse;
  if (!result.success) {
    return { success: false, error: result.error ?? 'Falha no reabastecimento.' };
  }

  return {
    success: true,
    newStock: result.new_stock,
    productName: result.product_name,
  };
}

// ─── Criar / Atualizar Produto ───────────────────────────────────────────────

export async function createOrUpdateProduct(
  payload: ProductUpsertPayload
): Promise<ProductUpsertResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.upsertProduct(payload);
  }

  const { data, error } = await supabase.rpc('create_or_update_product', {
    p_id:               payload.id ?? null,
    p_name:             payload.name,
    p_category:         payload.category,
    p_unit:             payload.unit,
    p_current_stock:    payload.id ? 0 : payload.current_stock, // stock só na criação
    p_min_stock_alert:  payload.min_stock_alert,
  });

  if (error) {
    return { success: false, error: `Erro ao salvar produto: ${error.message}` };
  }

  const result = data as ProductUpsertResponse;
  return result;
}

// ─── Desativar Produto (Soft-delete) ─────────────────────────────────────────

export async function deactivateProduct(
  productId: string,
  force = false
): Promise<DeactivateProductResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.deactivateProduct(productId);
  }

  const { data, error } = await supabase.rpc('deactivate_product', {
    p_product_id: productId,
    p_force:      force,
  });

  if (error) {
    return { success: false, error: `Erro ao desativar produto: ${error.message}` };
  }

  return data as DeactivateProductResponse;
}

// ─── Reativar Produto ─────────────────────────────────────────────────────────

export async function reactivateProduct(
  productId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    const prod = mockStore.getProductById(productId);
    if (prod) {
      prod.is_active = true;
      return { success: true };
    }
    return { success: false, error: 'Produto não encontrado' };
  }

  const { data, error } = await supabase.rpc('reactivate_product', {
    p_product_id: productId,
  });

  if (error) {
    return { success: false, error: `Erro ao reativar produto: ${error.message}` };
  }

  return data as { success: boolean; error?: string };
}

// ─── Uso do Produto (fonte de verdade server-side para a UI) ─────────────────

/**
 * Consulta no banco quantos pedidos em aberto e quantos itens históricos
 * referenciam o insumo. A UI usa isso para decidir entre desativar e deletar,
 * em vez de contar sobre a lista de pedidos carregada na tela (que é paginada).
 */
export async function checkProductUsage(
  productId: string
): Promise<ProductUsageResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.checkProductUsage(productId);
  }

  const { data, error } = await supabase.rpc('check_product_usage', {
    p_product_id: productId,
  });

  if (error) {
    return { success: false, error: `Erro ao verificar uso do produto: ${error.message}` };
  }

  return data as ProductUsageResponse;
}

// ─── Deletar Produto (remoção definitiva) ────────────────────────────────────

/**
 * Remove o insumo em definitivo. Só é permitido quando ele nunca apareceu em
 * nenhum pedido — caso contrário a RPC devolve `HAS_ORDER_HISTORY` e a interface
 * oferece a desativação, preservando o histórico.
 */
export async function deleteProduct(
  productId: string
): Promise<DeleteProductResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.deleteProduct(productId);
  }

  const { data, error } = await supabase.rpc('delete_product', {
    p_product_id: productId,
  });

  if (error) {
    return { success: false, error: `Erro ao remover produto: ${error.message}` };
  }

  return data as DeleteProductResponse;
}

// ─── Categorias únicas do catálogo ───────────────────────────────────────────

export function extractCategories(products: Product[]): string[] {
  return ['Todos', ...Array.from(new Set(products.map((p) => p.category))).sort()];
}

// ─── Filtragem client-side de produtos ───────────────────────────────────────

export function filterProducts(
  products: Product[],
  search: string,
  category: string
): Product[] {
  const q = search.trim().toLowerCase();
  return products.filter((p) => {
    const matchCat = category === 'Todos' || p.category === category;
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });
}

// ─── Previsibilidade de Estoque (RPC get_stock_forecasting) ─────────────────

export async function fetchStockForecasting(
  daysWindow = 14
): Promise<StockForecastingResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.getStockForecasting(daysWindow);
  }

  const { data, error } = await supabase.rpc('get_stock_forecasting', {
    p_days_window: daysWindow,
  });

  if (error) {
    console.error('[inventory-service] fetchStockForecasting error:', error.message);
    return {
      success: false,
      error: `Erro ao calcular previsibilidade de estoque: ${error.message}`,
    };
  }

  return data as StockForecastingResponse;
}

export function getUrgencyBadgeConfig(urgency: ForecastUrgency): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (urgency) {
    case 'ESGOTADO':
      return {
        label: 'Esgotado',
        badgeClass: 'bg-red-100 text-red-900 border-red-300 font-extrabold',
        dotClass: 'bg-red-600 animate-ping',
      };
    case 'CRITICO':
      return {
        label: 'Crítico (<= 2 dias)',
        badgeClass: 'bg-red-50 text-red-700 border-red-200 font-bold',
        dotClass: 'bg-red-500 animate-pulse',
      };
    case 'ALERTA':
      return {
        label: 'Alerta (<= 5 dias)',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 font-bold',
        dotClass: 'bg-amber-500',
      };
    case 'ATENCAO':
      return {
        label: 'Atenção (<= 10 dias)',
        badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200 font-semibold',
        dotClass: 'bg-yellow-500',
      };
    case 'ESTAVEL':
      return {
        label: 'Estável (> 10 dias)',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold',
        dotClass: 'bg-emerald-500',
      };
    case 'SEM_CONSUMO':
    default:
      return {
        label: 'Sem saídas',
        badgeClass: 'bg-slate-50 text-slate-600 border-slate-200 font-medium',
        dotClass: 'bg-slate-400',
      };
  }
}

export function formatDaysRemaining(days: number | null, urgency: ForecastUrgency): string {
  if (urgency === 'ESGOTADO') return 'Estoque zerado';
  if (days === null) return 'Sem saídas';
  if (days <= 0) return 'Esgota hoje';
  if (days === 1) return 'Esgota em ~1 dia';
  return `Esgota em ~${days} dias`;
}

