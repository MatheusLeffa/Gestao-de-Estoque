-- ==============================================================================
-- InsumoSync — Estoque da Cozinha (por restaurante)
-- docs/business-rules.md seções 5 e 5.A · docs/database-schema.md 2.8–2.10 e RPCs 2, 13, 14, 15
--
-- Pré-requisito: Migration B (20261026010000_rls_by_role.sql) aplicada — schema
-- `private`, auth_guard e wrappers públicos no ar.
--
-- Esta migration NÃO toca products.current_stock nem order_items.approved_qty:
-- a invariante central (CLAUDE.md §4) deve ficar idêntica antes e depois.
--
-- Ordem de travas (evita deadlock):
--   orders (FOR UPDATE) → restaurants (FOR NO KEY UPDATE) → kitchen_stock (FOR UPDATE, ORDER BY product_id)
-- FOR NO KEY UPDATE em restaurants não conflita com o KEY SHARE que o INSERT de
-- pedidos (FK orders.restaurant_id) adquire, então a cozinha não bloqueia pedidos.
-- ==============================================================================

BEGIN;

-- 1. TABELAS --------------------------------------------------------------------

CREATE TABLE public.kitchen_stock (
    restaurant_id   UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    product_id      UUID        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity        NUMERIC     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    last_counted_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT kitchen_stock_pkey PRIMARY KEY (restaurant_id, product_id)
);

CREATE TABLE public.kitchen_counts (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    counted_by    UUID        REFERENCES auth.users(id),
    is_initial    BOOLEAN     NOT NULL DEFAULT false,
    items_counted INT         NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma única contagem inicial por restaurante.
CREATE UNIQUE INDEX kitchen_counts_one_initial_per_restaurant
    ON public.kitchen_counts (restaurant_id) WHERE is_initial;
CREATE INDEX idx_kitchen_counts_restaurant_created
    ON public.kitchen_counts (restaurant_id, created_at);

CREATE TABLE public.kitchen_movements (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    product_id    UUID        NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    type          TEXT        NOT NULL CHECK (type IN ('CONTAGEM_INICIAL', 'ENTRADA_ENTREGA', 'PERDA', 'CONSUMO_APURADO', 'AJUSTE_POSITIVO')),
    quantity      NUMERIC     NOT NULL,   -- + entradas/ajuste/contagem inicial, − perda/consumo
    reason        TEXT,
    order_id      UUID        REFERENCES public.orders(id),
    count_id      UUID        REFERENCES public.kitchen_counts(id),
    created_by    UUID        REFERENCES auth.users(id) DEFAULT auth.uid(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_kitchen_movements_restaurant_product_created
    ON public.kitchen_movements (restaurant_id, product_id, created_at);
CREATE INDEX idx_kitchen_movements_order_id   ON public.kitchen_movements (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_kitchen_movements_count_id   ON public.kitchen_movements (count_id) WHERE count_id IS NOT NULL;
CREATE INDEX idx_kitchen_movements_product_id ON public.kitchen_movements (product_id);
CREATE INDEX idx_kitchen_stock_product_id     ON public.kitchen_stock (product_id);

-- 2. RLS: leitura para admin ou o próprio restaurante; escrita só por RPC ----------
ALTER TABLE public.kitchen_stock     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_counts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kitchen_stock_select_by_role" ON public.kitchen_stock
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) = 'admin'
    OR restaurant_id = (SELECT public.current_restaurant_id())
  );

CREATE POLICY "kitchen_counts_select_by_role" ON public.kitchen_counts
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) = 'admin'
    OR restaurant_id = (SELECT public.current_restaurant_id())
  );

CREATE POLICY "kitchen_movements_select_by_role" ON public.kitchen_movements
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) = 'admin'
    OR restaurant_id = (SELECT public.current_restaurant_id())
  );

