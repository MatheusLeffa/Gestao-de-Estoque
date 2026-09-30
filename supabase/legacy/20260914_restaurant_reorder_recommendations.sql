-- ==============================================================================
-- INSUMOSYNC: Previsibilidade de Reposição para o Restaurante
-- Migration: 20260914_restaurant_reorder_recommendations.sql
-- Subagente: cloud-db-architect / backend-workflow-engine
--
-- RPC de leitura para calcular recomendações inteligentes de solicitação de
-- insumos feitas pela cozinha/restaurante para o Depósito Central.
-- ==============================================================================

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
