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
  image_url?: string | null;
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

// ─── Autenticação & Perfis ───────────────────────────────────────────────────

/** Papel do usuário em `profiles.role`. Coincide com as áreas do app. */
export type AppRole = PersonaType;

export interface Profile {
  id: string;
  role: AppRole;
  /** Obrigatório para `restaurante`; opcional para `estoque` e `admin`. */
  restaurant_id: string | null;
  full_name: string;
  is_active: boolean;
}

/** Códigos que o `auth_guard` das RPCs devolve ao negar uma chamada. */
export type RpcAuthErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN';

// ─── Product Management Payloads ─────────────────────────────────────────────

export interface ProductUpsertPayload {
  id?: string; // undefined = CREATE, string = UPDATE
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
  image_url?: string | null;
}

export interface ProductUpsertResponse {
  success: boolean;
  product_id?: string;
  action?: 'created' | 'updated';
  code?: string;
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
  code?: string;
  error?: string;
}

// ─── Previsibilidade de Estoque & Reposição (RPC get_stock_forecasting) ─────

export type ForecastUrgency =
  | 'ESGOTADO'
  | 'CRITICO'
  | 'ALERTA'
  | 'ATENCAO'
  | 'ESTAVEL'
  | 'SEM_CONSUMO';

export interface StockForecastItem {
  product_id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  current_stock: number;
  min_stock_alert: number;
  total_outflow: number;
  avg_daily_consumption: number;
  days_until_stockout: number | null;
  urgency: ForecastUrgency;
  projected_stockout_date: string | null;
  suggested_reorder_qty: number;
  recommendation_text: string;
  needs_reorder: boolean;
}

export interface StockForecastingSummary {
  total_products: number;
  exhausted_count: number;
  critical_count: number;
  alert_count: number;
  total_reorder_items: number;
}

export interface StockForecastingResponse {
  success: boolean;
  window_days?: number;
  summary?: StockForecastingSummary;
  items?: StockForecastItem[];
  code?: string;
  error?: string;
}

// ─── Previsibilidade de Reposição para o Restaurante ────────────────────────

export type RestaurantRecommendationUrgency = 'URGENTE' | 'RECOMENDADO' | 'ROTINA';

export interface RestaurantRecommendationItem {
  product_id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  available_stock: number;
  avg_daily_consumption: number;
  last_ordered_at: string | null;
  days_since_last_order: number | null;
  recommended_order_qty: number;
  urgency: RestaurantRecommendationUrgency;
  recommendation_reason: string;
}

export interface RestaurantRecommendationsSummary {
  total_recommended: number;
  urgent_count: number;
  total_suggested_units: number;
}

export interface RestaurantRecommendationsResponse {
  success: boolean;
  restaurant_id?: string;
  summary?: RestaurantRecommendationsSummary;
  items?: RestaurantRecommendationItem[];
  code?: string;
  error?: string;
}

// ─── Estoque da Cozinha (business-rules seção 5.A) ──────────────────────────

/** Tipos de `kitchen_movements.type`. Entradas têm quantidade positiva; saídas, negativa. */
export type KitchenMovementType =
  | 'CONTAGEM_INICIAL'
  | 'ENTRADA_ENTREGA'
  | 'PERDA'
  | 'CONSUMO_APURADO'
  | 'AJUSTE_POSITIVO';

/** Motivos fixos de perda; `Outro` exige descrição livre. */
export type KitchenLossReason =
  | 'Vencido'
  | 'Estragado / deteriorado'
  | 'Erro de preparo'
  | 'Avaria no armazenamento'
  | 'Outro';

/** Códigos de erro das RPCs da cozinha e da conferência detalhada. */
export type KitchenErrorCode =
  | 'KITCHEN_NOT_INITIALIZED'
  | 'ALREADY_INITIALIZED'
  | 'EMPTY_COUNT'
  | 'INVALID_PAYLOAD'
  | 'DUPLICATE_PRODUCT'
  | 'PRODUCT_NOT_FOUND'
  | 'INVALID_QUANTITY'
  | 'REASON_REQUIRED'
  | 'INSUFFICIENT_KITCHEN_STOCK'
  | 'MISSING_ITEMS_REQUIRED'
  | 'ITEM_NOT_FOUND';

/** Linha de `kitchen_stock` já unida ao catálogo, como devolvida por `get_kitchen_stock`. */
export interface KitchenStockItem {
  product_id: string;
  name: string;
  category: ProductCategory;
  unit: string;
  image_url: string | null;
  /** Saldo atual na cozinha; 0 quando o insumo ainda não tem linha. */
  quantity: number;
  last_counted_at: string | null;
  /** Média de CONSUMO_APURADO dos últimos 7 dias (ou desde a contagem inicial). */
  avg_daily_consumption: number;
}

export interface KitchenCount {
  id: string;
  restaurant_id: string;
  counted_by: string | null;
  is_initial: boolean;
  items_counted: number;
  created_at: string;
}

export interface KitchenMovement {
  id: string;
  restaurant_id: string;
  product_id: string;
  type: KitchenMovementType;
  quantity: number;
  reason: string | null;
  order_id: string | null;
  count_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface KitchenStockResponse {
  success: boolean;
  initialized?: boolean;
  initial_count_at?: string | null;
  last_count_at?: string | null;
  /** Se já houve contagem hoje, no fuso America/Sao_Paulo. */
  counted_today?: boolean;
  items?: KitchenStockItem[];
  code?: KitchenErrorCode | RpcAuthErrorCode | string;
  error?: string;
}

export interface KitchenCountItemPayload {
  product_id: string;
  counted_qty: number;
}

export interface SubmitKitchenCountPayload {
  restaurantId: string;
  /** Só os insumos contados; os demais mantêm o saldo. */
  items: KitchenCountItemPayload[];
  isInitial: boolean;
}

export interface SubmitKitchenCountResponse {
  success: boolean;
  count_id?: string;
  consumed_total?: number;
  adjusted_items?: number;
  items_counted?: number;
  code?: KitchenErrorCode | RpcAuthErrorCode | string;
  error?: string;
}

export interface RegisterKitchenLossPayload {
  restaurantId: string;
  productId: string;
  quantity: number;
  /** Texto final gravado: o motivo fixo, ou `Outro: <descrição>`. */
  reason: string;
}

export interface RegisterKitchenLossResponse {
  success: boolean;
  product_id?: string;
  new_quantity?: number;
  available?: number;
  code?: KitchenErrorCode | RpcAuthErrorCode | string;
  error?: string;
}

/** Falta informada item a item na conferência `CONCLUIDO_PARCIAL`. */
export interface MissingItemInput {
  itemId: string;
  missingQty: number;
}

/** Formato enviado em `p_missing_items` de `transition_order_status`. */
export interface MissingItemPayload {
  item_id: string;
  missing_qty: number;
}