REVOKE ALL ON public.kitchen_stock, public.kitchen_counts, public.kitchen_movements FROM anon, authenticated;
GRANT SELECT ON public.kitchen_stock, public.kitchen_counts, public.kitchen_movements TO authenticated;

-- 3. RPCs PRIVADAS DA COZINHA -----------------------------------------------------

-- 3.1 Leitura do saldo da cozinha
CREATE FUNCTION private.get_kitchen_stock(p_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_initial_at  timestamptz;
  v_last_at     timestamptz;
  v_days        numeric;
  v_items       jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'RESTAURANT_NOT_FOUND', 'error', 'Restaurante não encontrado.');
  END IF;

  SELECT created_at INTO v_initial_at
  FROM kitchen_counts WHERE restaurant_id = p_restaurant_id AND is_initial;

  SELECT max(created_at) INTO v_last_at
  FROM kitchen_counts WHERE restaurant_id = p_restaurant_id;

  -- Janela do consumo médio: 7 dias, encurtada se a contagem inicial é mais recente.
  IF v_initial_at IS NOT NULL THEN
    v_days := GREATEST(1, LEAST(7, EXTRACT(EPOCH FROM (now() - v_initial_at)) / 86400.0));
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'product_id',            p.id,
           'name',                  p.name,
           'category',              p.category,
           'unit',                  p.unit,
           'image_url',             p.image_url,
           'quantity',              COALESCE(ks.quantity, 0),
           'last_counted_at',       ks.last_counted_at,
           'avg_daily_consumption', CASE WHEN v_initial_at IS NULL THEN 0
                                         ELSE round(COALESCE(c.consumed, 0) / v_days, 2) END
         ) ORDER BY p.category, p.name), '[]'::jsonb)
  INTO v_items
  FROM products p
  LEFT JOIN kitchen_stock ks
    ON ks.product_id = p.id AND ks.restaurant_id = p_restaurant_id
  LEFT JOIN (
    SELECT km.product_id, sum(abs(km.quantity)) AS consumed
    FROM kitchen_movements km
    WHERE km.restaurant_id = p_restaurant_id
      AND km.type = 'CONSUMO_APURADO'
      AND km.created_at >= now() - interval '7 days'
    GROUP BY km.product_id
  ) c ON c.product_id = p.id
  WHERE p.is_active OR COALESCE(ks.quantity, 0) > 0;

  RETURN jsonb_build_object(
    'success',          true,
    'initialized',      v_initial_at IS NOT NULL,
    'initial_count_at', v_initial_at,
    'last_count_at',    v_last_at,
    'counted_today',    v_last_at IS NOT NULL
                        AND (v_last_at AT TIME ZONE 'America/Sao_Paulo')::date
                            = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    'items',            v_items
  );
END;
$function$;

