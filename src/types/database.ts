// InsumoSync: Database Type Definitions
// Generated & Maintained by doc-specialist & cloud-db-architect

export type OrderStatus =
  | 'ABERTO'
  | 'EM_ANALISE'
  | 'EM_ATRASO'
  | 'CANCELAMENTO_PENDENTE'
  | 'EM_TRANSITO'
  | 'CONCLUIDO_TOTAL'
  | 'CONCLUIDO_PARCIAL'
  | 'CONCLUIDO_NAO_ENTREGUE'
  | 'CANCELADO';

export type DelayReason = 'Falta de Produto' | 'Transporte Indisponível' | string;

export type CompletionType = 'TOTAL' | 'PARCIAL' | 'NAO_ENTREGUE';

export type StockMovementType = 'ENTRADA_MANUAL' | 'SAIDA_PEDIDO' | 'ESTORNO_CANCELAMENTO';

export type ProductCategory =
  | 'Carnes & Aves'
  | 'Hortifrúti'
  | 'Laticínios'
  | 'Mercearia & Temperos'
  | 'Bebidas & Embalagens'
  | string;

export interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
  is_active: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  restaurant_id: string;
  status: OrderStatus;
  delay_reason: DelayReason | null;
  completion_type: CompletionType | null;
  notes: string | null;
  deposit_notes?: string | null;
  created_at: string;
  updated_at: string;
  // Joins
  restaurant?: Restaurant;
  order_items?: OrderItem[];
  order_status_logs?: OrderStatusLog[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  requested_qty: number;
  approved_qty: number | null;
  delivered_qty: number | null;
  reduction_reason?: string | null;
  // Joins
  product?: Product;
}

export interface OrderStatusLog {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  reason: string | null;
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  created_at: string;
  // Joins
  product?: Product;
}

// RPC Payloads & Responses
export interface PlaceOrderItemPayload {
  product_id: string;
  requested_qty: number;
}

export interface PlaceOrderResponse {
  success: boolean;
  order_id?: string;
  code?: string;
  error?: string;
  product_id?: string;
  product_name?: string;
  available_stock?: number;
  requested_qty?: number;
}

export interface TransitionOrderStatusResponse {
  success: boolean;
  order_id?: string;
  from_status?: OrderStatus;
  to_status?: OrderStatus;
  code?: string;
  error?: string;
}

export interface RestockProductResponse {
  success: boolean;
  product_id?: string;
  product_name?: string;
  added_quantity?: number;
  new_stock?: number;
  code?: string;
  error?: string;
}

export type PersonaType = 'estoque' | 'restaurante' | 'admin';

// ─── Product Management Payloads ─────────────────────────────────────────────

export interface ProductUpsertPayload {
  id?: string; // undefined = CREATE, string = UPDATE
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
}

export interface ProductUpsertResponse {
  success: boolean;
  product_id?: string;
  action?: 'created' | 'updated';
  error?: string;
}

export interface DeactivateProductResponse {
  success: boolean;
  product_id?: string;
  product_name?: string;
  forced?: boolean;
  affected_orders?: number;
  conflict_count?: number;
  /** Saldo devolvido ao estoque ao zerar os itens dos pedidos em aberto. */
  returned_to_stock?: number;
  /** Pedidos cancelados automaticamente por terem ficado sem nenhum item. */
  cancelled_orders?: number;
  code?: string;
  error?: string;
}

/** Ação destrutiva disponível no catálogo: ocultar ou remover definitivamente. */
export type ProductActionMode = 'deactivate' | 'delete';

export interface ProductUsageResponse {
  success: boolean;
  product_id?: string;
  product_name?: string;
  /** Pedidos ABERTO ou EM_ANALISE que contêm este insumo. */
  open_order_count?: number;
  /** Total de itens de pedido (qualquer status) que já referenciaram o insumo. */
  total_item_count?: number;
  /** Deleção definitiva só é possível quando o insumo nunca foi usado. */
  can_hard_delete?: boolean;
  code?: string;
  error?: string;
}

export interface DeleteProductResponse {
  success: boolean;
  product_id?: string;
  product_name?: string;
  item_count?: number;
  code?: string;
  error?: string;
}

// ─── Triagem Atômica ─────────────────────────────────────────────────────────

export interface ApplyTriageItemPayload {
  item_id: string;
  approved_qty: number;
  reduction_reason?: string | null;
}

export interface ApplyTriageResponse {
  success: boolean;
  order_id?: string;
  /** Positivo devolveu saldo ao estoque; negativo reservou saldo adicional. */
  returned_to_stock?: number;
  product_name?: string;
  available_stock?: number;
  code?: string;
  error?: string;
}

// ─── Analytics do Administrador (RPC get_admin_analytics) ────────────────────

export interface AdminKpis {
  total_orders: number;
  /** Base da pontualidade: pedidos que chegaram a um desfecho de entrega. */
  delivered_base: number;
  on_time_count: number;
  delayed_count: number;
  /** Percentual de 0 a 100. `null` quando `delivered_base` é zero — a métrica é
   *  indefinida, e exibir 100% nesse caso seria enganoso. */
  on_time_rate: number | null;
  cancelled_count: number;
  in_progress_count: number;
  critical_items: number;
  active_products: number;
}

export interface DelayReasonStat {
  reason: string;
  count: number;
}

export interface OutcomeStat {
  status: 'CONCLUIDO_TOTAL' | 'CONCLUIDO_PARCIAL' | 'CONCLUIDO_NAO_ENTREGUE';
  count: number;
}

export interface ConsumptionStat {
  product_id: string;
  name: string;
  unit: string;
  total: number;
}

export interface TimelinePoint {
  /** Data no formato `YYYY-MM-DD`, no fuso America/Sao_Paulo. */
  day: string;
  created: number;
  completed: number;
}

export interface AdminAnalyticsResponse {
  success: boolean;
  kpis?: AdminKpis;
  delay_reasons?: DelayReasonStat[];
  outcomes?: OutcomeStat[];
  consumption?: ConsumptionStat[];
  orders_timeline?: TimelinePoint[];
  error?: string;
}
