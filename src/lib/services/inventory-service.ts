// InsumoSync: Inventory Service — Fase 2
// Author: backend-workflow-engine / cloud-db-architect

import { supabase } from '@/lib/supabase/client';
import type {
  Product,
  RestockProductResponse,
  ProductUpsertPayload,
  ProductUpsertResponse,
  DeactivateProductResponse,
} from '@/types/database';

// ─── Catálogo de Produtos ─────────────────────────────────────────────────────

export async function fetchProducts(includeInactive = false): Promise<Product[]> {
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
  const { data, error } = await supabase.rpc('reactivate_product', {
    p_product_id: productId,
  });

  if (error) {
    return { success: false, error: `Erro ao reativar produto: ${error.message}` };
  }

  return data as { success: boolean; error?: string };
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
