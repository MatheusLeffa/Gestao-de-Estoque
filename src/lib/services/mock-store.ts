// InsumoSync: In-Memory / LocalStorage Mock Store for Offline Demonstration
// Author: qa-devops-agent / backend-workflow-engine / frontend-engineer
// Enables running and fully testing the application without Supabase credentials.

import type {
  Product,
  Restaurant,
  Order,
  OrderStatus,
  StockForecastItem,
  StockForecastingResponse,
  AdminAnalyticsResponse,
  PlaceOrderItemPayload,
  PlaceOrderResponse,
  RestockProductResponse,
  ProductUpsertPayload,
  ProductUpsertResponse,
  DeactivateProductResponse,
  ProductUsageResponse,
  DeleteProductResponse,
  TransitionOrderStatusResponse,
  OrderStatusLog,
  RestaurantRecommendationItem,
  RestaurantRecommendationsResponse,
  CompletionType,
  KitchenCount,
  KitchenMovement,
  KitchenMovementType,
  KitchenStockItem,
  KitchenStockResponse,
  KitchenCountItemPayload,
  SubmitKitchenCountResponse,
  RegisterKitchenLossResponse,
  MissingItemInput,
} from '@/types/database';

/** Saldo da cozinha por restaurante e insumo: `{ [restaurantId]: { [productId]: linha } }`. */
type MockKitchenStock = Record<string, Record<string, { quantity: number; lastCountedAt: string | null }>>;

const TERMINAL_STATUSES: OrderStatus[] = ['CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO'];

const COMPLETION_BY_STATUS: Partial<Record<OrderStatus, CompletionType>> = {
  CONCLUIDO_TOTAL: 'TOTAL',
  CONCLUIDO_PARCIAL: 'PARCIAL',
  CONCLUIDO_NAO_ENTREGUE: 'NAO_ENTREGUE',
};

/** Janela da média de consumo da cozinha, em dias (igual à RPC get_kitchen_stock). */
const KITCHEN_CONSUMPTION_WINDOW_DAYS = 7;

/** Evita resíduo de ponto flutuante (0.1 + 0.2) nos saldos simulados. */
function roundQty(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Data `YYYY-MM-DD` no fuso da operação, para saber se já houve contagem hoje. */
function saoPauloDay(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function readJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : fallback;
}

const SEED_PRODUCTS: Product[] = [
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01',
    name: 'Filé Mignon Bovino (Peça Limpa)',
    category: 'Carnes & Aves',
    unit: 'KG',
    current_stock: 45.0,
    min_stock_alert: 15.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02',
    name: 'Peito de Frango Desossado',
    category: 'Carnes & Aves',
    unit: 'KG',
    current_stock: 60.0,
    min_stock_alert: 20.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03',
    name: 'Salmão Fresco em Filé',
    category: 'Carnes & Aves',
    unit: 'KG',
    current_stock: 4.0,
    min_stock_alert: 10.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04',
    name: 'Camarão Rosa GG (Limpo)',
    category: 'Carnes & Aves',
    unit: 'KG',
    current_stock: 18.0,
    min_stock_alert: 8.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05',
    name: 'Tomate Italiano Selecionado',
    category: 'Hortifrúti',
    unit: 'KG',
    current_stock: 35.0,
    min_stock_alert: 12.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b06',
    name: 'Cebola Roxa Especial',
    category: 'Hortifrúti',
    unit: 'KG',
    current_stock: 25.0,
    min_stock_alert: 10.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b07',
    name: 'Alface Americana Orgânica',
    category: 'Hortifrúti',
    unit: 'CX',
    current_stock: 3.0,
    min_stock_alert: 5.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08',
    name: 'Batata Asterix para Fritura',
    category: 'Hortifrúti',
    unit: 'KG',
    current_stock: 80.0,
    min_stock_alert: 25.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b09',
    name: 'Queijo Muçarela de Búfala',
    category: 'Laticínios',
    unit: 'KG',
    current_stock: 15.0,
    min_stock_alert: 6.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b10',
    name: 'Queijo Parmesão Grana Padano',
    category: 'Laticínios',
    unit: 'KG',
    current_stock: 8.0,
    min_stock_alert: 3.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11',
    name: 'Manteiga Extra sem Sal',
    category: 'Laticínios',
    unit: 'KG',
    current_stock: 2.5,
    min_stock_alert: 5.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b12',
    name: 'Creme de Leite Fresco Pasteurizado',
    category: 'Laticínios',
    unit: 'L',
    current_stock: 30.0,
    min_stock_alert: 10.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b13',
    name: 'Azeite de Oliva Extra Virgem 0.2%',
    category: 'Mercearia & Temperos',
    unit: 'L',
    current_stock: 24.0,
    min_stock_alert: 8.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b14',
    name: 'Arroz Arbóreo Italiano para Risoto',
    category: 'Mercearia & Temperos',
    unit: 'KG',
    current_stock: 50.0,
    min_stock_alert: 15.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b15',
    name: 'Farinha de Trigo Italiana 00',
    category: 'Mercearia & Temperos',
    unit: 'KG',
    current_stock: 100.0,
    min_stock_alert: 30.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b16',
    name: 'Água Mineral San Pellegrino 500ml',
    category: 'Bebidas & Embalagens',
    unit: 'CX',
    current_stock: 12.0,
    min_stock_alert: 5.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b17',
    name: 'Embalagem Kraft Delivery Box G',
    category: 'Bebidas & Embalagens',
    unit: 'PCT',
    current_stock: 20.0,
    min_stock_alert: 10.0,
    is_active: true,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
];

const SEED_RESTAURANT: Restaurant = {
  id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Bistrô Paris 6 — Unidade Jardins',
  address: 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP',
  is_active: true,
  created_at: new Date().toISOString(),
};

const SEED_ORDERS: Order[] = [
  {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01',
    restaurant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    status: 'ABERTO',
    delay_reason: null,
    completion_type: null,
    notes: 'Reposição urgente para o almoço de domingo',
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 25 * 60000).toISOString(),
    restaurant: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Bistrô Paris 6 — Unidade Jardins',
      address: 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP',
      is_active: true,
      created_at: new Date().toISOString(),
    },
    order_items: [
      {
        id: 'oi-01',
        order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01',
        product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01',
        requested_qty: 10.0,
        approved_qty: 10.0,
        delivered_qty: null,
        product: SEED_PRODUCTS[0],
      },
      {
        id: 'oi-02',
        order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01',
        product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05',
        requested_qty: 15.0,
        approved_qty: 15.0,
        delivered_qty: null,
        product: SEED_PRODUCTS[4],
      },
    ],
  },
  {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02',
    restaurant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    status: 'EM_TRANSITO',
    delay_reason: null,
    completion_type: null,
    notes: 'Pedido de hortifrúti da manhã',
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
    updated_at: new Date(Date.now() - 45 * 60000).toISOString(),
    restaurant: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Bistrô Paris 6 — Unidade Jardins',
      address: 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP',
      is_active: true,
      created_at: new Date().toISOString(),
    },
    order_items: [
      {
        id: 'oi-03',
        order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02',
        product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b06',
        requested_qty: 8.0,
        approved_qty: 8.0,
        delivered_qty: null,
        product: SEED_PRODUCTS[5],
      },
      {
        id: 'oi-04',
        order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02',
        product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08',
        requested_qty: 20.0,
        approved_qty: 20.0,
        delivered_qty: null,
        product: SEED_PRODUCTS[7],
      },
    ],
  },
  {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c03',
    restaurant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    status: 'CONCLUIDO_TOTAL',
    delay_reason: null,
    completion_type: 'TOTAL',
    notes: 'Pedido recebido com sucesso',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    updated_at: new Date(Date.now() - 79200000).toISOString(),
    restaurant: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Bistrô Paris 6 — Unidade Jardins',
      address: 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP',
      is_active: true,
      created_at: new Date().toISOString(),
    },
    order_items: [
      {
        id: 'oi-05',
        order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c03',
        product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b13',
        requested_qty: 6.0,
        approved_qty: 6.0,
        delivered_qty: 6.0,
        product: SEED_PRODUCTS[12],
      },
    ],
  },
  {
    id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c04',
    restaurant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    status: 'CONCLUIDO_PARCIAL',
    delay_reason: 'Transporte Indisponível',
    completion_type: 'PARCIAL',
    notes: 'Faltaram 2 caixas de alface devido a atraso no furgão',
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 144000000).toISOString(),
    restaurant: {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Bistrô Paris 6 — Unidade Jardins',
      address: 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP',
      is_active: true,
      created_at: new Date().toISOString(),
    },
    order_items: [
      {
        id: 'oi-06',
        order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c04',
        product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b07',
        requested_qty: 4.0,
        approved_qty: 2.0,
        delivered_qty: 2.0,
        reduction_reason: 'Falta de estoque disponível',
        product: SEED_PRODUCTS[6],
      },
    ],
  },
];