-- 3.2 Contagem (inicial ou diária)
CREATE FUNCTION private.submit_kitchen_count(p_restaurant_id uuid, p_items jsonb, p_is_initial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_elem       jsonb;
  v_pid_txt    text;
  v_qty_json   jsonb;
  v_pids       uuid[]    := '{}';
  v_qtys       numeric[] := '{}';
  v_initial    boolean   := COALESCE(p_is_initial, false);
  v_count_id   uuid;
  v_n          int;
  v_rec        record;
  v_balance    numeric;
  v_diff       numeric;
  v_consumed   numeric := 0;
  v_adjusted   int     := 0;
BEGIN
  -- Validação do payload (nada é escrito antes de tudo passar)
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD',
      'error', 'A lista de itens da contagem é inválida.');
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD',
        'error', 'Cada item da contagem precisa informar o insumo e a quantidade contada.');
    END IF;

    v_pid_txt := v_elem->>'product_id';
    IF v_pid_txt IS NULL
       OR v_pid_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD',
        'error', 'Item da contagem sem identificador de insumo válido.');
    END IF;

    IF v_pid_txt::uuid = ANY (v_pids) THEN
      RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_PRODUCT', 'product_id', v_pid_txt,
        'error', 'O mesmo insumo aparece mais de uma vez na contagem.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_pid_txt::uuid) THEN
      RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND', 'product_id', v_pid_txt,
        'error', 'Insumo não encontrado no catálogo.');
    END IF;

    v_qty_json := v_elem->'counted_qty';
    IF v_qty_json IS NULL OR jsonb_typeof(v_qty_json) <> 'number' OR (v_qty_json #>> '{}')::numeric < 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY', 'product_id', v_pid_txt,
        'error', 'A quantidade contada precisa ser um número maior ou igual a zero.');
    END IF;

    v_pids := v_pids || v_pid_txt::uuid;
    v_qtys := v_qtys || (v_qty_json #>> '{}')::numeric;
  END LOOP;

  v_n := COALESCE(array_length(v_pids, 1), 0);

  -- Serializa as operações da cozinha deste restaurante
  PERFORM 1 FROM restaurants WHERE id = p_restaurant_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'RESTAURANT_NOT_FOUND', 'error', 'Restaurante não encontrado.');
  END IF;

  IF v_initial THEN
    IF EXISTS (SELECT 1 FROM kitchen_counts WHERE restaurant_id = p_restaurant_id AND is_initial) THEN
      RETURN jsonb_build_object('success', false, 'code', 'ALREADY_INITIALIZED',
        'error', 'A contagem inicial deste restaurante já foi feita.');
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM kitchen_counts WHERE restaurant_id = p_restaurant_id AND is_initial) THEN
      RETURN jsonb_build_object('success', false, 'code', 'KITCHEN_NOT_INITIALIZED',
        'error', 'Faça a contagem inicial da cozinha antes da contagem diária.');
    END IF;
    IF v_n = 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'EMPTY_COUNT',
        'error', 'Informe pelo menos um insumo na contagem.');
    END IF;
  END IF;

  -- Trava as linhas envolvidas em ordem determinística
  PERFORM 1 FROM kitchen_stock
  WHERE restaurant_id = p_restaurant_id AND product_id = ANY (v_pids)
  ORDER BY product_id
  FOR UPDATE;

  INSERT INTO kitchen_counts (restaurant_id, counted_by, is_initial, items_counted)
  VALUES (p_restaurant_id, auth.uid(), v_initial, v_n)
  RETURNING id INTO v_count_id;

  IF v_initial THEN
    -- Todo insumo ativo ganha linha; o não contado começa em 0, sem movimento.
    INSERT INTO kitchen_stock (restaurant_id, product_id, quantity)
    SELECT p_restaurant_id, p.id, 0 FROM products p WHERE p.is_active
    ON CONFLICT (restaurant_id, product_id) DO NOTHING;

    FOR v_rec IN
      SELECT u.pid, u.qty FROM unnest(v_pids, v_qtys) AS u(pid, qty) ORDER BY u.pid
    LOOP
      INSERT INTO kitchen_stock (restaurant_id, product_id, quantity, last_counted_at, updated_at)
      VALUES (p_restaurant_id, v_rec.pid, v_rec.qty, now(), now())
      ON CONFLICT (restaurant_id, product_id) DO UPDATE
        SET quantity = EXCLUDED.quantity, last_counted_at = now(), updated_at = now();

      INSERT INTO kitchen_movements (restaurant_id, product_id, type, quantity, reason, count_id, created_by)
      VALUES (p_restaurant_id, v_rec.pid, 'CONTAGEM_INICIAL', v_rec.qty, 'Contagem inicial da cozinha', v_count_id, auth.uid());
    END LOOP;

  ELSE
    FOR v_rec IN
      SELECT u.pid, u.qty FROM unnest(v_pids, v_qtys) AS u(pid, qty) ORDER BY u.pid
    LOOP
      -- Produto sem linha ainda (ex.: cadastrado depois da contagem inicial) tem saldo 0.
      INSERT INTO kitchen_stock (restaurant_id, product_id, quantity)
      VALUES (p_restaurant_id, v_rec.pid, 0)
      ON CONFLICT (restaurant_id, product_id) DO NOTHING;

      SELECT quantity INTO v_balance FROM kitchen_stock
      WHERE restaurant_id = p_restaurant_id AND product_id = v_rec.pid
      FOR UPDATE;

      v_diff := v_balance - v_rec.qty;

      UPDATE kitchen_stock
      SET quantity = v_rec.qty, last_counted_at = now(), updated_at = now()
      WHERE restaurant_id = p_restaurant_id AND product_id = v_rec.pid;

      IF v_diff > 0 THEN
        INSERT INTO kitchen_movements (restaurant_id, product_id, type, quantity, reason, count_id, created_by)
        VALUES (p_restaurant_id, v_rec.pid, 'CONSUMO_APURADO', -v_diff,
                format('Consumo apurado na contagem (saldo %s, contado %s)', v_balance, v_rec.qty), v_count_id, auth.uid());
        v_consumed := v_consumed + v_diff;
      ELSIF v_diff < 0 THEN
        INSERT INTO kitchen_movements (restaurant_id, product_id, type, quantity, reason, count_id, created_by)
        VALUES (p_restaurant_id, v_rec.pid, 'AJUSTE_POSITIVO', -v_diff,
                format('Ajuste positivo na contagem (saldo %s, contado %s)', v_balance, v_rec.qty), v_count_id, auth.uid());
        v_adjusted := v_adjusted + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'count_id',       v_count_id,
    'consumed_total', v_consumed,
    'adjusted_items', v_adjusted,
    'items_counted',  v_n
  );
