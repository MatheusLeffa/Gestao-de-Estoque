-- ==============================================================================
-- INSUMOSYNC — SCRIPT CONSOLIDADO DE SETUP COMPLETO DO BANCO DE DADOS
-- Projeto: sqncxfboizrudyetetxi (InsumoSync)
-- Autores: cloud-db-architect & qa-devops-agent
-- ==============================================================================

-- 1. EXTENSÕES & TABELAS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit TEXT NOT NULL,
    current_stock NUMERIC NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    min_stock_alert NUMERIC NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ABERTO',
    delay_reason TEXT,
    completion_type TEXT,
    notes TEXT,
    deposit_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    requested_qty NUMERIC NOT NULL CHECK (requested_qty > 0),
    approved_qty NUMERIC,
    delivered_qty NUMERIC,
    reduction_reason TEXT
);

CREATE TABLE IF NOT EXISTS order_status_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_status_logs_order_id ON order_status_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow public read access to restaurants" ON restaurants;
    CREATE POLICY "Allow public read access to restaurants" ON restaurants FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Allow public read access to products" ON products;
    CREATE POLICY "Allow public read access to products" ON products FOR SELECT USING (true);

    DROP POLICY IF EXISTS "Allow public manage products" ON products;
    CREATE POLICY "Allow public manage products" ON products FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage orders" ON orders;
    CREATE POLICY "Allow public manage orders" ON orders FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage order_items" ON order_items;
    CREATE POLICY "Allow public manage order_items" ON order_items FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage order_status_logs" ON order_status_logs;
    CREATE POLICY "Allow public manage order_status_logs" ON order_status_logs FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow public manage stock_movements" ON stock_movements;
    CREATE POLICY "Allow public manage stock_movements" ON stock_movements FOR ALL USING (true) WITH CHECK (true);
END $$;

-- SUPABASE REALTIME PUBLICATION
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'products'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE products;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'order_status_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_status_logs;
    END IF;
END $$;

-- ==============================================================================
-- 2. STORED PROCEDURES (RPCs COM ATOMICIDADE E SELECT FOR UPDATE)
-- ==============================================================================

-- 2.1 RPC: place_order_with_reservation
CREATE OR REPLACE FUNCTION place_order_with_reservation(
    p_restaurant_id UUID,
    p_items JSONB,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_product_id UUID;
    v_requested_qty NUMERIC;
    v_current_stock NUMERIC;
    v_product_name TEXT;
    v_order_id UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'RESTAURANT_NOT_FOUND',
            'error', 'Restaurante não encontrado no sistema.'
        );
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EMPTY_ORDER',
            'error', 'O pedido precisa conter pelo menos um insumo.'
        );
    END IF;

    -- Trava atômica em nível de linha nos insumos solicitados
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_requested_qty := (v_item->>'requested_qty')::NUMERIC;

        IF v_requested_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INVALID_QUANTITY',
                'error', 'Quantidade solicitada inválida para o insumo.'
            );
        END IF;

        SELECT current_stock, name INTO v_current_stock, v_product_name
        FROM products
        WHERE id = v_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'PRODUCT_NOT_FOUND',
                'error', 'Insumo não encontrado no catálogo.',
                'product_id', v_product_id
            );
        END IF;

        IF v_current_stock < v_requested_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'code', 'INSUFFICIENT_STOCK',
                'error', format('Estoque insuficiente para "%s". Disponível: %s, Solicitado: %s', v_product_name, v_current_stock, v_requested_qty),
                'product_id', v_product_id,
                'product_name', v_product_name,
                'available_stock', v_current_stock,
                'requested_qty', v_requested_qty
            );
        END IF;
    END LOOP;

    -- Debitar estoque
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_requested_qty := (v_item->>'requested_qty')::NUMERIC;

        UPDATE products
        SET current_stock = current_stock - v_requested_qty
        WHERE id = v_product_id;
    END LOOP;

    -- Criar Pedido
    INSERT INTO orders (restaurant_id, status, notes, created_at, updated_at)
    VALUES (p_restaurant_id, 'ABERTO', p_notes, now(), now())
    RETURNING id INTO v_order_id;

    -- Criar Itens e Movimentações
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_requested_qty := (v_item->>'requested_qty')::NUMERIC;

        INSERT INTO order_items (order_id, product_id, requested_qty, approved_qty)
        VALUES (v_order_id, v_product_id, v_requested_qty, v_requested_qty);

        INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
        VALUES (v_product_id, 'SAIDA_PEDIDO', -v_requested_qty, format('Reserva do pedido %s', v_order_id), now());
    END LOOP;

    -- Registrar Log Inicial de Auditoria
    INSERT INTO order_status_logs (order_id, from_status, to_status, reason, created_at)
    VALUES (v_order_id, NULL, 'ABERTO', 'Criação do pedido com reserva atômica de estoque', now());

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'message', 'Pedido criado e saldo reservado com sucesso.'
    );
