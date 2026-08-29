-- InsumoSync: Stored Procedures (RPC Functions) for Atomic Concurrency & State Machine
-- Author: cloud-db-architect
-- Project: sqncxfboizrudyetetxi

-- 1. Function: place_order_with_reservation
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
    -- Validate restaurant exists
    IF NOT EXISTS (SELECT 1 FROM restaurants WHERE id = p_restaurant_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'RESTAURANT_NOT_FOUND',
            'error', 'Restaurante não encontrado no sistema.'
        );
    END IF;

    -- Validate items payload
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'EMPTY_ORDER',
            'error', 'O pedido precisa conter pelo menos um insumo.'
        );
    END IF;

    -- Step 1: Lock products and validate stock availability (SELECT ... FOR UPDATE)
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

        -- Acquire exclusive row lock
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

        -- Check stock constraint
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

    -- Step 2: Deduct stock and record stock movements
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_requested_qty := (v_item->>'requested_qty')::NUMERIC;

        UPDATE products
        SET current_stock = current_stock - v_requested_qty
        WHERE id = v_product_id;
    END LOOP;

    -- Step 3: Insert order
    INSERT INTO orders (restaurant_id, status, notes, created_at, updated_at)
    VALUES (p_restaurant_id, 'ABERTO', p_notes, now(), now())
    RETURNING id INTO v_order_id;

    -- Step 4: Insert order items and stock movements
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_requested_qty := (v_item->>'requested_qty')::NUMERIC;

        INSERT INTO order_items (order_id, product_id, requested_qty, approved_qty)
        VALUES (v_order_id, v_product_id, v_requested_qty, v_requested_qty);

        INSERT INTO stock_movements (product_id, type, quantity, reason, created_at)
        VALUES (v_product_id, 'SAIDA_PEDIDO', -v_requested_qty, format('Reserva do pedido %s', v_order_id), now());
    END LOOP;

    -- Step 5: Insert audit log
    INSERT INTO order_status_logs (order_id, from_status, to_status, reason, created_at)
    VALUES (v_order_id, NULL, 'ABERTO', 'Criação do pedido com reserva atômica de estoque', now());

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'message', 'Pedido criado e saldo reservado com sucesso.'
    );
END;
$$;


-- 2. Function: transition_order_status
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
    -- Acquire exclusive lock on order row
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

    -- If status is already terminal, prevent modification
    IF v_current_status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE', 'CANCELADO') THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'TERMINAL_STATE',
            'error', format('Pedido já se encontra em estado final (%s).', v_current_status)
        );
    END IF;

    -- If transitioning to CANCELADO, atomically restore reserved stock
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

    -- Update order status and fields
    UPDATE orders
    SET status = p_new_status,
        delay_reason = CASE WHEN p_new_status = 'EM_ATRASO' THEN COALESCE(p_reason, delay_reason) ELSE delay_reason END,
        completion_type = COALESCE(p_completion_type, completion_type),
        updated_at = now()
    WHERE id = p_order_id;

    -- Insert status change log
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


-- 3. Function: restock_product
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

    -- Update product stock
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

    -- Record stock movement
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
