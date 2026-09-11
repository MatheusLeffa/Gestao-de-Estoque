// InsumoSync: Order Service — Fase 2
// Author: backend-workflow-engine
// Todas as operações de pedido são realizadas via RPCs atômicas no Supabase (SELECT ... FOR UPDATE)

import { supabase } from '@/lib/supabase/client';
import type {
  Order,
  OrderStatus,
  PlaceOrderItemPayload,
  PlaceOrderResponse,
  TransitionOrderStatusResponse,
  ApplyTriageItemPayload,
  ApplyTriageResponse,
} from '@/types/database';

// ─── Transições de Status Permitidas (máquina de estados) ────────────────────
const ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ABERTO:               ['EM_ANALISE', 'CANCELADO'],
  EM_ANALISE:           ['EM_TRANSITO', 'EM_ATRASO', 'CANCELAMENTO_PENDENTE', 'CANCELADO'],
  EM_ATRASO:            ['EM_TRANSITO', 'CANCELAMENTO_PENDENTE', 'CANCELADO', 'EM_ANALISE'],
  CANCELAMENTO_PENDENTE:['CANCELADO'],
  EM_TRANSITO:          ['CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'EM_ATRASO', 'CANCELADO'],
};

/** Valida se a transição de status é permitida pela máquina de estados */
export function isTransitionAllowed(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Criação de Pedido com Reserva Atômica ───────────────────────────────────

export interface PlaceOrderParams {
  restaurantId: string;
  items: PlaceOrderItemPayload[];
  notes?: string;
}

export interface PlaceOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
  conflictItem?: { productId: string; productName?: string; available: number; requested: number };
}

/** Cria um pedido com reserva atômica de estoque via RPC place_order_with_reservation */
export async function placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  if (!params.items.length) {
    return { success: false, error: 'O carrinho não pode estar vazio.' };
  }

  const { data, error } = await supabase.rpc('place_order_with_reservation', {
    p_restaurant_id: params.restaurantId,
    p_items: params.items,
    p_notes: params.notes ?? null,
  });

  if (error) {
    return { success: false, error: `Erro ao processar pedido: ${error.message}` };
  }

  const result = data as PlaceOrderResponse;

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? 'Falha ao reservar estoque.',
      conflictItem: result.product_id
        ? {
            productId: result.product_id,
            productName: result.product_name,
            available: result.available_stock ?? 0,
            requested: result.requested_qty ?? 0,
          }
        : undefined,
    };
  }

  return { success: true, orderId: result.order_id };
}

// ─── Busca de Pedidos do Restaurante ─────────────────────────────────────────

export interface FetchOrdersParams {
  restaurantId: string;
  limit?: number;
}