END;
$function$;

-- 3.3 Registro de perda
CREATE FUNCTION private.register_kitchen_loss(p_restaurant_id uuid, p_product_id uuid, p_quantity numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_balance numeric;
  v_new     numeric;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY',
      'error', 'A quantidade perdida precisa ser maior que zero.');
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED',
      'error', 'Informe o motivo da perda.');
  END IF;

  PERFORM 1 FROM restaurants WHERE id = p_restaurant_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'RESTAURANT_NOT_FOUND', 'error', 'Restaurante não encontrado.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM kitchen_counts WHERE restaurant_id = p_restaurant_id AND is_initial) THEN
    RETURN jsonb_build_object('success', false, 'code', 'KITCHEN_NOT_INITIALIZED',
      'error', 'Faça a contagem inicial da cozinha antes de registrar perdas.');
  END IF;

  IF p_product_id IS NULL OR NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND',
      'error', 'Insumo não encontrado no catálogo.');
  END IF;

  SELECT quantity INTO v_balance FROM kitchen_stock
  WHERE restaurant_id = p_restaurant_id AND product_id = p_product_id
  FOR UPDATE;
  v_balance := COALESCE(v_balance, 0);

  IF p_quantity > v_balance THEN
    RETURN jsonb_build_object('success', false, 'code', 'INSUFFICIENT_KITCHEN_STOCK', 'available', v_balance,
      'error', format('A perda (%s) é maior que o saldo da cozinha (%s).', p_quantity, v_balance));
  END IF;

  UPDATE kitchen_stock
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE restaurant_id = p_restaurant_id AND product_id = p_product_id
  RETURNING quantity INTO v_new;

  INSERT INTO kitchen_movements (restaurant_id, product_id, type, quantity, reason, created_by)
  VALUES (p_restaurant_id, p_product_id, 'PERDA', -p_quantity, btrim(p_reason), auth.uid());

  RETURN jsonb_build_object('success', true, 'product_id', p_product_id, 'new_quantity', v_new);
END;
$function$;

