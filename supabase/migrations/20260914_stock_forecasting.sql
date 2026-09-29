-- ==============================================================================
-- MIGRATION: stock_forecasting
-- InsumoSync — Previsibilidade de Estoque e Recomendações de Reposição
-- Author: cloud-db-architect / backend-workflow-engine
--
-- Cria a RPC get_stock_forecasting(p_days_window INT DEFAULT 14)
-- Calcula taxa de saída diária (burn rate), cobertura estimada de estoque em dias,
-- nível de criticidade e quantidade recomendada de reposição antes que o estoque acabe.
--
-- A função é ESTRITAMENTE SOMENTE LEITURA: não executa INSERT, UPDATE ou DELETE
-- e não toca em current_stock, preservando a integridade e invariante do ledger.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_stock_forecasting(p_days_window INT DEFAULT 14)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
      -- Saídas líquidas na janela:
      -- Maior valor entre o balanço de saídas de stock_movements e o total de order_items não-cancelados.
      -- Isso garante exatidão tanto em transações atômicas de tempo real quanto em dados de seed.
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
      -- Quantidade sugerida de reposição (S_alvo = (C_dia * 14) + min_stock_alert):
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

COMMENT ON FUNCTION get_stock_forecasting(INT) IS
  'Previsibilidade de estoque e recomendações de reposição baseadas na taxa de saída de insumos. Somente leitura. Retorna JSONB com success, window_days, summary e items.';