END;
$$;


-- 2.2 RPC: transition_order_status
CREATE OR REPLACE FUNCTION transition_order_status(
    p_order_id UUID,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL,
    p_completion_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_status TEXT;
    v_restaurant_id UUID;
    v_item RECORD;
BEGIN
    SELECT status, restaurant_id INTO v_current_status, v_restaurant_id
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ORDER_NOT_FOUND',
            'error', 'Pedido não encontrado.'
        );
    END IF;

    IF v_current_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TERMINAL_STATE',
            'error', format('Pedido já se encontra em estado final (%s).', v_current_status)
        );
    END IF;

    -- Se cancelar, estornar atomicamente o saldo
    IF p_new_status = 'CANCELADO' THEN
        FOR v_item IN SELECT product_id, requested_qty FROM order_items WHERE order_id = p_order_id
        LOOP
            UPDATE products
            SET current_stock = current_stock + v_item.requested_qty
            WHERE id = v_item.product_id;

            INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
            VALUES (v_item.product_id, 'ESTORNO_CANCELAMENTO', v_item.requested_qty, format('Estorno do pedido cancelado %s', p_order_id), now());
        END LOOP;
    END IF;

    UPDATE orders
    SET status = p_new_status,
        delay_reason = CASE WHEN p_new_status = 'EM_ATRASO' THEN COALESCE(p_reason, delay_reason) ELSE delay_reason END,
        completion_type = COALESCE(p_completion_type, completion_type),
        updated_at = now()
    WHERE id = p_order_id;

    INSERT INTO order_status_logs (order_id, from_status, to_status, reason, created_at)
    VALUES (p_order_id, v_current_status, p_new_status, p_reason, now());

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'from_status', v_current_status,
        'to_status', p_new_status
    );
END;
$$;


-- 2.3 RPC: restock_product
CREATE OR REPLACE FUNCTION restock_product(
    p_product_id UUID,
    p_quantity NUMERIC,
    p_reason TEXT DEFAULT 'Entrada manual no depósito'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_stock NUMERIC;
    v_product_name TEXT;
BEGIN
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'INVALID_QUANTITY',
            'error', 'A quantidade de reabastecimento deve ser maior que zero.'
        );
    END IF;

    UPDATE products
    SET current_stock = current_stock + p_quantity
    WHERE id = p_product_id
    RETURNING current_stock, name INTO v_new_stock, v_product_name;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'PRODUCT_NOT_FOUND',
            'error', 'Insumo não encontrado.'
        );
    END IF;

    INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
    VALUES (p_product_id, 'ENTRADA_MANUAL', p_quantity, p_reason, now());

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'product_name', v_product_name,
        'added_quantity', p_quantity,
        'new_stock', v_new_stock
    );
END;
$$;


-- 2.4 RPC: get_stock_forecasting
CREATE OR REPLACE FUNCTION get_stock_forecasting(p_days_window INT DEFAULT 14)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_days            NUMERIC;
  v_start_time      TIMESTAMPTZ;
  v_today           DATE;
  v_tz              CONSTANT TEXT := 'America/Sao_Paulo';

  v_total_products  INT := 0;
  v_exhausted_count INT := 0;
  v_critical_count  INT := 0;
  v_alert_count     INT := 0;
  v_reorder_count   INT := 0;

  v_items           JSONB := '[]'::JSONB;
