// InsumoSync: Kitchen Service — Estoque da Cozinha por restaurante
// Toda escrita de saldo acontece nas RPCs atômicas (business-rules seção 5.A);
// este service só monta o payload e repassa a resposta tipada.

import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { mockStore } from '@/lib/services/mock-store';
import { guardRpcResponse } from '@/lib/services/auth-service';
import type {
  KitchenStockResponse,
  SubmitKitchenCountPayload,
  SubmitKitchenCountResponse,
  RegisterKitchenLossPayload,
  RegisterKitchenLossResponse,
} from '@/types/database';

export async function fetchKitchenStock(restaurantId: string): Promise<KitchenStockResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.getKitchenStock(restaurantId);
  }

  const { data, error } = await supabase.rpc('get_kitchen_stock', {
    p_restaurant_id: restaurantId,
  });

  if (error) {
    console.error('[kitchen-service] fetchKitchenStock error:', error.message);
    return { success: false, error: `Erro ao carregar o estoque da cozinha: ${error.message}` };
  }

  return guardRpcResponse(data as KitchenStockResponse);
}

export async function submitKitchenCount(
  payload: SubmitKitchenCountPayload
): Promise<SubmitKitchenCountResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.submitKitchenCount(payload.restaurantId, payload.items, payload.isInitial);
  }

  const { data, error } = await supabase.rpc('submit_kitchen_count', {
    p_restaurant_id: payload.restaurantId,
    p_items: payload.items,
    p_is_initial: payload.isInitial,
  });

  if (error) {
    return { success: false, error: `Erro ao registrar a contagem: ${error.message}` };
  }

  return guardRpcResponse(data as SubmitKitchenCountResponse);
}

export async function registerKitchenLoss(
  payload: RegisterKitchenLossPayload
): Promise<RegisterKitchenLossResponse> {
  if (!isSupabaseConfigured) {
    return mockStore.registerKitchenLoss(
      payload.restaurantId,
      payload.productId,
      payload.quantity,
      payload.reason
    );
  }

  const { data, error } = await supabase.rpc('register_kitchen_loss', {
    p_restaurant_id: payload.restaurantId,
    p_product_id: payload.productId,
    p_quantity: payload.quantity,
    p_reason: payload.reason,
  });

  if (error) {
    return { success: false, error: `Erro ao registrar a perda: ${error.message}` };
  }

  return guardRpcResponse(data as RegisterKitchenLossResponse);
}
