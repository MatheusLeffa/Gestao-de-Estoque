-- ==============================================================================
-- MIGRATION: product_management_v2
-- InsumoSync — Deleção de Produtos, Triagem Atômica e Integridade do Ledger
--
-- Corrige dois vazamentos de saldo e implementa a deleção definitiva de insumos.
--
-- INVARIANTE MESTRA DO LEDGER:
--   O saldo retido fora do current_stock por um item de pedido não-terminal é
--   sempre o seu approved_qty. Toda escrita em approved_qty move o current_stock
--   na direção oposta, dentro da mesma transação.
-- ==============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- 1. check_product_usage — fonte de verdade server-side para a UI
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_product_usage(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_open_orders INT;
  v_total_items INT;
  v_name        TEXT;
BEGIN
  SELECT name INTO v_name FROM products WHERE id = p_product_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'code',    'PRODUCT_NOT_FOUND',
      'error',   'Insumo não encontrado no catálogo.'
    );
  END IF;

  SELECT COUNT(DISTINCT o.id) INTO v_open_orders
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.status IN ('ABERTO', 'EM_ANALISE');

  SELECT COUNT(*) INTO v_total_items
  FROM order_items
  WHERE product_id = p_product_id;

  RETURN jsonb_build_object(
    'success',          true,
    'product_id',       p_product_id,
    'product_name',     v_name,
    'open_order_count', v_open_orders,
    'total_item_count', v_total_items,
    'can_hard_delete',  v_total_items = 0
  );
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. apply_order_triage — CORRIGE BUG-01 (redução na triagem não devolvia saldo)
--
--    Substitui o UPDATE direto que o cliente fazia em order_items.
--    Valida tudo antes de escrever qualquer coisa (duas passadas) e devolve ao
--    estoque a diferença reduzida, com movimentação registrada.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_order_triage(
  p_order_id       UUID,
  p_items          JSONB,   -- [{ item_id, approved_qty, reduction_reason }]
  p_deposit_notes  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status    TEXT;
  v_item      JSONB;
  v_item_id   UUID;
  v_new_qty   NUMERIC;
  v_reason    TEXT;
  v_rec       RECORD;
  v_delta     NUMERIC;
  v_returned  NUMERIC := 0;
  v_code      TEXT;
BEGIN
  -- Trava o pedido
  SELECT status INTO v_status FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'ORDER_NOT_FOUND', 'error', 'Pedido não encontrado.'
    );
  END IF;

  IF v_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO') THEN
    RETURN jsonb_build_object(
      'success', false,
      'code',    'TERMINAL_STATE',
      'error',   format('Pedido já está em estado final (%s); a triagem não pode ser alterada.', v_status)
    );
  END IF;

  -- Trava todos os insumos do pedido em ordem determinística (evita deadlock)
  PERFORM 1
  FROM products
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id = p_order_id)
  ORDER BY id
  FOR UPDATE;

  -- ─── PASSADA 1: validação pura, sem nenhuma escrita ─────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_new_qty := (v_item->>'approved_qty')::NUMERIC;
    v_reason  := NULLIF(btrim(COALESCE(v_item->>'reduction_reason', '')), '');

    SELECT oi.requested_qty,
           COALESCE(oi.approved_qty, oi.requested_qty) AS held,
           p.name                                      AS product_name,
           p.current_stock                             AS current_stock
      INTO v_rec
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.id = v_item_id AND oi.order_id = p_order_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false, 'code', 'ITEM_NOT_FOUND',
        'error', 'Um dos itens informados não pertence a este pedido.'
      );
    END IF;

    IF v_new_qty IS NULL OR v_new_qty < 0 OR v_new_qty > v_rec.requested_qty THEN
      RETURN jsonb_build_object(
        'success', false, 'code', 'INVALID_QUANTITY',
        'error', format('Quantidade aprovada inválida para "%s". Permitido de 0 a %s.',
                        v_rec.product_name, v_rec.requested_qty),
        'product_name', v_rec.product_name
      );
    END IF;

    -- Regra do blueprint, agora aplicada no banco e não apenas na tela
    IF v_new_qty < v_rec.requested_qty AND v_reason IS NULL THEN
      RETURN jsonb_build_object(
        'success', false, 'code', 'REASON_REQUIRED',
        'error', format('Justificativa individual obrigatória para a redução do item "%s".',
                        v_rec.product_name),
        'product_name', v_rec.product_name
      );
    END IF;

    -- Ampliar a quantidade aprovada exige saldo disponível no depósito
    IF v_new_qty > v_rec.held AND v_rec.current_stock < (v_new_qty - v_rec.held) THEN
      RETURN jsonb_build_object(
        'success', false, 'code', 'INSUFFICIENT_STOCK',
        'error', format('Saldo insuficiente para ampliar "%s". Disponível: %s.',
                        v_rec.product_name, v_rec.current_stock),
        'product_name',    v_rec.product_name,
        'available_stock', v_rec.current_stock
      );
    END IF;
  END LOOP;

  -- ─── PASSADA 2: aplicação ───────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_new_qty := (v_item->>'approved_qty')::NUMERIC;
    v_reason  := NULLIF(btrim(COALESCE(v_item->>'reduction_reason', '')), '');

    SELECT oi.product_id                               AS product_id,
           oi.requested_qty                            AS requested_qty,
           COALESCE(oi.approved_qty, oi.requested_qty) AS held,
           p.name                                      AS product_name
      INTO v_rec
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.id = v_item_id AND oi.order_id = p_order_id;

    v_delta := v_rec.held - v_new_qty;  -- positivo devolve saldo ao estoque

    IF v_delta <> 0 THEN
      UPDATE products
      SET current_stock = current_stock + v_delta
      WHERE id = v_rec.product_id;

      INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
      VALUES (
        v_rec.product_id,
        CASE WHEN v_delta > 0 THEN 'ESTORNO_CANCELAMENTO' ELSE 'SAIDA_PEDIDO' END,
        v_delta,
        format('Ajuste de triagem do pedido %s — "%s": %s para %s',
               p_order_id, v_rec.product_name, v_rec.held, v_new_qty),
        now()
      );

      v_returned := v_returned + v_delta;
    END IF;

    UPDATE order_items
    SET approved_qty     = v_new_qty,
        reduction_reason = CASE WHEN v_new_qty < v_rec.requested_qty THEN v_reason ELSE NULL END
    WHERE id = v_item_id;
  END LOOP;

  -- Observações gerais do depósito (NULL no parâmetro preserva o valor atual)
  UPDATE orders
  SET deposit_notes = CASE
        WHEN p_deposit_notes IS NULL THEN deposit_notes
        ELSE NULLIF(btrim(p_deposit_notes), '')
      END,
      updated_at = now()
  WHERE id = p_order_id;

  -- Auditoria da triagem na linha do tempo do pedido
  INSERT INTO order_status_logs (order_id, from_status, to_status, reason, created_at)
  VALUES (
    p_order_id, v_status, v_status,
    CASE
      WHEN v_returned > 0 THEN format('Triagem do depósito aplicada. %s unidade(s) devolvida(s) ao estoque por redução de itens.', v_returned)
      WHEN v_returned < 0 THEN format('Triagem do depósito aplicada. %s unidade(s) adicionalmente reservada(s) do estoque.', abs(v_returned))
      ELSE 'Triagem do depósito aplicada sem alteração de quantidades.'
    END,
    now()
  );

  RETURN jsonb_build_object(
    'success',           true,
    'order_id',          p_order_id,
    'returned_to_stock', v_returned
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE;
  RETURN jsonb_build_object(
    'success', false, 'code', v_code,
    'error',   format('Falha ao aplicar a triagem: %s', SQLERRM)
  );
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. transition_order_status — CORRIGE BUG-02 (crédito duplo no cancelamento)
--
--    O estorno passa a usar approved_qty, que é o saldo efetivamente retido,
--    e não requested_qty. Comportamento idêntico para pedidos nunca triados.
-- ──────────────────────────────────────────────────────────────────────────────
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

    -- Se cancelar, estornar atomicamente o saldo EFETIVAMENTE RETIDO (approved_qty)
    IF p_new_status = 'CANCELADO' THEN
        FOR v_item IN
            SELECT product_id, COALESCE(approved_qty, requested_qty) AS held
            FROM order_items
            WHERE order_id = p_order_id
            ORDER BY product_id
        LOOP
            IF v_item.held > 0 THEN
                UPDATE products
                SET current_stock = current_stock + v_item.held
                WHERE id = v_item.product_id;

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

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'from_status', v_current_status,
        'to_status', p_new_status
    );
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. deactivate_product — estorno correto + cancelamento de pedido esvaziado
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION deactivate_product(
  p_product_id UUID,
  p_force      BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    RETURN jsonb_build_object(
      'success', false, 'code', 'PRODUCT_NOT_FOUND',
      'error', 'Insumo não encontrado no catálogo.'
    );
  END IF;

  SELECT COUNT(DISTINCT o.id), COALESCE(ARRAY_AGG(DISTINCT o.id), '{}')
  INTO v_conflict_count, v_orders
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.status IN ('ABERTO', 'EM_ANALISE');

  -- Bloqueio padrão: nenhuma escrita aconteceu ainda, o retorno é seguro
  IF v_conflict_count > 0 AND NOT p_force THEN
    RETURN jsonb_build_object(
      'success',        false,
      'code',           'CONFLICT_ORDERS',
      'conflict_count', v_conflict_count,
      'product_name',   v_name,
      'error',          format('"%s" está em %s pedido(s) aberto(s) ou em análise.', v_name, v_conflict_count)
    );
  END IF;

  IF v_conflict_count > 0 THEN
    -- Estorna o saldo retido e zera o item em cada pedido afetado
    FOR v_rec IN
      SELECT oi.id AS item_id, oi.order_id AS order_id,
             COALESCE(oi.approved_qty, oi.requested_qty) AS held
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = p_product_id
        AND o.status IN ('ABERTO', 'EM_ANALISE')
      ORDER BY oi.id
    LOOP
      IF v_rec.held > 0 THEN
        UPDATE products
        SET current_stock = current_stock + v_rec.held
        WHERE id = p_product_id;

        INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
        VALUES (p_product_id, 'ESTORNO_CANCELAMENTO', v_rec.held,
                format('Estorno por inativação de "%s" no catálogo (pedido %s)', v_name, v_rec.order_id),
                now());

        v_returned := v_returned + v_rec.held;
      END IF;

      UPDATE order_items
      SET approved_qty     = 0,
          reduction_reason = format('Insumo "%s" inativado no catálogo pelo depósito: item removido automaticamente do pedido.', v_name)
      WHERE id = v_rec.item_id;
    END LOOP;

    -- Pedido que ficou sem nenhum item é cancelado automaticamente
    FOREACH v_order_id IN ARRAY v_orders
    LOOP
      IF (SELECT COALESCE(SUM(COALESCE(approved_qty, requested_qty)), 0)
          FROM order_items WHERE order_id = v_order_id) = 0 THEN
        PERFORM transition_order_status(
          v_order_id,
          'CANCELADO',
          format('Cancelamento automático: o insumo "%s" foi inativado no catálogo e o pedido ficou sem itens.', v_name)
        );
        v_cancelled := v_cancelled + 1;
      END IF;
    END LOOP;
  END IF;

  UPDATE products SET is_active = false WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success',           true,
    'product_id',        p_product_id,
    'product_name',      v_name,
    'forced',            p_force,
    'affected_orders',   v_conflict_count,
    'returned_to_stock', v_returned,
    'cancelled_orders',  v_cancelled
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   format('Falha ao inativar o insumo: %s', SQLERRM)
  );
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. delete_product — deleção definitiva, só para insumo sem nenhum histórico
--
--    order_items.product_id é ON DELETE RESTRICT: o banco impede fisicamente a
--    remoção de um insumo já usado. A função verifica antes para devolver um erro
--    legível em vez de uma violação crua de constraint.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_product(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name       TEXT;
  v_item_count INT;
BEGIN
  SELECT name INTO v_name FROM products WHERE id = p_product_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'code', 'PRODUCT_NOT_FOUND',
      'error', 'Insumo não encontrado no catálogo.'
    );
  END IF;

  SELECT COUNT(*) INTO v_item_count
  FROM order_items
  WHERE product_id = p_product_id;

  IF v_item_count > 0 THEN
    RETURN jsonb_build_object(
      'success',      false,
      'code',         'HAS_ORDER_HISTORY',
      'item_count',   v_item_count,
      'product_name', v_name,
      'error',        format('"%s" já participou de %s item(ns) de pedido. A remoção definitiva apagaria esse histórico e por isso está bloqueada.', v_name, v_item_count)
    );
  END IF;

  DELETE FROM products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success',      true,
    'product_id',   p_product_id,
    'product_name', v_name
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error',   format('Falha ao remover o insumo: %s', SQLERRM)
  );
END;
$$;