-- 4. transition_order_status com p_missing_items ---------------------------------
-- DROP + CREATE (e não CREATE OR REPLACE): manter a versão de 4 args ao lado da de 5
-- com default tornaria ambígua toda chamada com 3 ou 4 argumentos.
-- private.deactivate_product chama `transition_order_status(id, 'CANCELADO', motivo)`
-- sem schema → resolve para a pública de 5 args pelo default.
DROP FUNCTION public.transition_order_status(uuid, text, text, text);
DROP FUNCTION private.transition_order_status(uuid, text, text, text);

CREATE FUNCTION private.transition_order_status(
  p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL::text,
  p_completion_type text DEFAULT NULL::text, p_missing_items jsonb DEFAULT NULL::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
    v_current_status TEXT;
    v_restaurant_id  UUID;
    v_item           RECORD;
    v_elem           jsonb;
    v_iid_txt        text;
    v_miss_json      jsonb;
    v_miss           numeric;
    v_sent           numeric;
    v_item_ids       uuid[]    := '{}';
    v_missing        numeric[] := '{}';
    v_any_missing    boolean   := false;
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

    -- Validação das faltas da entrega parcial (antes de qualquer escrita)
    IF p_new_status = 'CONCLUIDO_PARCIAL' THEN
        IF p_missing_items IS NULL OR jsonb_typeof(p_missing_items) <> 'array'
           OR jsonb_array_length(p_missing_items) = 0 THEN
            RETURN jsonb_build_object('success', false, 'code', 'MISSING_ITEMS_REQUIRED',
                'error', 'Na entrega parcial, informe item a item o que faltou.');
        END IF;

        FOR v_elem IN SELECT value FROM jsonb_array_elements(p_missing_items)
        LOOP
            v_iid_txt := CASE WHEN jsonb_typeof(v_elem) = 'object' THEN v_elem->>'item_id' END;
            IF v_iid_txt IS NULL
               OR v_iid_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                RETURN jsonb_build_object('success', false, 'code', 'ITEM_NOT_FOUND',
                    'error', 'Item da entrega sem identificador válido.');
            END IF;

            SELECT COALESCE(approved_qty, requested_qty) INTO v_sent
            FROM order_items WHERE id = v_iid_txt::uuid AND order_id = p_order_id;
            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', false, 'code', 'ITEM_NOT_FOUND', 'item_id', v_iid_txt,
                    'error', 'Item não pertence a este pedido.');
            END IF;

            IF v_iid_txt::uuid = ANY (v_item_ids) THEN
                RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY', 'item_id', v_iid_txt,
                    'error', 'O mesmo item foi informado mais de uma vez.');
            END IF;

            v_miss_json := v_elem->'missing_qty';
            IF v_miss_json IS NULL OR jsonb_typeof(v_miss_json) <> 'number' THEN
                RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY', 'item_id', v_iid_txt,
                    'error', 'A quantidade faltante precisa ser um número.');
            END IF;
            v_miss := (v_miss_json #>> '{}')::numeric;
            IF v_miss < 0 OR v_miss > v_sent THEN
                RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY', 'item_id', v_iid_txt,
                    'error', format('A falta precisa estar entre 0 e a quantidade enviada (%s).', v_sent));
            END IF;

            IF v_miss > 0 THEN v_any_missing := true; END IF;
            v_item_ids := v_item_ids || v_iid_txt::uuid;
            v_missing  := v_missing  || v_miss;
        END LOOP;

        IF NOT v_any_missing THEN
            RETURN jsonb_build_object('success', false, 'code', 'MISSING_ITEMS_REQUIRED',
                'error', 'Nenhum item com falta: se tudo chegou, a entrega é total.');
        END IF;
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

    -- Conferência na entrega: delivered_qty (não toca current_stock nem approved_qty)
    IF p_new_status = 'CONCLUIDO_TOTAL' THEN
        UPDATE order_items SET delivered_qty = COALESCE(approved_qty, requested_qty)
        WHERE order_id = p_order_id;
    ELSIF p_new_status = 'CONCLUIDO_NAO_ENTREGUE' THEN
        UPDATE order_items SET delivered_qty = 0 WHERE order_id = p_order_id;
    ELSIF p_new_status = 'CONCLUIDO_PARCIAL' THEN
        UPDATE order_items oi
        SET delivered_qty = COALESCE(oi.approved_qty, oi.requested_qty)
                          - COALESCE((SELECT m.missing
                                      FROM unnest(v_item_ids, v_missing) AS m(item_id, missing)
                                      WHERE m.item_id = oi.id), 0)
        WHERE oi.order_id = p_order_id;
    END IF;

    -- Crédito na cozinha (só se o restaurante já fez a contagem inicial)
    IF p_new_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL') THEN
        PERFORM 1 FROM restaurants WHERE id = v_restaurant_id FOR NO KEY UPDATE;

        IF EXISTS (SELECT 1 FROM kitchen_counts WHERE restaurant_id = v_restaurant_id AND is_initial) THEN
            PERFORM 1 FROM kitchen_stock ks
            WHERE ks.restaurant_id = v_restaurant_id
              AND ks.product_id IN (SELECT product_id FROM order_items WHERE order_id = p_order_id)
            ORDER BY ks.product_id
            FOR UPDATE;

            FOR v_item IN
                SELECT product_id, SUM(delivered_qty) AS delivered
                FROM order_items WHERE order_id = p_order_id
                GROUP BY product_id
                HAVING SUM(delivered_qty) > 0
                ORDER BY product_id
            LOOP
                INSERT INTO kitchen_stock (restaurant_id, product_id, quantity, updated_at)
                VALUES (v_restaurant_id, v_item.product_id, v_item.delivered, now())
                ON CONFLICT (restaurant_id, product_id) DO UPDATE
                  SET quantity = kitchen_stock.quantity + EXCLUDED.quantity, updated_at = now();

                INSERT INTO kitchen_movements (restaurant_id, product_id, type, quantity, reason, order_id, created_by)
                VALUES (v_restaurant_id, v_item.product_id, 'ENTRADA_ENTREGA', v_item.delivered,
                        format('Entrega do pedido #%s', upper(left(p_order_id::text, 8))), p_order_id, auth.uid());
            END LOOP;
        END IF;
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
$function$;

