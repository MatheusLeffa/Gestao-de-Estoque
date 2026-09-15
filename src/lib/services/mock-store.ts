// InsumoSync: In-Memory / LocalStorage Mock Store for Offline Demonstration
// Author: qa-devops-agent / backend-workflow-engine / frontend-engineer
// Enables running and fully testing the application without Supabase credentials.

import type {
  Product,
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
} from '@/types/database';

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
    }
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

    // Profile de consumo do restaurante
    const restaurantProfiles: Record<string, {
      avgDaily: number;
      lastDaysAgo: number;
      suggested: number;
      urgency: 'URGENTE' | 'RECOMENDADO' | 'ROTINA';
      reason: string;
    }> = {
      // Salmão Fresco: Estoque crítico no depósito central!
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03': {
        avgDaily: 1.5,
        lastDaysAgo: 3,
        suggested: 4.0,
        urgency: 'URGENTE',
        reason: 'Estoque baixo no Depósito Central (4 KG restantes). Peça com antecedência antes da ruptura!',
      },
      // Alface Americana: Entrega anterior parcial, insumo crítico
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b07': {
        avgDaily: 1.5,
        lastDaysAgo: 2,
        suggested: 3.0,
        urgency: 'URGENTE',
        reason: 'Última entrega foi parcial (faltaram unidades). Sugerido repor o estoque da cozinha agora.',
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
        lastDaysAgo: 1,
        suggested: 10.0,
        urgency: 'RECOMENDADO',
        reason: 'Consumo elevado no restaurante (prato chefe). Sugerido lote para 4 dias de operação.',
      },
      // Tomate Italiano: Consumo diário alto
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05': {
        avgDaily: 3.0,
        lastDaysAgo: 1,
        suggested: 15.0,
        urgency: 'RECOMENDADO',
        reason: 'Consumo diário frequente da cozinha para molhos e saladas.',
      },
      // Batata Asterix: Consumo alto
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08': {
        avgDaily: 4.0,
        lastDaysAgo: 2,
        suggested: 20.0,
        urgency: 'RECOMENDADO',
        reason: 'Acompanhamento de alta saída. Reposição recomendada para o turno.',
      },
      // Cebola Roxa: Rotina
      'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b06': {
        avgDaily: 1.0,
        lastDaysAgo: 3,
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

    const items: RestaurantRecommendationItem[] = [];

    for (const prod of activeProducts) {
      const profile = restaurantProfiles[prod.id];
      if (profile) {
        const cappedQty = Math.min(prod.current_stock, profile.suggested);
        if (cappedQty > 0) {
          items.push({
            product_id: prod.id,
            name: prod.name,
            category: prod.category,
            unit: prod.unit,
            available_stock: prod.current_stock,
            avg_daily_consumption: profile.avgDaily,
            last_ordered_at: new Date(Date.now() - profile.lastDaysAgo * 86400000).toISOString(),
            days_since_last_order: profile.lastDaysAgo,
            recommended_order_qty: cappedQty,
            urgency: profile.urgency,
            recommendation_reason: profile.reason,
          });
        }
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

  transitionOrderStatus(orderId: string, nextStatus: OrderStatus, reason?: string): TransitionOrderStatusResponse {
    this.init();
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { success: false, error: 'Pedido não encontrado' };

    const fromStatus = order.status;

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
