-- ==============================================================================
-- InsumoSync — Máquina de estados validada no banco (item 2 da revisão de melhorias)
-- Docs: docs/state-machine.md seção 3 · docs/database-schema.md (orders, RPC 2)
--
-- Antes: private.transition_order_status só recusava pedidos em estado final, e
-- orders.status aceitava qualquer texto. O estoque podia ir de ABERTO direto
-- para EM_TRANSITO, e o admin podia gravar um status inventado.
--
-- Depois:
--   1. private.order_statuses() e private.is_valid_transition(from, to): fonte
--      única da matriz no banco (espelhada no cliente em src/lib/state-machine.ts).
--   2. private.transition_order_status recusa status desconhecido (INVALID_STATUS)
--      e par fora da matriz (INVALID_TRANSITION), para todos os papéis. O resto do
--      corpo é o da migration 20261028000000_kitchen_stock.sql, sem alteração.
--   3. CHECK em orders.status com os 9 status. Entra NOT VALID e depois VALIDATE:
--      se já existir pedido com status inválido, a migration falha e nada é aplicado.
--
-- Não toca current_stock, approved_qty nem as tabelas da cozinha. Rode a invariante
-- do CLAUDE.md §4 antes e depois mesmo assim.
-- ==============================================================================

BEGIN;

-- 1. MATRIZ ----------------------------------------------------------------------
CREATE FUNCTION private.order_statuses()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path = public
AS $function$
  SELECT ARRAY['ABERTO', 'EM_ANALISE', 'EM_ATRASO', 'CANCELAMENTO_PENDENTE', 'EM_TRANSITO',
               'CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO'];
$function$;

CREATE FUNCTION private.is_valid_transition(p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public
AS $function$
  SELECT coalesce(p_to = ANY (CASE p_from
    WHEN 'ABERTO'                THEN ARRAY['EM_ANALISE', 'CANCELADO']
    WHEN 'EM_ANALISE'            THEN ARRAY['EM_TRANSITO', 'EM_ATRASO', 'CANCELAMENTO_PENDENTE', 'CANCELADO']
    WHEN 'EM_ATRASO'             THEN ARRAY['EM_ANALISE', 'EM_TRANSITO', 'CANCELAMENTO_PENDENTE', 'CANCELADO']
    WHEN 'CANCELAMENTO_PENDENTE' THEN ARRAY['CANCELADO', 'EM_ANALISE']
    WHEN 'EM_TRANSITO'           THEN ARRAY['CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE',
                                            'EM_ATRASO', 'CANCELADO']
    ELSE ARRAY[]::text[]
  END), false);
$function$;

REVOKE EXECUTE ON FUNCTION private.order_statuses()                 FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_valid_transition(text, text)  FROM public, anon, authenticated;

-- 2. RPC COM GUARDA (mesma assinatura; o wrapper público não muda) -----------------
CREATE OR REPLACE FUNCTION private.transition_order_status(
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

    -- Guarda da máquina de estados (state-machine.md seção 3), para todos os papéis
    IF p_new_status IS NULL OR NOT (p_new_status = ANY (private.order_statuses())) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS',
            'error', format('Status desconhecido: %s.', coalesce(p_new_status, '(vazio)')));
    END IF;

    IF v_current_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO') THEN
        RETURN jsonb_build_object('success', false, 'code', 'TERMINAL_STATE',
            'error', format('Pedido já se encontra em estado final (%s).', v_current_status));
    END IF;

    IF NOT private.is_valid_transition(v_current_status, p_new_status) THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_TRANSITION',
            'from_status', v_current_status, 'to_status', p_new_status,
            'error', format('Não é possível passar o pedido de %s para %s.', v_current_status, p_new_status));
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

REVOKE EXECUTE ON FUNCTION private.transition_order_status(uuid, text, text, text, jsonb) FROM public, anon, authenticated;

-- 3. CHECK EM orders.status ----------------------------------------------------------
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'ABERTO', 'EM_ANALISE', 'EM_ATRASO', 'CANCELAMENTO_PENDENTE', 'EM_TRANSITO',
    'CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO'
  )) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_status_check;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- ROLLBACK (devolve o comportamento anterior)
-- ==============================================================================
-- BEGIN;
-- ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
-- -- Recriar private.transition_order_status com o corpo da migration
-- -- 20261028000000_kitchen_stock.sql (CREATE OR REPLACE, mesma assinatura).
-- DROP FUNCTION private.is_valid_transition(text, text);
-- DROP FUNCTION private.order_statuses();
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