-- Wrapper público: mesma matriz de papéis da Migration B, agora repassando as faltas.
CREATE FUNCTION public.transition_order_status(
  p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL::text,
  p_completion_type text DEFAULT NULL::text, p_missing_items jsonb DEFAULT NULL::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_err           jsonb;
  v_role          text;
  v_status        text;
  v_restaurant_id uuid;
  v_forbidden     jsonb := jsonb_build_object('success', false, 'code', 'FORBIDDEN',
                             'error', 'Seu perfil não pode fazer esta mudança de status.');
BEGIN
  v_err := public.auth_guard(ARRAY['restaurante', 'estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;

  v_role := public.current_app_role();

  IF v_role <> 'admin' THEN
    -- Trava o pedido já aqui para a regra valer sobre o status que será alterado.
    SELECT status, restaurant_id INTO v_status, v_restaurant_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Pedido não encontrado.');
    END IF;

    IF v_role = 'restaurante' THEN
      IF v_restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
        RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
          'error', 'Este pedido não pertence ao seu restaurante.');
      END IF;

      -- Estado terminal segue para a implementação, que responde TERMINAL_STATE.
      IF v_status NOT IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO')
         AND NOT (
              (v_status = 'ABERTO' AND p_new_status = 'CANCELADO')
           OR (v_status IN ('EM_ANALISE', 'EM_ATRASO') AND p_new_status = 'CANCELAMENTO_PENDENTE')
           OR (v_status = 'EM_TRANSITO' AND p_new_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE'))
         ) THEN
        RETURN v_forbidden;
      END IF;

    ELSIF v_role = 'estoque' THEN
      IF p_new_status IN ('CANCELAMENTO_PENDENTE', 'CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE') THEN
        RETURN v_forbidden;
      END IF;
    END IF;
  END IF;

  RETURN private.transition_order_status(p_order_id, p_new_status, p_reason, p_completion_type, p_missing_items);
END;
$function$;

-- 5. WRAPPERS PÚBLICOS DA COZINHA ------------------------------------------------
CREATE FUNCTION public.get_kitchen_stock(p_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['restaurante', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;

  IF public.current_app_role() = 'restaurante' AND p_restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'error', 'Você só pode consultar o estoque da cozinha do seu próprio restaurante.');
  END IF;

  RETURN private.get_kitchen_stock(p_restaurant_id);
END;
$function$;

CREATE FUNCTION public.submit_kitchen_count(p_restaurant_id uuid, p_items jsonb, p_is_initial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['restaurante', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;

  IF public.current_app_role() = 'restaurante' AND p_restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'error', 'Você só pode contar o estoque da cozinha do seu próprio restaurante.');
  END IF;

  RETURN private.submit_kitchen_count(p_restaurant_id, p_items, p_is_initial);
END;
$function$;

CREATE FUNCTION public.register_kitchen_loss(p_restaurant_id uuid, p_product_id uuid, p_quantity numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['restaurante', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;

  IF public.current_app_role() = 'restaurante' AND p_restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'error', 'Você só pode registrar perdas na cozinha do seu próprio restaurante.');
  END IF;

  RETURN private.register_kitchen_loss(p_restaurant_id, p_product_id, p_quantity, p_reason);
END;
$function$;

-- 6. PRIVILÉGIOS ----------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION private.get_kitchen_stock(uuid)                                   FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.submit_kitchen_count(uuid, jsonb, boolean)                FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.register_kitchen_loss(uuid, uuid, numeric, text)          FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.transition_order_status(uuid, text, text, text, jsonb)    FROM public, anon, authenticated;

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.get_kitchen_stock(uuid)',
    'public.submit_kitchen_count(uuid, jsonb, boolean)',
    'public.register_kitchen_loss(uuid, uuid, numeric, text)',
    'public.transition_order_status(uuid, text, text, text, jsonb)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
  END LOOP;
END $$;

COMMIT;

-- PostgREST recarrega o cache de funções e permissões
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- ROLLBACK (rodar só se algo falhar em produção). Apaga o histórico da cozinha.
-- delivered_qty já gravado nos pedidos concluídos permanece (coluna pré-existente).
-- ==============================================================================
-- BEGIN;
-- DROP FUNCTION public.get_kitchen_stock(uuid);
-- DROP FUNCTION public.submit_kitchen_count(uuid, jsonb, boolean);
-- DROP FUNCTION public.register_kitchen_loss(uuid, uuid, numeric, text);
-- DROP FUNCTION private.get_kitchen_stock(uuid);
-- DROP FUNCTION private.submit_kitchen_count(uuid, jsonb, boolean);
-- DROP FUNCTION private.register_kitchen_loss(uuid, uuid, numeric, text);
--
-- DROP FUNCTION public.transition_order_status(uuid, text, text, text, jsonb);
-- DROP FUNCTION private.transition_order_status(uuid, text, text, text, jsonb);
-- -- Recriar private.transition_order_status(uuid, text, text, text) com o corpo do fim de
-- -- 20260929000000_baseline.sql (+ SET search_path = public, REVOKE de public/anon/authenticated)
-- -- e public.transition_order_status(uuid, text, text, text) com o corpo da seção 2.2 de
-- -- 20261026010000_rls_by_role.sql (+ REVOKE de public/anon, GRANT a authenticated).
--
-- DROP TABLE public.kitchen_movements;
-- DROP TABLE public.kitchen_counts;
-- DROP TABLE public.kitchen_stock;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
