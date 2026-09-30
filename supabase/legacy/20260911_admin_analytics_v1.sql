-- ==============================================================================
-- MIGRATION: admin_analytics_v1
-- InsumoSync — Agregações do Painel do Administrador
--
-- Cria a RPC get_admin_analytics(), fonte única das métricas do painel.
-- As definições seguem, sem desvio, docs/business-rules.md seção 6:
--   6.1 Taxa de Pontualidade   6.2 Motivos de Atraso   6.3 Desfechos de Entrega
--   6.4 Curva de Consumo       6.5 Volume no Tempo     6.6 Itens Críticos
--
-- A função é ESTRITAMENTE SOMENTE LEITURA: não executa INSERT, UPDATE ou DELETE
-- e não toca em current_stock, portanto não interfere na invariante do ledger.
-- ==============================================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- 1. get_admin_analytics — todas as agregações do painel em um único JSONB
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_admin_analytics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  -- Fuso de referência do negócio. O bucket diário da série temporal precisa
  -- seguir o dia civil do restaurante; em UTC um pedido feito às 22h cairia no
  -- dia seguinte e distorceria a leitura do intervalo.
  v_tz               CONSTANT TEXT := 'America/Sao_Paulo';
  v_today            DATE;
  v_first_day        DATE;

  -- Status terminais de entrega: base da pontualidade e dos desfechos (6.1/6.3).
  -- CANCELADO NÃO entra — pedido cancelado nunca foi entregue, logo não é nem
  -- pontual nem atrasado.
  v_delivered_states CONSTANT TEXT[] := ARRAY[
    'CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL', 'CONCLUIDO_NAO_ENTREGUE'
  ];
  -- Pedidos ainda em andamento: o desfecho ainda não existe, ficam fora da base.
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
  v_first_day := v_today - 13;  -- janela de 14 dias, inclusive hoje (6.5)

  -- ── KPIs de volume ──────────────────────────────────────────────────────────
  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (WHERE o.status = ANY (v_delivered_states))::INT,
    COUNT(*) FILTER (WHERE o.status = 'CANCELADO')::INT,
    COUNT(*) FILTER (WHERE o.status = ANY (v_in_progress))::INT
  INTO v_total_orders, v_delivered_base, v_cancelled_count, v_in_progress_cnt
  FROM orders o;

  -- ── 6.1 Taxa de pontualidade ────────────────────────────────────────────────
  -- O critério de atraso é HISTÓRICO, não do status final: o pedido é atrasado
  -- se em algum momento do ciclo passou por EM_ATRASO, verificado em
  -- order_status_logs. Pedido que atrasou e depois foi entregue continua
  -- contando como atrasado.
  -- Duas evidencias de atraso, em OR: a passagem historica por EM_ATRASO e o
  -- registro de delay_reason. Um motivo de atraso gravado ja e evidencia
  -- suficiente, mesmo quando a linha de log correspondente nao existe.
  SELECT COUNT(*)::INT
  INTO v_delayed_count
  FROM orders o
  WHERE o.status = ANY (v_delivered_states)
    AND (
      (o.delay_reason IS NOT NULL AND btrim(o.delay_reason) <> '')
      OR EXISTS (
        SELECT 1
        FROM order_status_logs l
        WHERE l.order_id = o.id
          AND l.to_status = 'EM_ATRASO'
      )
    );

  v_on_time_count := v_delivered_base - v_delayed_count;

  -- Base vazia => métrica INDEFINIDA (NULL). Devolver 100 seria enganoso: o
  -- painel precisa distinguir "nenhuma entrega ainda" de "tudo pontual".
  IF v_delivered_base = 0 THEN
    v_on_time_rate := NULL;
  ELSE
    v_on_time_rate := ROUND((v_on_time_count::NUMERIC * 100) / v_delivered_base, 1);
  END IF;

  -- ── 6.6 Itens críticos e catálogo ativo ─────────────────────────────────────
  -- Somente insumos com is_active = true: desativados não podem ser pedidos,
  -- logo não representam risco operacional.
  SELECT
    COUNT(*) FILTER (WHERE p.is_active AND p.current_stock <= p.min_stock_alert)::INT,
    COUNT(*) FILTER (WHERE p.is_active)::INT
  INTO v_critical_items, v_active_products
  FROM products p;

  -- ── 6.2 Motivos de atraso ───────────────────────────────────────────────────
  -- Distribuição por orders.delay_reason, apenas registros com motivo preenchido.
  SELECT COALESCE(jsonb_agg(t ORDER BY t.count DESC, t.reason ASC), '[]'::JSONB)
  INTO v_delay_reasons
  FROM (
    SELECT
      o.delay_reason AS reason,
      COUNT(*)::INT  AS count
    FROM orders o
    WHERE o.delay_reason IS NOT NULL
      AND btrim(o.delay_reason) <> ''
    GROUP BY o.delay_reason
  ) t;

  -- ── 6.3 Desfechos de entrega ────────────────────────────────────────────────
  -- Os três status terminais aparecem sempre, mesmo zerados, para que o gráfico
  -- do painel mantenha as mesmas fatias entre recargas.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('status', t.status, 'count', t.count) ORDER BY t.ord), '[]'::JSONB)
  INTO v_outcomes
  FROM (
    SELECT
      s.status         AS status,
      COUNT(o.id)::INT AS count,
      s.ord            AS ord
    FROM (
      VALUES
        ('CONCLUIDO_TOTAL',        1),
        ('CONCLUIDO_PARCIAL',      2),
        ('CONCLUIDO_NAO_ENTREGUE', 3)
    ) AS s(status, ord)
    LEFT JOIN orders o ON o.status = s.status
    GROUP BY s.status, s.ord
  ) t;

  -- ── 6.4 Curva de consumo de insumos (top 8) ─────────────────────────────────
  -- COALESCE(delivered_qty, approved_qty, requested_qty): nem todo fluxo preenche
  -- delivered_qty e, nesse caso, o melhor proxy do que chegou à cozinha é o que o
  -- depósito aprovou. CONCLUIDO_NAO_ENTREGUE não representa consumo e fica fora.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'product_id', t.product_id,
               'name',       t.name,
               'unit',       t.unit,
               'total',      t.total
             )
             ORDER BY t.total DESC, t.name ASC
           ),
           '[]'::JSONB
         )
  INTO v_consumption
  FROM (
    SELECT
      p.id   AS product_id,
      p.name AS name,
      p.unit AS unit,
      SUM(COALESCE(oi.delivered_qty, oi.approved_qty, oi.requested_qty))::NUMERIC AS total
    FROM order_items oi
    JOIN orders   o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.status IN ('CONCLUIDO_TOTAL', 'CONCLUIDO_PARCIAL')
    GROUP BY p.id, p.name, p.unit
    ORDER BY total DESC, p.name ASC
    LIMIT 8
  ) t;

  -- ── 6.5 Volume de pedidos no tempo (14 dias) ────────────────────────────────
  -- generate_series garante a série completa: dia sem movimento aparece com zero
  -- em vez de sumir e comprimir o eixo do gráfico.
  -- "created" conta por created_at; "completed" conta por updated_at de pedido em
  -- status terminal de entrega.
  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'day',       to_char(t.day, 'YYYY-MM-DD'),
               'created',   t.created,
               'completed', t.completed
             )
             ORDER BY t.day
           ),
           '[]'::JSONB
         )
  INTO v_timeline
  FROM (
    SELECT
      g.day::DATE AS day,
      (
        SELECT COUNT(*)::INT
        FROM orders o
        WHERE (o.created_at AT TIME ZONE v_tz)::DATE = g.day::DATE
      ) AS created,
      (
        SELECT COUNT(*)::INT
        FROM orders o
        WHERE o.status = ANY (v_delivered_states)
          AND (o.updated_at AT TIME ZONE v_tz)::DATE = g.day::DATE
      ) AS completed
    FROM generate_series(v_first_day, v_today, INTERVAL '1 day') AS g(day)
  ) t;

  RETURN jsonb_build_object(
    'success', true,
    'kpis', jsonb_build_object(
      'total_orders',      v_total_orders,
      'delivered_base',    v_delivered_base,
      'on_time_count',     v_on_time_count,
      'delayed_count',     v_delayed_count,
      'on_time_rate',      v_on_time_rate,   -- percentual 0–100; NULL quando base = 0
      'cancelled_count',   v_cancelled_count,
      'in_progress_count', v_in_progress_cnt,
      'critical_items',    v_critical_items,
      'active_products',   v_active_products
    ),
    'delay_reasons',   v_delay_reasons,
    'outcomes',        v_outcomes,
    'consumption',     v_consumption,
    'orders_timeline', v_timeline
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMENT ON FUNCTION get_admin_analytics() IS
  'Agregações do painel do Administrador (docs/business-rules.md seção 6). Somente leitura. Retorna JSONB com success, kpis, delay_reasons, outcomes, consumption e orders_timeline.';
