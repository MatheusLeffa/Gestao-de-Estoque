-- ==============================================================================
-- InsumoSync — BASELINE DO SCHEMA
-- Gerado em 2026-09-29 a partir do catálogo do banco em produção (pg_get_functiondef,
-- pg_get_constraintdef, pg_get_indexdef, pg_policies, pg_publication_tables).
--
-- Substitui as migrations incrementais anteriores (movidas para supabase/legacy/),
-- que tinham divergido do banco real: 8 das 12 funções não batiam.
-- Aplicar este arquivo num projeto vazio reproduz o schema public atual. Depois,
-- rode supabase/seed.sql para os dados de demonstração.
-- ==============================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- 2. TABELAS
CREATE TABLE public.restaurants (
    id         UUID        NOT NULL DEFAULT gen_random_uuid(),
    name       TEXT        NOT NULL,
    address    TEXT,
    is_active  BOOLEAN     NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT restaurants_pkey PRIMARY KEY (id)
);

CREATE TABLE public.products (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    category        TEXT        NOT NULL,
    unit            TEXT        NOT NULL,
    current_stock   NUMERIC     NOT NULL DEFAULT 0,
    min_stock_alert NUMERIC     NOT NULL DEFAULT 5,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    CONSTRAINT products_pkey PRIMARY KEY (id),
    CONSTRAINT products_current_stock_check CHECK ((current_stock >= (0)::numeric))
);

CREATE TABLE public.orders (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    restaurant_id   UUID        NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'ABERTO'::text,
    delay_reason    TEXT,
    completion_type TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deposit_notes   TEXT,
    CONSTRAINT orders_pkey PRIMARY KEY (id),
    CONSTRAINT orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE
);

CREATE TABLE public.order_items (
    id               UUID    NOT NULL DEFAULT gen_random_uuid(),
    order_id         UUID    NOT NULL,
    product_id       UUID    NOT NULL,
    requested_qty    NUMERIC NOT NULL,
    approved_qty     NUMERIC,
    delivered_qty    NUMERIC,
    reduction_reason TEXT,
    CONSTRAINT order_items_pkey PRIMARY KEY (id),
    CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
    CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
    CONSTRAINT order_items_requested_qty_check CHECK ((requested_qty > (0)::numeric))
);