export async function fetchOrders(params: FetchOrdersParams): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (*)
      ),
      order_status_logs (*)
    `)
    .eq('restaurant_id', params.restaurantId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 20);

  if (error) {
    console.error('[order-service] fetchOrders error:', error.message);
    return [];
  }

  return (data ?? []) as Order[];
}

// ─── Transição de Status via RPC ─────────────────────────────────────────────

export interface TransitionStatusParams {
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  reason?: string;
  completionType?: 'TOTAL' | 'PARCIAL' | 'NAO_ENTREGUE';
  delayReason?: string;
}

export interface TransitionStatusResult {
  success: boolean;
  error?: string;
}

export async function transitionOrderStatus(params: TransitionStatusParams): Promise<TransitionStatusResult> {
  if (!isTransitionAllowed(params.fromStatus, params.toStatus)) {
    return {
      success: false,
      error: `Transição de '${params.fromStatus}' para '${params.toStatus}' não é permitida.`,
    };
  }

  const { data, error } = await supabase.rpc('transition_order_status', {
    p_order_id: params.orderId,
    p_new_status: params.toStatus,
    p_reason: params.delayReason ?? params.reason ?? null,
    p_completion_type: params.completionType ?? null,
  });

  if (error) {
    return { success: false, error: `Erro na transição: ${error.message}` };
  }

  const result = data as TransitionOrderStatusResponse;
  if (!result.success) {
    return { success: false, error: result.error ?? 'Transição recusada pelo servidor.' };
  }

  return { success: true };
}

// ─── Cancelamento de Pedido ───────────────────────────────────────────────────

export async function cancelOrder(orderId: string, currentStatus: OrderStatus): Promise<TransitionStatusResult> {
  // ABERTO → CANCELADO direto (estorno atômico via RPC)
  if (currentStatus === 'ABERTO') {
    return transitionOrderStatus({
      orderId,
      fromStatus: 'ABERTO',
      toStatus: 'CANCELADO',
      reason: 'Pedido cancelado pelo restaurante antes do início da análise.',
    });
  }

  // EM_ANALISE → CANCELAMENTO_PENDENTE (requer aprovação do depósito)
  if (currentStatus === 'EM_ANALISE') {
    return transitionOrderStatus({
      orderId,
      fromStatus: 'EM_ANALISE',
      toStatus: 'CANCELAMENTO_PENDENTE',
      reason: 'Solicitação de cancelamento enviada pelo restaurante.',
    });
  }

  return { success: false, error: 'Este pedido não pode mais ser cancelado.' };
}

// ─── Busca de Todos os Pedidos (Depósito & Admin) ────────────────────────────

export async function fetchAllOrders(limit: number = 50): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      restaurant:restaurants (*),
      order_items (
        *,
        product:products (*)
      ),
      order_status_logs (*)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[order-service] fetchAllOrders error:', error.message);
    return [];
  }

  return (data ?? []) as Order[];
}

// ─── Atualização de Quantidades Aprovadas na Triagem ─────────────────────────

export interface ApprovedItemPayload {
  itemId: string;
  approvedQty: number;
  reductionReason?: string | null;
}

/**
 * Aplica a triagem do depósito através da RPC atômica `apply_order_triage`.
 *
 * Toda a contabilidade acontece no PostgreSQL, dentro de uma única transação com
 * `SELECT ... FOR UPDATE`: a diferença reduzida volta imediatamente ao
 * `current_stock` e gera a devida movimentação em `stock_movements`.
 *
 * O banco também é quem exige a justificativa individual de cada redução, de modo
 * que a regra continua valendo mesmo se a validação da tela for contornada.
 *
 * @param orderId Pedido em triagem.
 * @param depositNotes Observações gerais ao restaurante. `undefined` preserva o
 *                     valor atual; string vazia limpa o campo.
 */
export async function updateApprovedItems(
  items: ApprovedItemPayload[],
  orderId?: string,
  depositNotes?: string
): Promise<ApplyTriageResponse> {
  if (!orderId) {
    return { success: false, error: 'Pedido não informado para a triagem.' };
  }

  const payload: ApplyTriageItemPayload[] = items.map(
    ({ itemId, approvedQty, reductionReason }) => ({
      item_id: itemId,
      approved_qty: approvedQty,
      reduction_reason: reductionReason ?? null,
    })
  );

  const { data, error } = await supabase.rpc('apply_order_triage', {
    p_order_id: orderId,
    p_items: payload,
    p_deposit_notes: depositNotes ?? null,
  });

  if (error) {
    return { success: false, error: `Erro ao aplicar a triagem: ${error.message}` };
  }

  return data as ApplyTriageResponse;
}

// ─── Aprovação de Cancelamento Solicitado pelo Restaurante ───────────────────

export async function approvePendingCancellation(orderId: string): Promise<TransitionStatusResult> {
  return transitionOrderStatus({
    orderId,
    fromStatus: 'CANCELAMENTO_PENDENTE',
    toStatus: 'CANCELADO',
    reason: 'Cancelamento aprovado pelo operador do Depósito Central. Saldo estornado.',
  });
}

// ─── Cancelamento de Pedido pelo Depósito ─────────────────────────────────────────────

/**
 * Cancela um pedido diretamente pelo depósito (ABERTO, EM_ANALISE ou EM_ATRASO → CANCELADO).
 * O estorno de estoque é gerenciado atomicamente pela RPC transition_order_status.
 */
export async function cancelOrderByDepot(
  orderId: string,
  currentStatus: OrderStatus,
  reason: string
): Promise<TransitionStatusResult> {
  const cancellableStatuses: OrderStatus[] = ['ABERTO', 'EM_ANALISE', 'EM_ATRASO'];
  if (!cancellableStatuses.includes(currentStatus)) {
    return { success: false, error: 'Este pedido não pode ser cancelado pelo depósito neste status.' };
  }

  return transitionOrderStatus({
    orderId,
    fromStatus: currentStatus,
    toStatus: 'CANCELADO',
    reason: `Cancelamento pelo depósito: ${reason}`,
  });
}