const SEED_LOGS: OrderStatusLog[] = [
  {
    id: 'l-01',
    order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01',
    from_status: null,
    to_status: 'ABERTO',
    reason: 'Criação do pedido com reserva atômica de estoque',
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
  },
  {
    id: 'l-02',
    order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02',
    from_status: null,
    to_status: 'ABERTO',
    reason: 'Criação do pedido',
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
  },
  {
    id: 'l-03',
    order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02',
    from_status: 'ABERTO',
    to_status: 'EM_ANALISE',
    reason: 'Separação iniciada no depósito',
    created_at: new Date(Date.now() - 90 * 60000).toISOString(),
  },
  {
    id: 'l-04',
    order_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02',
    from_status: 'EM_ANALISE',
    to_status: 'EM_TRANSITO',
    reason: 'Despachado com motorista Carlos',
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
  },
];

class MockDataStore {
  private products: Product[] = [];
  private orders: Order[] = [];
  private logs: OrderStatusLog[] = [];
  private kitchenStock: MockKitchenStock = {};
  private kitchenCounts: KitchenCount[] = [];
  private kitchenMovements: KitchenMovement[] = [];
  private initialized = false;

  private init() {
    if (this.initialized) return;

    if (typeof window !== 'undefined') {
      const savedProducts = localStorage.getItem('insumosync_mock_products');
      const savedOrders = localStorage.getItem('insumosync_mock_orders');
      const savedLogs = localStorage.getItem('insumosync_mock_logs');

      this.products = savedProducts ? JSON.parse(savedProducts) : [...SEED_PRODUCTS];
      this.orders = savedOrders ? JSON.parse(savedOrders) : [...SEED_ORDERS];
      this.logs = savedLogs ? JSON.parse(savedLogs) : [...SEED_LOGS];
      this.kitchenStock = readJson<MockKitchenStock>('insumosync_mock_kitchen_stock', {});
      this.kitchenCounts = readJson<KitchenCount[]>('insumosync_mock_kitchen_counts', []);
      this.kitchenMovements = readJson<KitchenMovement[]>('insumosync_mock_kitchen_movements', []);
    } else {
      this.products = [...SEED_PRODUCTS];
      this.orders = [...SEED_ORDERS];
      this.logs = [...SEED_LOGS];
    }

    this.initialized = true;
  }