CREATE TABLE public.order_status_logs (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    order_id    UUID        NOT NULL,
    from_status TEXT,
    to_status   TEXT        NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT order_status_logs_pkey PRIMARY KEY (id),
    CONSTRAINT order_status_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

CREATE TABLE public.stock_movements (
    id         UUID        NOT NULL DEFAULT gen_random_uuid(),
    product_id UUID        NOT NULL,
    type       TEXT        NOT NULL,
    quantity   NUMERIC     NOT NULL,
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_pkey PRIMARY KEY (id),
    CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE
);

-- 3. ÍNDICES
CREATE INDEX idx_order_items_order_id ON public.order_items USING btree (order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items USING btree (product_id);
CREATE INDEX idx_order_status_logs_order_id ON public.order_status_logs USING btree (order_id);
CREATE INDEX idx_orders_restaurant_id ON public.orders USING btree (restaurant_id);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);
CREATE INDEX idx_products_category ON public.products USING btree (category);
CREATE INDEX idx_products_is_active ON public.products USING btree (is_active);
CREATE INDEX idx_stock_movements_product_id ON public.stock_movements USING btree (product_id);

-- 4. ROW LEVEL SECURITY (permissiva no MVP: não há autenticação, só o DemoSwitcher)
ALTER TABLE public.restaurants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to restaurants" ON public.restaurants AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow public read access to products" ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow public manage products" ON public.products AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public manage orders" ON public.orders AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public manage order_items" ON public.order_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public manage order_status_logs" ON public.order_status_logs AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow public manage stock_movements" ON public.stock_movements AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_logs;

-- 6. FUNÇÕES RPC (ordem alfabética; transition_order_status é chamada por
--    deactivate_product em tempo de execução, então a ordem de criação não importa)

CREATE OR REPLACE FUNCTION public.apply_order_triage(p_order_id uuid, p_items jsonb, p_deposit_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status   TEXT;
  v_item     JSONB;
  v_item_id  UUID;
  v_new_qty  NUMERIC;
  v_reason   TEXT;
  v_rec      RECORD;
  v_delta    NUMERIC;
  v_returned NUMERIC := 0;
  v_code     TEXT;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Pedido não encontrado.');
  END IF;

  IF v_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO') THEN
    RETURN jsonb_build_object('success', false, 'code', 'TERMINAL_STATE',
      'error', format('Pedido já está em estado final (%s); a triagem não pode ser alterada.', v_status));
  END IF;

  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id = p_order_id)
  ORDER BY id FOR UPDATE;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_new_qty := (v_item->>'approved_qty')::NUMERIC;
    v_reason  := NULLIF(btrim(COALESCE(v_item->>'reduction_reason', '')), '');

    SELECT oi.requested_qty AS requested_qty,
           COALESCE(oi.approved_qty, oi.requested_qty) AS held,
           p.name AS product_name,
           p.current_stock AS current_stock
      INTO v_rec
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.id = v_item_id AND oi.order_id = p_order_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'ITEM_NOT_FOUND',
        'error', 'Um dos itens informados não pertence a este pedido.');
    END IF;

    IF v_new_qty IS NULL OR v_new_qty < 0 OR v_new_qty > v_rec.requested_qty THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY',
        'error', format('Quantidade aprovada inválida para "%s". Permitido de 0 a %s.', v_rec.product_name, v_rec.requested_qty),
        'product_name', v_rec.product_name);
    END IF;

    IF v_new_qty < v_rec.requested_qty AND v_reason IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED',
        'error', format('Justificativa individual obrigatória para a redução do item "%s".', v_rec.product_name),
        'product_name', v_rec.product_name);
    END IF;

    IF v_new_qty > v_rec.held AND v_rec.current_stock < (v_new_qty - v_rec.held) THEN
      RETURN jsonb_build_object('success', false, 'code', 'INSUFFICIENT_STOCK',
        'error', format('Saldo insuficiente para ampliar "%s". Disponível: %s.', v_rec.product_name, v_rec.current_stock),
        'product_name', v_rec.product_name, 'available_stock', v_rec.current_stock);
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_new_qty := (v_item->>'approved_qty')::NUMERIC;
    v_reason  := NULLIF(btrim(COALESCE(v_item->>'reduction_reason', '')), '');

    SELECT oi.product_id AS product_id,
           oi.requested_qty AS requested_qty,
           COALESCE(oi.approved_qty, oi.requested_qty) AS held,
           p.name AS product_name
      INTO v_rec
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.id = v_item_id AND oi.order_id = p_order_id;

    v_delta := v_rec.held - v_new_qty;

    IF v_delta <> 0 THEN
      UPDATE products SET current_stock = current_stock + v_delta WHERE id = v_rec.product_id;

      INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
      VALUES (v_rec.product_id,
              CASE WHEN v_delta > 0 THEN 'ESTORNO_CANCELAMENTO' ELSE 'SAIDA_PEDIDO' END,
              v_delta,
              format('Ajuste de triagem do pedido %s — "%s": %s para %s', p_order_id, v_rec.product_name, v_rec.held, v_new_qty),
              now());

      v_returned := v_returned + v_delta;
    END IF;

    UPDATE order_items
    SET approved_qty = v_new_qty,
        reduction_reason = CASE WHEN v_new_qty < v_rec.requested_qty THEN v_reason ELSE NULL END
    WHERE id = v_item_id;
  END LOOP;

  UPDATE orders
  SET deposit_notes = CASE WHEN p_deposit_notes IS NULL THEN deposit_notes ELSE NULLIF(btrim(p_deposit_notes), '') END,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO order_status_logs (order_id, from_status, to_status, reason, created_at)
  VALUES (p_order_id, v_status, v_status,
    CASE
      WHEN v_returned > 0 THEN format('Triagem do depósito aplicada. %s unidade(s) devolvida(s) ao estoque por redução de itens.', v_returned)
      WHEN v_returned < 0 THEN format('Triagem do depósito aplicada. %s unidade(s) adicionalmente reservada(s) do estoque.', abs(v_returned))
      ELSE 'Triagem do depósito aplicada sem alteração de quantidades.'
    END, now());

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'returned_to_stock', v_returned);

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
  RETURN jsonb_build_object('success', false, 'code', v_code, 'error', format('Falha ao aplicar a triagem: %s', SQLERRM));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_product_usage(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_open_orders INT;
  v_total_items INT;
  v_name        TEXT;
BEGIN
  SELECT name INTO v_name FROM products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND', 'error', 'Insumo não encontrado no catálogo.');
  END IF;

  SELECT COUNT(DISTINCT o.id) INTO v_open_orders
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id AND o.status IN ('ABERTO', 'EM_ANALISE');

  SELECT COUNT(*) INTO v_total_items FROM order_items WHERE product_id = p_product_id;

  RETURN jsonb_build_object(
    'success', true, 'product_id', p_product_id, 'product_name', v_name,
    'open_order_count', v_open_orders, 'total_item_count', v_total_items,
    'can_hard_delete', v_total_items = 0
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_or_update_product(p_id uuid, p_name text, p_category text, p_unit text, p_current_stock numeric, p_min_stock_alert numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_product_id UUID;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO products (name, category, unit, current_stock, min_stock_alert, is_active)
    VALUES (p_name, p_category, p_unit, p_current_stock, p_min_stock_alert, true)
    RETURNING id INTO v_product_id;

    IF p_current_stock > 0 THEN
      INSERT INTO stock_movements (product_id, type, quantity, reason)
      VALUES (v_product_id, 'ENTRADA_MANUAL', p_current_stock, 'Estoque inicial no cadastro do produto');
    END IF;

    RETURN jsonb_build_object('success', true, 'product_id', v_product_id, 'action', 'created');
  ELSE
    UPDATE products
    SET
      name            = p_name,
      category        = p_category,
      unit            = p_unit,
      min_stock_alert = p_min_stock_alert
    WHERE id = p_id;

    RETURN jsonb_build_object('success', true, 'product_id', p_id, 'action', 'updated');
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.deactivate_product(p_product_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_name           TEXT;
  v_conflict_count INT;
  v_orders         UUID[];
  v_rec            RECORD;
  v_order_id       UUID;
  v_returned       NUMERIC := 0;
  v_cancelled      INT := 0;
BEGIN
  SELECT name INTO v_name FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND', 'error', 'Insumo não encontrado no catálogo.');
  END IF;

  SELECT COUNT(DISTINCT o.id), COALESCE(ARRAY_AGG(DISTINCT o.id), '{}')
  INTO v_conflict_count, v_orders
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id AND o.status IN ('ABERTO', 'EM_ANALISE');

  IF v_conflict_count > 0 AND NOT p_force THEN
    RETURN jsonb_build_object('success', false, 'code', 'CONFLICT_ORDERS',
      'conflict_count', v_conflict_count, 'product_name', v_name,
      'error', format('"%s" está em %s pedido(s) aberto(s) ou em análise.', v_name, v_conflict_count));
  END IF;

  IF v_conflict_count > 0 THEN
    FOR v_rec IN
      SELECT oi.id AS item_id, oi.order_id AS order_id, COALESCE(oi.approved_qty, oi.requested_qty) AS held
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = p_product_id AND o.status IN ('ABERTO', 'EM_ANALISE')
      ORDER BY oi.id
    LOOP
      IF v_rec.held > 0 THEN
        UPDATE products SET current_stock = current_stock + v_rec.held WHERE id = p_product_id;
        INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
        VALUES (p_product_id, 'ESTORNO_CANCELAMENTO', v_rec.held,
                format('Estorno por inativação de "%s" no catálogo (pedido %s)', v_name, v_rec.order_id), now());
        v_returned := v_returned + v_rec.held;
      END IF;

      UPDATE order_items
      SET approved_qty = 0,
          reduction_reason = format('Insumo "%s" inativado no catálogo pelo depósito: item removido automaticamente do pedido.', v_name)
      WHERE id = v_rec.item_id;
    END LOOP;

    FOREACH v_order_id IN ARRAY v_orders
    LOOP
      IF (SELECT COALESCE(SUM(COALESCE(approved_qty, requested_qty)), 0) FROM order_items WHERE order_id = v_order_id) = 0 THEN
        PERFORM transition_order_status(v_order_id, 'CANCELADO',
          format('Cancelamento automático: o insumo "%s" foi inativado no catálogo e o pedido ficou sem itens.', v_name));
        v_cancelled := v_cancelled + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE products SET is_active = false WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id, 'product_name', v_name,
    'forced', p_force, 'affected_orders', v_conflict_count,
    'returned_to_stock', v_returned, 'cancelled_orders', v_cancelled);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', format('Falha ao inativar o insumo: %s', SQLERRM));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_product(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_name       TEXT;
  v_item_count INT;
BEGIN
  SELECT name INTO v_name FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND', 'error', 'Insumo não encontrado no catálogo.');
  END IF;

  SELECT COUNT(*) INTO v_item_count FROM order_items WHERE product_id = p_product_id;

  IF v_item_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'HAS_ORDER_HISTORY',
      'item_count', v_item_count, 'product_name', v_name,
      'error', format('"%s" já participou de %s item(ns) de pedido. A remoção definitiva apagaria esse histórico e por isso está bloqueada.', v_name, v_item_count));
  END IF;

  DELETE FROM products WHERE id = p_product_id;

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id, 'product_name', v_name);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', format('Falha ao remover o insumo: %s', SQLERRM));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_admin_analytics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tz               CONSTANT TEXT := 'America/Sao_Paulo';
  v_today            DATE;
  v_first_day        DATE;

  v_delivered_states CONSTANT TEXT[] := ARRAY[
    'CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE'
  ];
  v_in_progress      CONSTANT TEXT[] := ARRAY[
    'ABERTO', 'EM_ANALISE', 'EM_ATRASO', 'EM_TRANSITO', 'CANCELAMENTO_PENDENTE'
  ];

  v_total_orders     INT;
  v_delivered_base   INT;
  v_delayed_count    INT;
  v_on_time_count    INT;
  v_on_time_rate     NUMERIC;
  v_cancelled_count  INT;
  v_in_progress_cnt  INT;
  v_critical_items   INT;
  v_active_products  INT;

  v_delay_reasons    JSONB;
  v_outcomes         JSONB;
  v_consumption      JSONB;
  v_timeline         JSONB;
BEGIN
  v_today     := (now() AT TIME ZONE v_tz)::DATE;
  v_first_day := v_today - 13;

  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE o.status = ANY (v_delivered_states))::INT,
    COUNT(*) FILTER (WHERE o.status = 'CANCELADO')::INT,
    COUNT(*) FILTER (WHERE o.status = ANY (v_in_progress))::INT
  INTO v_total_orders, v_delivered_base, v_cancelled_count, v_in_progress_cnt
  FROM orders o;

  -- Atrasado = passou por EM_ATRASO no historico OU registra motivo de atraso.
  SELECT COUNT(*)::INT
  INTO v_delayed_count
  FROM orders o
  WHERE o.status = ANY (v_delivered_states)
    AND (
      (o.delay_reason IS NOT NULL AND btrim(o.delay_reason) <> '')
      OR EXISTS (
        SELECT 1 FROM order_status_logs l
        WHERE l.order_id = o.id AND l.to_status = 'EM_ATRASO'
      )
    );

  v_on_time_count := v_delivered_base - v_delayed_count;

  IF v_delivered_base = 0 THEN
    v_on_time_rate := NULL;
  ELSE
    v_on_time_rate := ROUND((v_on_time_count::NUMERIC * 100) / v_delivered_base, 1);
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE p.is_active AND p.current_stock <= p.min_stock_alert)::INT,
    COUNT(*) FILTER (WHERE p.is_active)::INT
  INTO v_critical_items, v_active_products
  FROM products p;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', t.reason, 'count', t.count) ORDER BY t.count DESC, t.reason ASC), '[]'::JSONB)
  INTO v_delay_reasons
  FROM (
    SELECT o.delay_reason AS reason, COUNT(*)::INT AS count
    FROM orders o
    WHERE o.delay_reason IS NOT NULL AND btrim(o.delay_reason) <> ''
    GROUP BY o.delay_reason
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', t.status, 'count', t.count) ORDER BY t.ord), '[]'::JSONB)
  INTO v_outcomes
  FROM (
    SELECT s.status AS status, COUNT(o.id)::INT AS count, s.ord AS ord
    FROM (VALUES ('CONCLUIDO_TOTAL',1),('CONCLUIDO_PARCIAL',2),('CONCLUIDO_NAO_ENTREGUE',3)) AS s(status, ord)
    LEFT JOIN orders o ON o.status = s.status
    GROUP BY s.status, s.ord
  ) t;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('product_id', t.product_id, 'name', t.name, 'unit', t.unit, 'total', t.total)
      ORDER BY t.total DESC, t.name ASC), '[]'::JSONB)
  INTO v_consumption
  FROM (
    SELECT p.id AS product_id, p.name AS name, p.unit AS unit,
           SUM(COALESCE(oi.delivered_qty, oi.approved_qty, oi.requested_qty))::NUMERIC AS total
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL')
    GROUP BY p.id, p.name, p.unit
    ORDER BY total DESC, p.name ASC
    LIMIT 8
  ) t;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('day', to_char(t.day,'YYYY-MM-DD'), 'created', t.created, 'completed', t.completed)
      ORDER BY t.day), '[]'::JSONB)
  INTO v_timeline
  FROM (
    SELECT g.day::DATE AS day,
      (SELECT COUNT(*)::INT FROM orders o WHERE (o.created_at AT TIME ZONE v_tz)::DATE = g.day::DATE) AS created,
      (SELECT COUNT(*)::INT FROM orders o WHERE o.status = ANY (v_delivered_states)
         AND (o.updated_at AT TIME ZONE v_tz)::DATE = g.day::DATE) AS completed
    FROM generate_series(v_first_day, v_today, INTERVAL '1 day') AS g(day)
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'kpis', jsonb_build_object(
      'total_orders', v_total_orders,
      'delivered_base', v_delivered_base,
      'on_time_count', v_on_time_count,
      'delayed_count', v_delayed_count,
      'on_time_rate', v_on_time_rate,
      'cancelled_count', v_cancelled_count,
      'in_progress_count', v_in_progress_cnt,
      'critical_items', v_critical_items,
      'active_products', v_active_products
    ),
    'delay_reasons', v_delay_reasons,
    'outcomes', v_outcomes,
    'consumption', v_consumption,
    'orders_timeline', v_timeline
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_restaurant_recommendations(p_restaurant_id uuid, p_days_window integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_stock_forecasting(p_days_window integer DEFAULT 14)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.place_order_with_reservation(p_restaurant_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reactivate_product(p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE products SET is_active = true WHERE id = p_product_id;
  RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restock_product(p_product_id uuid, p_quantity numeric, p_reason text DEFAULT 'Entrada manual no depósito'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.transition_order_status(p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL::text, p_completion_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_current_status TEXT;
    v_restaurant_id UUID;
    v_item RECORD;
BEGIN
    SELECT status, restaurant_id INTO v_current_status, v_restaurant_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Pedido não encontrado.');
    END IF;

    IF v_current_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO') THEN
        RETURN jsonb_build_object('success', false, 'code', 'TERMINAL_STATE',
            'error', format('Pedido já se encontra em estado final (%s).', v_current_status));
    END IF;

    IF p_new_status = 'CANCELADO' THEN
        FOR v_item IN
            SELECT product_id, COALESCE(approved_qty, requested_qty) AS held
            FROM order_items WHERE order_id = p_order_id ORDER BY product_id
        LOOP
            IF v_item.held > 0 THEN
                UPDATE products SET current_stock = current_stock + v_item.held WHERE id = v_item.product_id;
                INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
                VALUES (v_item.product_id, 'ESTORNO_CANCELAMENTO', v_item.held,
                        format('Estorno do pedido cancelado %s', p_order_id), now());
            END IF;
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

    RETURN jsonb_build_object('success', true, 'order_id', p_order_id,
        'from_status', v_current_status, 'to_status', p_new_status);
END;
$function$
;