BEGIN
  v_days       := GREATEST(1, COALESCE(p_days_window, 14));
  v_start_time := now() - (v_days || ' days')::INTERVAL;
  v_today      := (now() AT TIME ZONE v_tz)::DATE;

  WITH product_outflows AS (
    SELECT
      p.id AS product_id,
      p.name,
      p.category,
      p.unit,
      p.current_stock,
      p.min_stock_alert,
      GREATEST(
        COALESCE((
          SELECT SUM(CASE 
            WHEN sm.type = 'SAIDA_PEDIDO' THEN -sm.quantity 
            WHEN sm.type = 'ESTORNO_CANCELAMENTO' THEN -sm.quantity 
            ELSE 0 END)
          FROM stock_movements sm
          WHERE sm.product_id = p.id 
            AND sm.created_at >= v_start_time
        ), 0),
        COALESCE((
          SELECT SUM(COALESCE(oi.delivered_qty, oi.approved_qty, oi.requested_qty))
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id
            AND o.status NOT IN ('CANCELADO')
            AND o.created_at >= v_start_time
        ), 0),
        0
      )::NUMERIC AS total_outflow
    FROM products p
    WHERE p.is_active = true
  ),
  product_calcs AS (
    SELECT
      po.product_id,
      po.name,
      po.category,
      po.unit,
      po.current_stock,
      po.min_stock_alert,
      po.total_outflow,
      ROUND(po.total_outflow / v_days, 2) AS avg_daily_consumption,
      CASE
        WHEN po.current_stock <= 0 THEN 0
        WHEN (po.total_outflow / v_days) > 0 THEN 
          ROUND(po.current_stock / (po.total_outflow / v_days), 1)
        ELSE NULL
      END AS days_until_stockout
    FROM product_outflows po
  ),
  product_forecast AS (
    SELECT
      pc.*,
      CASE
        WHEN pc.current_stock <= 0 THEN 'ESGOTADO'
        WHEN pc.days_until_stockout IS NOT NULL AND pc.days_until_stockout <= 2 THEN 'CRITICO'
        WHEN pc.current_stock <= pc.min_stock_alert AND pc.avg_daily_consumption > 0 THEN 'CRITICO'
        WHEN pc.days_until_stockout IS NOT NULL AND pc.days_until_stockout <= 5 THEN 'ALERTA'
        WHEN pc.current_stock <= pc.min_stock_alert THEN 'ALERTA'
        WHEN pc.days_until_stockout IS NOT NULL AND pc.days_until_stockout <= 10 THEN 'ATENCAO'
        WHEN pc.avg_daily_consumption > 0 THEN 'ESTAVEL'
        ELSE 'SEM_CONSUMO'
      END AS urgency,
      CASE
        WHEN pc.current_stock <= 0 THEN v_today
        WHEN pc.days_until_stockout IS NOT NULL THEN
          (v_today + (pc.days_until_stockout || ' days')::INTERVAL)::DATE
        ELSE NULL
      END AS projected_stockout_date,
      CASE
        WHEN pc.avg_daily_consumption > 0 THEN
          GREATEST(0, CEIL((pc.avg_daily_consumption * 14) + pc.min_stock_alert - pc.current_stock))::NUMERIC
        WHEN pc.current_stock < pc.min_stock_alert THEN
          GREATEST(0, CEIL((pc.min_stock_alert * 2) - pc.current_stock))::NUMERIC
        ELSE 0::NUMERIC
      END AS suggested_reorder_qty
    FROM product_calcs pc
  ),
  product_recommendations AS (
    SELECT
      pf.*,
      CASE
        WHEN pf.urgency = 'ESGOTADO' THEN
          format('Estoque esgotado! Solicitar %s %s imediatamente.', pf.suggested_reorder_qty, pf.unit)
        WHEN pf.urgency = 'CRITICO' THEN
          format('Crítico: esgota em ~%s dia(s). Solicitar %s %s com urgência.', 
                 COALESCE(pf.days_until_stockout::TEXT, '0'), pf.suggested_reorder_qty, pf.unit)
        WHEN pf.urgency = 'ALERTA' THEN
          format('Alerta: esgota em ~%s dia(s). Recomendado solicitar %s %s.', 
                 COALESCE(pf.days_until_stockout::TEXT, '0'), pf.suggested_reorder_qty, pf.unit)
        WHEN pf.urgency = 'ATENCAO' THEN
          format('Atenção: previsão de esgotamento em ~%s dia(s). Programar pedido de %s %s.', 
                 COALESCE(pf.days_until_stockout::TEXT, '0'), pf.suggested_reorder_qty, pf.unit)
        WHEN pf.suggested_reorder_qty > 0 THEN
          format('Sugerido reabastecimento de %s %s para manter nível de segurança.', 
                 pf.suggested_reorder_qty, pf.unit)
        ELSE
          format('Estoque estável com cobertura para mais de 10 dias (%s un/dia).', pf.avg_daily_consumption)
      END AS recommendation_text,
      (pf.suggested_reorder_qty > 0) AS needs_reorder,
      CASE pf.urgency
        WHEN 'ESGOTADO' THEN 1
        WHEN 'CRITICO'  THEN 2
        WHEN 'ALERTA'   THEN 3
        WHEN 'ATENCAO'  THEN 4
        WHEN 'ESTAVEL'  THEN 5
        ELSE 6
      END AS urgency_rank
    FROM product_forecast pf
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'product_id',              pr.product_id,
        'name',                    pr.name,
        'category',                pr.category,
        'unit',                    pr.unit,
        'current_stock',           pr.current_stock,
        'min_stock_alert',         pr.min_stock_alert,
        'total_outflow',           pr.total_outflow,
        'avg_daily_consumption',   pr.avg_daily_consumption,
        'days_until_stockout',     pr.days_until_stockout,
        'urgency',                 pr.urgency,
        'projected_stockout_date', CASE WHEN pr.projected_stockout_date IS NOT NULL THEN to_char(pr.projected_stockout_date, 'YYYY-MM-DD') ELSE NULL END,
        'suggested_reorder_qty',   pr.suggested_reorder_qty,
        'recommendation_text',     pr.recommendation_text,
        'needs_reorder',           pr.needs_reorder
      )
      ORDER BY pr.urgency_rank ASC, pr.days_until_stockout ASC NULLS LAST, pr.name ASC
    ), '[]'::JSONB),
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE pr.urgency = 'ESGOTADO')::INT,
    COUNT(*) FILTER (WHERE pr.urgency = 'CRITICO')::INT,
    COUNT(*) FILTER (WHERE pr.urgency = 'ALERTA')::INT,
    COUNT(*) FILTER (WHERE pr.needs_reorder)::INT
  INTO
    v_items,
    v_total_products,
    v_exhausted_count,
    v_critical_count,
    v_alert_count,
    v_reorder_count
  FROM product_recommendations pr;

  RETURN jsonb_build_object(
    'success',     true,
    'window_days', v_days,
    'summary', jsonb_build_object(
      'total_products',      v_total_products,
      'exhausted_count',     v_exhausted_count,
      'critical_count',      v_critical_count,
      'alert_count',         v_alert_count,
      'total_reorder_items', v_reorder_count
    ),
    'items',       v_items
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ------------------------------------------------------------------------------
-- RPC 12: get_restaurant_recommendations
-- Sugestões inteligentes de solicitação de insumos para a cozinha
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_restaurant_recommendations(
  p_restaurant_id UUID,
  p_days_window   INT DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days            NUMERIC;
  v_start_time      TIMESTAMPTZ;
  v_total_rec       INT := 0;
  v_urgent_count    INT := 0;
  v_total_units     NUMERIC := 0;
  v_items           JSONB := '[]'::JSONB;
BEGIN
  v_days       := GREATEST(1, COALESCE(p_days_window, 14));
  v_start_time := now() - (v_days || ' days')::INTERVAL;

  WITH restaurant_history AS (
    SELECT
      oi.product_id,
      COUNT(DISTINCT o.id)::INT AS order_count,
      SUM(COALESCE(oi.delivered_qty, oi.approved_qty, oi.requested_qty))::NUMERIC AS total_quantity,
      MAX(o.created_at) AS last_ordered_at
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.restaurant_id = p_restaurant_id
      AND o.status NOT IN ('CANCELADO')
      AND o.created_at >= v_start_time
    GROUP BY oi.product_id
  ),
  product_analytics AS (
    SELECT
      p.id AS product_id,
      p.name,
      p.category,
      p.unit,
      p.current_stock AS available_stock,
      p.min_stock_alert,
      COALESCE(rh.order_count, 0) AS order_count,
      COALESCE(rh.total_quantity, 0) AS total_quantity,
      rh.last_ordered_at,
      CASE
        WHEN rh.last_ordered_at IS NOT NULL THEN
          ROUND(EXTRACT(EPOCH FROM (now() - rh.last_ordered_at)) / 86400, 1)
        ELSE NULL
      END AS days_since_last_order,
      ROUND(COALESCE(rh.total_quantity, 0) / v_days, 2) AS avg_daily_consumption
    FROM products p
    LEFT JOIN restaurant_history rh ON rh.product_id = p.id
    WHERE p.is_active = true
      AND (rh.product_id IS NOT NULL OR p.current_stock <= p.min_stock_alert)
  ),
  recommendations AS (
    SELECT
      pa.*,
      CASE
        WHEN pa.avg_daily_consumption > 0 THEN
          GREATEST(1, CEIL(pa.avg_daily_consumption * 5))::NUMERIC
        ELSE
          GREATEST(1, CEIL(pa.min_stock_alert * 0.5))::NUMERIC
      END AS recommended_order_qty,
      CASE
        WHEN pa.available_stock <= pa.min_stock_alert AND pa.available_stock > 0 THEN 'URGENTE'
        WHEN pa.days_since_last_order IS NOT NULL AND pa.days_since_last_order >= 3 AND pa.order_count >= 1 THEN 'URGENTE'
        WHEN pa.order_count >= 1 THEN 'RECOMENDADO'
        ELSE 'ROTINA'
      END AS urgency,
      CASE
        WHEN pa.available_stock <= pa.min_stock_alert THEN
          'Insumo com estoque baixo no Depósito Central. Solicite com antecedência.'
        WHEN pa.days_since_last_order IS NOT NULL AND pa.days_since_last_order >= 4 THEN
          'Consumo frequente: último pedido há ' || pa.days_since_last_order || ' dias. Reposição sugerida.'
        ELSE
          'Item essencial de rotina para a cozinha.'
      END AS recommendation_reason
    FROM product_analytics pa
    WHERE pa.available_stock > 0
  )
  SELECT
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'product_id',              r.product_id,
        'name',                    r.name,
        'category',                r.category,
        'unit',                    r.unit,
        'available_stock',         r.available_stock,
        'avg_daily_consumption',   r.avg_daily_consumption,
        'last_ordered_at',         r.last_ordered_at,
        'days_since_last_order',   r.days_since_last_order,
        'recommended_order_qty',   LEAST(r.available_stock, r.recommended_order_qty),
        'urgency',                 r.urgency,
        'recommendation_reason',   r.recommendation_reason
      )
      ORDER BY
        CASE r.urgency
          WHEN 'URGENTE'     THEN 1
          WHEN 'RECOMENDADO' THEN 2
          ELSE 3
        END,
        r.days_since_last_order DESC NULLS LAST,
        r.name ASC
    ), '[]'::JSONB),
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE r.urgency = 'URGENTE')::INT,
    COALESCE(SUM(LEAST(r.available_stock, r.recommended_order_qty)), 0)::NUMERIC
  INTO
    v_items,
    v_total_rec,
    v_urgent_count,
    v_total_units
  FROM recommendations r;

  RETURN jsonb_build_object(
    'success',       true,
    'restaurant_id', p_restaurant_id,
    'summary', jsonb_build_object(
      'total_recommended',     v_total_rec,
      'urgent_count',          v_urgent_count,
      'total_suggested_units', v_total_units
    ),
    'items',         v_items
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ==============================================================================
-- 3. SEED DE DADOS REALISTAS DE DEMONSTRAÇÃO
-- ==============================================================================

-- Restaurante Modelo
INSERT INTO restaurants (id, name, address, is_active)
VALUES 
    ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Bistrô Paris 6 — Unidade Jardins', 'Rua Haddock Lobo, 1240 - Jardins, São Paulo - SP', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address;

-- Insumos (com itens críticos propositais para testar alerta de estoque baixo)
INSERT INTO products (id, name, category, unit, current_stock, min_stock_alert)
VALUES
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01', 'Filé Mignon Bovino (Peça Limpa)', 'Carnes & Aves', 'KG', 45.0, 15.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b02', 'Peito de Frango Desossado', 'Carnes & Aves', 'KG', 60.0, 20.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b03', 'Salmão Fresco em Filé', 'Carnes & Aves', 'KG', 4.0, 10.0), -- ⚠️ Estoque Baixo!
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b04', 'Camarão Rosa GG (Limpo)', 'Carnes & Aves', 'KG', 18.0, 8.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05', 'Tomate Italiano Selecionado', 'Hortifrúti', 'KG', 35.0, 12.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b06', 'Cebola Roxa Especial', 'Hortifrúti', 'KG', 25.0, 10.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b07', 'Alface Americana Orgânica', 'Hortifrúti', 'CX', 3.0, 5.0), -- ⚠️ Estoque Baixo!
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b08', 'Batata Asterix para Fritura', 'Hortifrúti', 'KG', 80.0, 25.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b09', 'Queijo Muçarela de Búfala', 'Laticínios', 'KG', 15.0, 6.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b10', 'Queijo Parmesão Grana Padano', 'Laticínios', 'KG', 8.0, 3.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b11', 'Manteiga Extra sem Sal', 'Laticínios', 'KG', 2.5, 5.0), -- ⚠️ Estoque Baixo!
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b12', 'Creme de Leite Fresco Pasteurizado', 'Laticínios', 'L', 30.0, 10.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b13', 'Azeite de Oliva Extra Virgem 0.2%', 'Mercearia & Temperos', 'L', 24.0, 8.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b14', 'Arroz Arbóreo Italiano para Risoto', 'Mercearia & Temperos', 'KG', 50.0, 15.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b15', 'Farinha de Trigo Italiana 00', 'Mercearia & Temperos', 'KG', 100.0, 30.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b16', 'Água Mineral San Pellegrino 500ml', 'Bebidas & Embalagens', 'CX', 12.0, 5.0),
    ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b17', 'Embalagem Kraft Delivery Box G', 'Bebidas & Embalagens', 'PCT', 20.0, 10.0)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    current_stock = EXCLUDED.current_stock,
    min_stock_alert = EXCLUDED.min_stock_alert;

