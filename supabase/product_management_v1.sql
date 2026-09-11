-- ==============================================================================
-- MIGRATION: product_management_v1
-- InsumoSync — Gestão de Produtos (Cadastro, Edição, Desativação)
-- Execute este script no Supabase SQL Editor do projeto sqncxfboizrudyetetxi
-- ==============================================================================

-- 1. Adicionar coluna is_active em products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- 2. Função: criar ou atualizar produto
CREATE OR REPLACE FUNCTION create_or_update_product(
  p_id              UUID,
  p_name            TEXT,
  p_category        TEXT,
  p_unit            TEXT,
  p_current_stock   NUMERIC,
  p_min_stock_alert NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  IF p_id IS NULL THEN
    -- CREATE
    INSERT INTO products (name, category, unit, current_stock, min_stock_alert, is_active)
    VALUES (p_name, p_category, p_unit, p_current_stock, p_min_stock_alert, true)
    RETURNING id INTO v_product_id;

    IF p_current_stock > 0 THEN
      INSERT INTO stock_movements (product_id, type, quantity, reason)
      VALUES (v_product_id, 'ENTRADA_MANUAL', p_current_stock, 'Estoque inicial no cadastro do produto');
    END IF;

    RETURN jsonb_build_object('success', true, 'product_id', v_product_id, 'action', 'created');
  ELSE
    -- UPDATE (não altera current_stock — use restock_product para isso)
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
$$;

-- 3. Função: desativar produto (soft-delete) com opção de força
CREATE OR REPLACE FUNCTION deactivate_product(
  p_product_id UUID,
  p_force      BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conflict_count INT;
  v_conflict_orders UUID[];
BEGIN
  SELECT COUNT(DISTINCT o.id), ARRAY_AGG(DISTINCT o.id)
  INTO v_conflict_count, v_conflict_orders
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p_product_id
    AND o.status IN ('ABERTO', 'EM_ANALISE');

  IF v_conflict_count > 0 AND NOT p_force THEN
    RETURN jsonb_build_object(
      'success',        false,
      'code',           'CONFLICT_ORDERS',
      'conflict_count', v_conflict_count,
      'error',          'Produto presente em pedidos abertos ou em análise.'
    );
  END IF;

  IF v_conflict_count > 0 AND p_force THEN
    UPDATE order_items
    SET
      approved_qty     = 0,
      reduction_reason = 'Produto inativado pelo depósito: item removido automaticamente do pedido.'
    WHERE product_id = p_product_id
      AND order_id = ANY(v_conflict_orders);
  END IF;

  UPDATE products SET is_active = false WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'success',         true,
    'product_id',      p_product_id,
    'forced',          p_force,
    'affected_orders', COALESCE(v_conflict_count, 0)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. Função: reativar produto
CREATE OR REPLACE FUNCTION reactivate_product(
  p_product_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products SET is_active = true WHERE id = p_product_id;
  RETURN jsonb_build_object('success', true, 'product_id', p_product_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