  private persist() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('insumosync_mock_products', JSON.stringify(this.products));
      localStorage.setItem('insumosync_mock_orders', JSON.stringify(this.orders));
      localStorage.setItem('insumosync_mock_logs', JSON.stringify(this.logs));
      localStorage.setItem('insumosync_mock_kitchen_stock', JSON.stringify(this.kitchenStock));
      localStorage.setItem('insumosync_mock_kitchen_counts', JSON.stringify(this.kitchenCounts));
      localStorage.setItem('insumosync_mock_kitchen_movements', JSON.stringify(this.kitchenMovements));
    }
  }

  // ─── Restaurante ────────────────────────────────────────────────────────────
  getRestaurant(): Restaurant {
    return SEED_RESTAURANT;
  }

  // ─── Produtos ───────────────────────────────────────────────────────────────
  getProducts(includeInactive = false): Product[] {
    this.init();
    return this.products.filter((p) => includeInactive || p.is_active);
  }

  getProductById(id: string): Product | null {
    this.init();
    return this.products.find((p) => p.id === id) ?? null;
  }

  restockProduct(productId: string, quantity: number, reason: string): RestockProductResponse {
    this.init();
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      return { success: false, error: 'Produto não encontrado' };
    }

    product.current_stock += quantity;
    this.persist();

    return {
      success: true,
      product_id: product.id,
      product_name: product.name,
      new_stock: product.current_stock,
      added_quantity: quantity,
    };
  }

  upsertProduct(payload: ProductUpsertPayload): ProductUpsertResponse {
    this.init();
    if (payload.id) {
      const index = this.products.findIndex((p) => p.id === payload.id);
      if (index === -1) {
        return { success: false, error: 'Produto não encontrado para edição' };
      }
      this.products[index] = {
        ...this.products[index],
        name: payload.name,
        category: payload.category,
        unit: payload.unit,
        min_stock_alert: payload.min_stock_alert,
        current_stock: payload.current_stock ?? this.products[index].current_stock,
        image_url: payload.image_url !== undefined ? (payload.image_url === '' ? null : payload.image_url) : this.products[index].image_url,
      };
      this.persist();
      return { success: true, product_id: payload.id, action: 'updated' };
    }

    const newId = 'prod-' + Date.now();
    const newProduct: Product = {
      id: newId,
      name: payload.name,
      category: payload.category,
      unit: payload.unit,
      min_stock_alert: payload.min_stock_alert,
      current_stock: payload.current_stock ?? 0,
      is_active: true,
      image_url: payload.image_url || null,
      created_at: new Date().toISOString(),
    };

    this.products.unshift(newProduct);
    this.persist();
    return { success: true, product_id: newId, action: 'created' };
  }

  deactivateProduct(id: string): DeactivateProductResponse {
    this.init();
    const product = this.products.find((p) => p.id === id);
    if (!product) return { success: false, error: 'Produto não encontrado' };

    product.is_active = false;
    this.persist();
    return { success: true, product_id: id };
  }

  deleteProduct(id: string): DeleteProductResponse {
    this.init();
    const index = this.products.findIndex((p) => p.id === id);
    if (index === -1) return { success: false, error: 'Produto não encontrado' };

    this.products.splice(index, 1);
    this.persist();
    return { success: true, product_id: id };
  }

  checkProductUsage(productId: string): ProductUsageResponse {
    this.init();
    let usageCount = 0;
    for (const order of this.orders) {
      if (order.order_items) {
        for (const item of order.order_items) {
          if (item.product_id === productId) usageCount++;
        }
      }
    }
    return {
      success: true,
      product_id: productId,
      open_order_count: usageCount,
      total_item_count: usageCount,
      can_hard_delete: usageCount === 0,
    };
  }

  // ─── Previsibilidade de Estoque ────────────────────────────────────────────
  getStockForecasting(daysWindow = 14): StockForecastingResponse {
    this.init();
    const activeProds = this.products.filter((p) => p.is_active);

    const simulatedOutflows: Record<string, number> = {
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01': 28.0, // Filé: 2.0 un/dia -> ~22 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02': 42.0, // Peito: 3.0 un/dia -> ~20 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03': 28.0, // Salmão: 2.0 un/dia -> saldo 4 -> 2 dias (CRITICO!)
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04': 14.0, // Camarão: 1.0 un/dia -> 18 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05': 35.0, // Tomate: 2.5 un/dia -> 14 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b06': 14.0, // Cebola: 1.0 un/dia -> 25 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b07': 21.0, // Alface: 1.5 un/dia -> saldo 3 -> 2 dias (CRITICO!)
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08': 42.0, // Batata: 3.0 un/dia -> ~26 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b09': 7.0,  // Muçarela: 0.5 un/dia -> 30 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b10': 3.5,  // Parmesão: 0.25 un/dia -> 32 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11': 14.0, // Manteiga: 1.0 un/dia -> saldo 2.5 -> 2.5 dias (ALERTA!)
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b12': 14.0, // Creme Leite: 1.0 un/dia -> 30 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b13': 7.0,  // Azeite: 0.5 un/dia -> 48 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b14': 21.0, // Arroz: 1.5 un/dia -> ~33 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b15': 35.0, // Farinha: 2.5 un/dia -> 40 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b16': 14.0, // San Pellegrino: 1.0 un/dia -> 12 dias
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b17': 21.0, // Embalagem Kraft: 1.5 un/dia -> ~13 dias
    };

    const items: StockForecastItem[] = activeProds.map((prod) => {
      const outflow = simulatedOutflows[prod.id] ?? 0;
      const avgDaily = Number((outflow / daysWindow).toFixed(2));
      let daysRemaining: number | null = null;
      if (prod.current_stock <= 0) {
        daysRemaining = 0;
      } else if (avgDaily > 0) {
        daysRemaining = Number((prod.current_stock / avgDaily).toFixed(1));
      }

      let urgency: StockForecastItem['urgency'] = 'SEM_CONSUMO';
      if (prod.current_stock <= 0) {
        urgency = 'ESGOTADO';
      } else if ((daysRemaining !== null && daysRemaining <= 2) || (prod.current_stock <= prod.min_stock_alert && avgDaily > 0)) {
        urgency = 'CRITICO';
      } else if ((daysRemaining !== null && daysRemaining <= 5) || prod.current_stock <= prod.min_stock_alert) {
        urgency = 'ALERTA';
      } else if (daysRemaining !== null && daysRemaining <= 10) {
        urgency = 'ATENCAO';
      } else if (avgDaily > 0) {
        urgency = 'ESTAVEL';
      }

      const projectedDate = daysRemaining !== null
        ? new Date(Date.now() + daysRemaining * 86400000).toISOString().split('T')[0]
        : null;

      const targetStock = (avgDaily * 14) + prod.min_stock_alert;
      const suggestedQty = Math.max(0, Math.ceil(targetStock - prod.current_stock));
      const needsReorder = suggestedQty > 0;

      let recText = 'Estoque equilibrado com boa margem de segurança.';
      if (urgency === 'ESGOTADO') {
        recText = `RUPTURA DE ESTOQUE: Solicitar ${suggestedQty} ${prod.unit} imediatamente.`;
      } else if (urgency === 'CRITICO') {
        recText = `URGÊNCIA MÁXIMA: Esgotamento projetado em ~${daysRemaining} dias. Reposição sugerida: ${suggestedQty} ${prod.unit}.`;
      } else if (urgency === 'ALERTA') {
        recText = `ALERTA DE SEGURANÇA: Abaixo da margem mínima. Solicitar ${suggestedQty} ${prod.unit}.`;
      } else if (urgency === 'ATENCAO') {
        recText = `PLANEJAR COMPRA: Cobertura de ${daysRemaining} dias. Recomendado pedir ${suggestedQty} ${prod.unit}.`;
      }

      return {
        product_id: prod.id,
        name: prod.name,
        category: prod.category,
        unit: prod.unit,
        current_stock: prod.current_stock,
        min_stock_alert: prod.min_stock_alert,
        total_outflow: outflow,
        avg_daily_consumption: avgDaily,
        days_until_stockout: daysRemaining,
        urgency,
        projected_stockout_date: projectedDate,
        suggested_reorder_qty: suggestedQty,
        recommendation_text: recText,
        needs_reorder: needsReorder,
      };
    });

    const rankOrder = { ESGOTADO: 1, CRITICO: 2, ALERTA: 3, ATENCAO: 4, ESTAVEL: 5, SEM_CONSUMO: 6 };
    items.sort((a, b) => {
      const rA = rankOrder[a.urgency];
      const rB = rankOrder[b.urgency];
      if (rA !== rB) return rA - rB;
      if (a.days_until_stockout !== null && b.days_until_stockout !== null) {
        return a.days_until_stockout - b.days_until_stockout;
      }
      return a.name.localeCompare(b.name);
    });

    return {
      success: true,
      window_days: daysWindow,
      summary: {
        total_products: items.length,
        exhausted_count: items.filter((i) => i.urgency === 'ESGOTADO').length,
        critical_count: items.filter((i) => i.urgency === 'CRITICO').length,
        alert_count: items.filter((i) => i.urgency === 'ALERTA').length,
        total_reorder_items: items.filter((i) => i.needs_reorder).length,
      },
      items,
    };
  }

  // ─── Previsibilidade de Reposição para o Restaurante ────────────────────────
  getRestaurantRecommendations(restaurantId: string, daysWindow = 14): RestaurantRecommendationsResponse {
    this.init();
    const activeProducts = this.products.filter((p) => p.is_active && p.current_stock > 0);

    // Profile base de consumo dos insumos principais do restaurante (usado quando ainda não há histórico de pedidos)
    const baselineProfiles: Record<string, {
      avgDaily: number;
      lastDaysAgo: number;
      suggested: number;
      urgency: 'URGENTE' | 'RECOMENDADO' | 'ROTINA';
      reason: string;
    }> = {
      // Salmão Fresco: Estoque crítico no depósito central!
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03': {
        avgDaily: 1.5,
        lastDaysAgo: 4,
        suggested: 4.0,
        urgency: 'URGENTE',
        reason: 'Estoque baixo no Depósito Central (4 KG restantes). Peça com antecedência antes da ruptura!',
      },
      // Alface Americana: Insumo crítico
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b07': {
        avgDaily: 1.5,
        lastDaysAgo: 4,
        suggested: 3.0,
        urgency: 'URGENTE',
        reason: 'Insumo essencial com poucas unidades no estoque central.',
      },
      // Manteiga Extra: Depósito baixo
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11': {
        avgDaily: 0.8,
        lastDaysAgo: 4,
        suggested: 2.5,
        urgency: 'URGENTE',
        reason: 'Insumo essencial com poucas unidades restantes no estoque central (2.5 KG).',
      },
      // Filé Mignon: Alto consumo do restaurante
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01': {
        avgDaily: 2.5,
        lastDaysAgo: 3,
        suggested: 10.0,
        urgency: 'RECOMENDADO',
        reason: 'Consumo elevado no restaurante (prato chefe). Sugerido lote para o ciclo de preparo.',
      },
      // Tomate Italiano: Consumo diário alto
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05': {
        avgDaily: 3.0,
        lastDaysAgo: 3,
        suggested: 15.0,
        urgency: 'RECOMENDADO',
        reason: 'Consumo diário frequente da cozinha para molhos e saladas.',
      },
      // Batata Asterix: Consumo alto
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08': {
        avgDaily: 4.0,
        lastDaysAgo: 3,
        suggested: 20.0,
        urgency: 'RECOMENDADO',
        reason: 'Acompanhamento de alta saída. Reposição recomendada para o turno.',
      },
      // Cebola Roxa: Rotina
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b06': {
        avgDaily: 1.0,
        lastDaysAgo: 4,
        suggested: 8.0,
        urgency: 'ROTINA',
        reason: 'Item de mercearia e rotina culinária.',
      },
      // Azeite Extra Virgem: Rotina
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b13': {
        avgDaily: 0.6,
        lastDaysAgo: 5,
        suggested: 6.0,
        urgency: 'ROTINA',
        reason: 'Último pedido há 5 dias. Insumo de base para finalização de pratos.',
      },
    };

    // 1. Mapear pedidos deste restaurante
    const pendingProductIds = new Set<string>();
    const productOrderHistory: Record<string, { latestOrderTime: number; latestStatus: string; totalQty: number; orderCount: number }> = {};

    const now = Date.now();
    const windowMs = daysWindow * 86400000;

    for (const order of this.orders) {
      if (restaurantId && order.restaurant_id !== restaurantId) continue;
      if (order.status === 'CANCELADO') continue;

      const isPending = ['ABERTO', 'EM_ANALISE', 'EM_ATRASO', 'EM_TRANSITO', 'CANCELAMENTO_PENDENTE'].includes(order.status);
      const orderTime = new Date(order.created_at).getTime();

      for (const item of order.order_items ?? []) {
        if (isPending) {
          pendingProductIds.add(item.product_id);
        } else if (orderTime >= now - windowMs) {
          const qty = item.delivered_qty ?? item.approved_qty ?? item.requested_qty ?? 0;
          const hist = productOrderHistory[item.product_id];
          if (!hist) {
            productOrderHistory[item.product_id] = {
              latestOrderTime: orderTime,
              latestStatus: order.status,
              totalQty: qty,
              orderCount: 1,
            };
          } else {
            hist.totalQty += qty;
            hist.orderCount += 1;
            if (orderTime > hist.latestOrderTime) {
              hist.latestOrderTime = orderTime;
              hist.latestStatus = order.status;
            }
          }
        }
      }
    }

    const items: RestaurantRecommendationItem[] = [];

    for (const prod of activeProducts) {
      // REGRA 1: Se o restaurante já possui um pedido em andamento (aberto, separação, trânsito),
      // o insumo é suprimido das sugestões pois a reposição já foi solicitada.
      if (pendingProductIds.has(prod.id)) {
        continue;
      }

      const history = productOrderHistory[prod.id];
      const baseProfile = baselineProfiles[prod.id];

      let daysSinceLastOrder: number | null = null;
      let lastOrderedAt: string | null = null;
      let avgDaily = 0;
      let suggestedQty = 0;
      let urgency: 'URGENTE' | 'RECOMENDADO' | 'ROTINA' = 'ROTINA';
      let reason = '';

      if (history) {
        daysSinceLastOrder = Number(((now - history.latestOrderTime) / 86400000).toFixed(1));
        lastOrderedAt = new Date(history.latestOrderTime).toISOString();
        avgDaily = Number((history.totalQty / daysWindow).toFixed(2));
        if (avgDaily <= 0 && baseProfile) {
          avgDaily = baseProfile.avgDaily;
        }

        // REGRA 2: Se o pedido foi concluído/entregue muito recentemente (< 2.0 dias),
        // o estoque da cozinha foi recém-abastecido. Não recomendar novamente hoje (exceto depósito crítico).
        if (daysSinceLastOrder < 2.0 && prod.current_stock > prod.min_stock_alert) {
          continue;
        }

        suggestedQty = Math.max(1, Math.ceil((avgDaily > 0 ? avgDaily : 1) * 5));

        if (prod.current_stock <= prod.min_stock_alert) {
          urgency = 'URGENTE';
          reason = `Estoque baixo no Depósito Central (${prod.current_stock} ${prod.unit} restantes). Peça com antecedência antes da ruptura!`;
        } else if (daysSinceLastOrder >= 4.0) {
          urgency = 'URGENTE';
          reason = `Último pedido há ${Math.round(daysSinceLastOrder)} dias. Consumo frequente, reposição recomendada.`;
        } else if (daysSinceLastOrder >= 2.0) {
          urgency = 'RECOMENDADO';
          reason = `Consumo regular da cozinha. Sugerido lote para o ciclo de preparo.`;
        } else {
          urgency = 'ROTINA';
          reason = `Item de rotina da cozinha. Reposição periódica.`;
        }
      } else if (baseProfile) {
        daysSinceLastOrder = baseProfile.lastDaysAgo;
        lastOrderedAt = new Date(now - baseProfile.lastDaysAgo * 86400000).toISOString();
        avgDaily = baseProfile.avgDaily;
        suggestedQty = baseProfile.suggested;
        urgency = baseProfile.urgency;
        reason = baseProfile.reason;
      } else if (prod.current_stock <= prod.min_stock_alert) {
        daysSinceLastOrder = null;
        lastOrderedAt = null;
        avgDaily = 0.5;
        suggestedQty = Math.max(1, Math.ceil(prod.min_stock_alert * 0.5));
        urgency = 'URGENTE';
        reason = `Estoque baixo no Depósito Central (${prod.current_stock} ${prod.unit}). Solicite antes que esgote.`;
      } else {
        continue;
      }

      const cappedQty = Math.min(prod.current_stock, suggestedQty);
      if (cappedQty > 0) {
        items.push({
          product_id: prod.id,
          name: prod.name,
          category: prod.category,
          unit: prod.unit,
          available_stock: prod.current_stock,
          avg_daily_consumption: avgDaily,
          last_ordered_at: lastOrderedAt,
          days_since_last_order: daysSinceLastOrder,
          recommended_order_qty: cappedQty,
          urgency,
          recommendation_reason: reason,
        });
      }
    }

    const urgencyRank = { URGENTE: 1, RECOMENDADO: 2, ROTINA: 3 };
    items.sort((a, b) => {
      const rA = urgencyRank[a.urgency];
      const rB = urgencyRank[b.urgency];
      if (rA !== rB) return rA - rB;
      return (b.days_since_last_order ?? 0) - (a.days_since_last_order ?? 0);
    });

    const urgentCount = items.filter((i) => i.urgency === 'URGENTE').length;
    const totalUnits = items.reduce((acc, i) => acc + i.recommended_order_qty, 0);

    return {
      success: true,
      restaurant_id: restaurantId,
      summary: {
        total_recommended: items.length,
        urgent_count: urgentCount,
        total_suggested_units: totalUnits,
      },
      items,
    };
  }

  // ─── Pedidos ───────────────────────────────────────────────────────────────
  getOrders(restaurantId?: string, status?: OrderStatus): Order[] {
    this.init();
    return this.orders.filter((o) => {
      if (restaurantId && o.restaurant_id !== restaurantId) return false;
      if (status && o.status !== status) return false;
      return true;
    });
  }

  getOrderById(orderId: string): Order | null {
    this.init();
    return this.orders.find((o) => o.id === orderId) ?? null;
  }

  getAuditLogs(orderId: string): OrderStatusLog[] {
    this.init();
    return this.logs.filter((l) => l.order_id === orderId);
  }

  placeOrder(params: { restaurantId: string; items: PlaceOrderItemPayload[]; notes?: string }): PlaceOrderResponse {
    this.init();

    // Check availability
    for (const item of params.items) {
      const prod = this.products.find((p) => p.id === item.product_id);
      if (!prod || prod.current_stock < item.requested_qty) {
        return {
          success: false,
          error: `Saldo insuficiente para ${prod?.name || 'produto'}. Disponível: ${prod?.current_stock || 0}`,
          available_stock: prod?.current_stock || 0,
          requested_qty: item.requested_qty,
        };
      }
    }

    // Deduct stock (atomic simulation)
    for (const item of params.items) {
      const prod = this.products.find((p) => p.id === item.product_id);
      if (prod) {
        prod.current_stock -= item.requested_qty;
      }
    }

    const orderId = 'ord-' + Date.now();
    const newOrder: Order = {
      id: orderId,
      restaurant_id: params.restaurantId,
      status: 'ABERTO',
      delay_reason: null,
      completion_type: null,
      notes: params.notes ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      restaurant: {
        id: params.restaurantId,
        name: 'Bistrô Paris 6 — Unidade Jardins',
        address: 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP',
        is_active: true,
        created_at: new Date().toISOString(),
      },
      order_items: params.items.map((it, idx) => {
        const prod = this.products.find((p) => p.id === it.product_id);
        return {
          id: `item-${Date.now()}-${idx}`,
          order_id: orderId,
          product_id: it.product_id,
          requested_qty: it.requested_qty,
          approved_qty: it.requested_qty,
          delivered_qty: null,
          product: prod,
        };
      }),
    };

    this.orders.unshift(newOrder);

    this.logs.unshift({
      id: 'log-' + Date.now(),
      order_id: orderId,
      from_status: null,
      to_status: 'ABERTO',
      reason: 'Criação do pedido com reserva simulada de estoque',
      created_at: new Date().toISOString(),
    });

    this.persist();
    return { success: true, order_id: orderId };
  }

  transitionOrderStatus(
    orderId: string,
    nextStatus: OrderStatus,
    reason?: string,
    missingItems?: MissingItemInput[]
  ): TransitionOrderStatusResponse {
    this.init();
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { success: false, code: 'ORDER_NOT_FOUND', error: 'Pedido não encontrado' };

    const fromStatus = order.status;
    if (TERMINAL_STATUSES.includes(fromStatus)) {
      return { success: false, code: 'TERMINAL_STATE', error: `Pedido já se encontra em estado final (${fromStatus}).` };
    }

    // Conferência: calcula delivered_qty antes de qualquer escrita (business-rules seção 5)
    const completionType = COMPLETION_BY_STATUS[nextStatus];
    const items = order.order_items ?? [];
    const delivered = new Map<string, number>();
    if (completionType) {
      const missing = new Map<string, number>();
      if (completionType === 'PARCIAL') {
        if (!missingItems || missingItems.length === 0) {
          return { success: false, code: 'MISSING_ITEMS_REQUIRED', error: 'Informe o que faltou em cada item da entrega parcial.' };
        }
        for (const m of missingItems) {
          const item = items.find((i) => i.id === m.itemId);
          if (!item) {
            return { success: false, code: 'ITEM_NOT_FOUND', error: 'Item informado não pertence a este pedido.' };
          }
          const sent = item.approved_qty ?? item.requested_qty;
          if (!Number.isFinite(m.missingQty) || m.missingQty < 0 || m.missingQty > sent) {
            return {
              success: false,
              code: 'INVALID_QUANTITY',
              error: `A falta de "${item.product?.name ?? 'insumo'}" deve estar entre 0 e ${sent}.`,
            };
          }
          missing.set(item.id, m.missingQty);
        }
        if (![...missing.values()].some((q) => q > 0)) {
          return { success: false, code: 'MISSING_ITEMS_REQUIRED', error: 'Nenhuma falta informada: use Entrega Total.' };
        }
      }
      for (const item of items) {
        const sent = item.approved_qty ?? item.requested_qty;
        delivered.set(item.id, completionType === 'NAO_ENTREGUE' ? 0 : roundQty(sent - (missing.get(item.id) ?? 0)));
      }
    }

    // Se for cancelamento, estorna o estoque aprovado
    if (nextStatus === 'CANCELADO' && fromStatus !== 'CANCELADO') {
      if (order.order_items) {
        for (const item of order.order_items) {
          const prod = this.products.find((p) => p.id === item.product_id);
          if (prod && item.approved_qty) {
            prod.current_stock += item.approved_qty;
          }
        }
      }
    }

    order.status = nextStatus;
    order.updated_at = new Date().toISOString();

    if (completionType) {
      order.completion_type = completionType;
      // Cozinha sem contagem inicial não é creditada (business-rules 5.A.2)
      const creditKitchen = this.isKitchenInitialized(order.restaurant_id);
      for (const item of items) {
        const qty = delivered.get(item.id) ?? 0;
        item.delivered_qty = qty;
        if (creditKitchen && qty > 0) {
          this.applyKitchenMovement(order.restaurant_id, item.product_id, 'ENTRADA_ENTREGA', qty, {
            orderId: order.id,
            reason: `Entrega do pedido #${order.id.slice(0, 8).toUpperCase()}`,
          });
        }
      }
    }

    this.logs.unshift({
      id: 'log-' + Date.now(),
      order_id: orderId,
      from_status: fromStatus,
      to_status: nextStatus,
      reason: reason || 'Atualização de status',
      created_at: new Date().toISOString(),
    });

    this.persist();
    return { success: true, order_id: orderId, from_status: fromStatus, to_status: nextStatus };
  }

  // ─── Estoque da Cozinha (espelho das RPCs da seção 5.A) ──────────────────
  private isKitchenInitialized(restaurantId: string): boolean {
    return this.kitchenCounts.some((c) => c.restaurant_id === restaurantId && c.is_initial);
  }

  /** Única porta de escrita do saldo simulado: altera a linha e grava o ledger. */
  private applyKitchenMovement(
    restaurantId: string,
    productId: string,
    type: KitchenMovementType,
    delta: number,
    meta: { orderId?: string; countId?: string; reason?: string; countedAt?: string } = {}
  ) {
    const rows = (this.kitchenStock[restaurantId] ??= {});
    const row = (rows[productId] ??= { quantity: 0, lastCountedAt: null });
    row.quantity = Math.max(0, roundQty(row.quantity + delta));
    if (meta.countedAt) row.lastCountedAt = meta.countedAt;

    this.kitchenMovements.unshift({
      id: `km-${Date.now()}-${this.kitchenMovements.length}`,
      restaurant_id: restaurantId,
      product_id: productId,
      type,
      quantity: roundQty(delta),
      reason: meta.reason ?? null,
      order_id: meta.orderId ?? null,
      count_id: meta.countId ?? null,
      created_by: null,
      created_at: new Date().toISOString(),
    });
  }

  getKitchenStock(restaurantId: string): KitchenStockResponse {
    this.init();
    const rows = this.kitchenStock[restaurantId] ?? {};
    const counts = this.kitchenCounts.filter((c) => c.restaurant_id === restaurantId);
    const initial = counts.find((c) => c.is_initial) ?? null;
    const lastCount = counts.reduce<KitchenCount | null>(
      (latest, c) => (!latest || c.created_at > latest.created_at ? c : latest),
      null
    );

    // Média de consumo: CONSUMO_APURADO dos últimos 7 dias ÷ dias decorridos (máx. 7)
    const now = Date.now();
    const windowStart = now - KITCHEN_CONSUMPTION_WINDOW_DAYS * 86400000;
    const elapsedDays = initial
      ? Math.max(1, Math.min(KITCHEN_CONSUMPTION_WINDOW_DAYS, (now - new Date(initial.created_at).getTime()) / 86400000))
      : 1;
    const consumed: Record<string, number> = {};
    for (const m of this.kitchenMovements) {
      if (m.restaurant_id !== restaurantId || m.type !== 'CONSUMO_APURADO') continue;
      if (new Date(m.created_at).getTime() < windowStart) continue;
      consumed[m.product_id] = (consumed[m.product_id] ?? 0) + Math.abs(m.quantity);
    }

    const items: KitchenStockItem[] = this.products
      .filter((p) => p.is_active || (rows[p.id]?.quantity ?? 0) > 0)
      .map((p) => ({
        product_id: p.id,
        name: p.name,
        category: p.category,
        unit: p.unit,
        image_url: p.image_url ?? null,
        quantity: rows[p.id]?.quantity ?? 0,
        last_counted_at: rows[p.id]?.lastCountedAt ?? null,
        avg_daily_consumption: initial ? Number(((consumed[p.id] ?? 0) / elapsedDays).toFixed(2)) : 0,
      }))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

    return {
      success: true,
      initialized: !!initial,
      initial_count_at: initial?.created_at ?? null,
      last_count_at: lastCount?.created_at ?? null,
      counted_today: !!lastCount && saoPauloDay(new Date(lastCount.created_at)) === saoPauloDay(new Date()),
      items,
    };
  }

  submitKitchenCount(
    restaurantId: string,
    items: KitchenCountItemPayload[],
    isInitial: boolean
  ): SubmitKitchenCountResponse {
    this.init();
    const initialized = this.isKitchenInitialized(restaurantId);

    if (isInitial && initialized) {
      return { success: false, code: 'ALREADY_INITIALIZED', error: 'A contagem inicial desta cozinha já foi feita.' };
    }
    if (!isInitial && !initialized) {
      return { success: false, code: 'KITCHEN_NOT_INITIALIZED', error: 'Faça a contagem inicial da cozinha antes.' };
    }
    if (!isInitial && items.length === 0) {
      return { success: false, code: 'EMPTY_COUNT', error: 'Informe o saldo de pelo menos um insumo.' };
    }

    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.product_id)) {
        return { success: false, code: 'DUPLICATE_PRODUCT', error: 'Insumo repetido na contagem.' };
      }
      seen.add(it.product_id);
      if (!this.products.some((p) => p.id === it.product_id)) {
        return { success: false, code: 'PRODUCT_NOT_FOUND', error: 'Insumo não encontrado no catálogo.' };
      }
      if (!Number.isFinite(it.counted_qty) || it.counted_qty < 0) {
        return { success: false, code: 'INVALID_QUANTITY', error: 'A quantidade contada não pode ser negativa.' };
      }
    }

    const countedAt = new Date().toISOString();
    const countId = `kc-${Date.now()}`;
    this.kitchenCounts.unshift({
      id: countId,
      restaurant_id: restaurantId,
      counted_by: null,
      is_initial: isInitial,
      items_counted: items.length,
      created_at: countedAt,
    });

    let consumedTotal = 0;
    let adjustedItems = 0;

    if (isInitial) {
      // Insumos não contados começam com saldo 0, sem movimento (5.A.2)
      const rows = (this.kitchenStock[restaurantId] = {} as MockKitchenStock[string]);
      for (const p of this.products.filter((prod) => prod.is_active)) {
        rows[p.id] = { quantity: 0, lastCountedAt: null };
      }
      for (const it of items) {
        this.applyKitchenMovement(restaurantId, it.product_id, 'CONTAGEM_INICIAL', it.counted_qty, {
          countId,
          countedAt,
        });
      }
    } else {
      const rows = (this.kitchenStock[restaurantId] ??= {});
      for (const it of items) {
        const expected = rows[it.product_id]?.quantity ?? 0;
        const diff = roundQty(expected - it.counted_qty);
        if (diff > 0) {
          consumedTotal += diff;
          this.applyKitchenMovement(restaurantId, it.product_id, 'CONSUMO_APURADO', -diff, { countId, countedAt });
        } else if (diff < 0) {
          adjustedItems += 1;
          this.applyKitchenMovement(restaurantId, it.product_id, 'AJUSTE_POSITIVO', -diff, {
            countId,
            countedAt,
            reason: 'Contado acima do saldo esperado',
          });
        } else {
          (rows[it.product_id] ??= { quantity: 0, lastCountedAt: null }).lastCountedAt = countedAt;
        }
      }
    }

    this.persist();
    return {
      success: true,
      count_id: countId,
      consumed_total: roundQty(consumedTotal),
      adjusted_items: adjustedItems,
      items_counted: items.length,
    };
  }

  registerKitchenLoss(
    restaurantId: string,
    productId: string,
    quantity: number,
    reason: string
  ): RegisterKitchenLossResponse {
    this.init();
    if (!this.isKitchenInitialized(restaurantId)) {
      return { success: false, code: 'KITCHEN_NOT_INITIALIZED', error: 'Faça a contagem inicial da cozinha antes.' };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { success: false, code: 'INVALID_QUANTITY', error: 'A quantidade perdida deve ser maior que zero.' };
    }
    if (!reason.trim()) {
      return { success: false, code: 'REASON_REQUIRED', error: 'Informe o motivo da perda.' };
    }
    if (!this.products.some((p) => p.id === productId)) {
      return { success: false, code: 'PRODUCT_NOT_FOUND', error: 'Insumo não encontrado no catálogo.' };
    }

    const available = this.kitchenStock[restaurantId]?.[productId]?.quantity ?? 0;
    if (quantity > available) {
      return {
        success: false,
        code: 'INSUFFICIENT_KITCHEN_STOCK',
        available,
        error: `A perda (${quantity}) é maior que o saldo da cozinha (${available}).`,
      };
    }

    this.applyKitchenMovement(restaurantId, productId, 'PERDA', -quantity, { reason: reason.trim() });
    this.persist();
    return { success: true, product_id: productId, new_quantity: this.kitchenStock[restaurantId][productId].quantity };
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────
  getAdminAnalytics(): AdminAnalyticsResponse {
    this.init();

    return {
      success: true,
      kpis: {
        total_orders: 24,
        delivered_base: 18,
        on_time_count: 15,
        delayed_count: 3,
        on_time_rate: 83.3,
        cancelled_count: 2,
        in_progress_count: 4,
        critical_items: this.products.filter((p) => p.current_stock <= p.min_stock_alert).length,
        active_products: this.products.filter((p) => p.is_active).length,
      },
      delay_reasons: [
        { reason: 'Transporte Indisponível', count: 2 },
        { reason: 'Atraso de Fornecedor', count: 1 },
      ],
      outcomes: [
        { status: 'CONCLUIDO_TOTAL', count: 14 },
        { status: 'CONCLUIDO_PARCIAL', count: 3 },
        { status: 'CONCLUIDO_NAO_ENTREGUE', count: 1 },
      ],
      consumption: [
        {
          product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08',
          name: 'Batata Asterix para Fritura',
          unit: 'KG',
          total: 80,
        },
        {
          product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01',
          name: 'Filé Mignon Bovino (Peça Limpa)',
          unit: 'KG',
          total: 45,
        },
        {
          product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b15',
          name: 'Farinha de Trigo Italiana 00',
          unit: 'KG',
          total: 40,
        },
        {
          product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05',
          name: 'Tomate Italiano Selecionado',
          unit: 'KG',
          total: 35,
        },
        {
          product_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03',
          name: 'Salmão Fresco em Filé',
          unit: 'KG',
          total: 28,
        },
      ],
      orders_timeline: [
        { day: '2026-09-01', created: 3, completed: 3 },
        { day: '2026-09-03', created: 2, completed: 2 },
        { day: '2026-09-05', created: 4, completed: 4 },
        { day: '2026-09-07', created: 3, completed: 3 },
        { day: '2026-09-09', created: 5, completed: 4 },
        { day: '2026-09-11', created: 4, completed: 4 },
        { day: '2026-09-13', created: 3, completed: 2 },
      ],
    };
  }
}

export const mockStore = new MockDataStore();