-- Pedidos Iniciais para os Dashboards
INSERT INTO orders (id, restaurant_id, status, delay_reason, completion_type, notes, created_at, updated_at)
VALUES
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'ABERTO', NULL, NULL, 'Reposição urgente para o almoço de domingo', now() - interval '25 minutes', now() - interval '25 minutes'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'EM_TRANSITO', NULL, NULL, 'Pedido de hortifrúti da manhã', now() - interval '2 hours', now() - interval '45 minutes'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c03', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'CONCLUIDO_TOTAL', NULL, 'TOTAL', 'Pedido recebido com sucesso', now() - interval '1 day', now() - interval '22 hours'),
    ('c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c04', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'CONCLUIDO_PARCIAL', 'Transporte Indisponível', 'PARCIAL', 'Faltaram 2 caixas de alface devido a atraso no furgão', now() - interval '2 days', now() - interval '40 hours')
ON CONFLICT (id) DO NOTHING;

-- Itens do Pedido 1
INSERT INTO order_items (id, order_id, product_id, requested_qty, approved_qty)
VALUES
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b01', 10.0, 10.0),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380b05', 15.0, 15.0)
ON CONFLICT DO NOTHING;

-- Logs de Auditoria dos Pedidos Iniciais
INSERT INTO order_status_logs (id, order_id, from_status, to_status, reason, created_at)
VALUES
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01', NULL, 'ABERTO', 'Criação do pedido com reserva atômica de estoque', now() - interval '25 minutes'),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', NULL, 'ABERTO', 'Criação do pedido', now() - interval '2 hours'),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', 'ABERTO', 'EM_ANALISE', 'Separação iniciada no depósito', now() - interval '90 minutes'),
    (gen_random_uuid(), 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02', 'EM_ANALISE', 'EM_TRANSITO', 'Despachado com motorista Carlos', now() - interval '45 minutes')
ON CONFLICT DO NOTHING;
