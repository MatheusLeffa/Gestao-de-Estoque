-- ==============================================================================
-- Teste da migration 20261029010000_state_machine_guard.sql
--
-- Seguro para rodar em produção: tudo acontece num único bloco DO que termina com
-- RAISE EXCEPTION proposital, então NADA é gravado. O resultado vem na mensagem
-- de erro: "RESULTADO: N falha(s)" seguido de uma linha por verificação.
--
-- Rodar no SQL Editor do Supabase (como postgres), depois de aplicar a migration.
-- ==============================================================================

DO $test$
DECLARE
  v_log      text := '';
  v_fail     int  := 0;
  r          jsonb;
  v_rest     uuid;
  v_order    uuid;
  v_order2   uuid;
  v_status   text;
  v_cnt      int;
  v_extra    text;
  v_missing  text;
  v_ok       boolean;
BEGIN
  CREATE TEMP TABLE _t (n serial, ok boolean, name text) ON COMMIT DROP;

  -- 1. Matriz: os 81 pares contra a lista esperada (state-machine.md seção 3) ----------
  CREATE TEMP TABLE _expected (from_s text, to_s text) ON COMMIT DROP;
  INSERT INTO _expected VALUES
    ('ABERTO', 'EM_ANALISE'), ('ABERTO', 'CANCELADO'),
    ('EM_ANALISE', 'EM_TRANSITO'), ('EM_ANALISE', 'EM_ATRASO'),
    ('EM_ANALISE', 'CANCELAMENTO_PENDENTE'), ('EM_ANALISE', 'CANCELADO'),
    ('EM_ATRASO', 'EM_ANALISE'), ('EM_ATRASO', 'EM_TRANSITO'),
    ('EM_ATRASO', 'CANCELAMENTO_PENDENTE'), ('EM_ATRASO', 'CANCELADO'),
    ('CANCELAMENTO_PENDENTE', 'CANCELADO'), ('CANCELAMENTO_PENDENTE', 'EM_ANALISE'),
    ('EM_TRANSITO', 'CONCLUIDO_TOTAL'), ('EM_TRANSITO', 'CONCLUIDO_PARCIAL'),
    ('EM_TRANSITO', 'CONCLUIDO_NAO_ENTREGUE'), ('EM_TRANSITO', 'EM_ATRASO'),
    ('EM_TRANSITO', 'CANCELADO');

  SELECT string_agg(f || '→' || t, ', ') INTO v_extra
  FROM unnest(private.order_statuses()) f, unnest(private.order_statuses()) t
  WHERE private.is_valid_transition(f, t)
    AND NOT EXISTS (SELECT 1 FROM _expected e WHERE e.from_s = f AND e.to_s = t);
  SELECT string_agg(from_s || '→' || to_s, ', ') INTO v_missing
  FROM _expected e WHERE NOT private.is_valid_transition(e.from_s, e.to_s);
  SELECT count(*) INTO v_cnt
  FROM unnest(private.order_statuses()) f, unnest(private.order_statuses()) t
  WHERE private.is_valid_transition(f, t);

  INSERT INTO _t (ok, name) VALUES
    (array_length(private.order_statuses(), 1) = 9, 'são 9 status'),
    (v_extra IS NULL,   'nenhum par aceito fora da matriz' || coalesce(' (sobrando: ' || v_extra || ')', '')),
    (v_missing IS NULL, 'todos os pares da matriz aceitos' || coalesce(' (faltando: ' || v_missing || ')', '')),
    (v_cnt = 17,        'exatamente 17 transições válidas entre os 81 pares'),
    (NOT private.is_valid_transition('EM_ATRASO', 'EM_ATRASO'), 'sem autotransição (EM_ATRASO → EM_ATRASO)'),
    (NOT private.is_valid_transition('CANCELADO', 'ABERTO'),    'estado final não sai (CANCELADO → ABERTO)'),
    (NOT private.is_valid_transition(NULL, 'ABERTO'),           'origem nula → falso'),
    (NOT private.is_valid_transition('XYZ', 'ABERTO'),          'origem desconhecida → falso');

  -- 2. RPC num pedido descartável (sem itens: não mexe em saldo) ------------------------
  SELECT id INTO v_rest FROM restaurants ORDER BY created_at LIMIT 1;
  IF v_rest IS NULL THEN
    INSERT INTO restaurants (name) VALUES ('__teste_maquina_estados') RETURNING id INTO v_rest;
  END IF;
  INSERT INTO orders (restaurant_id, status, notes) VALUES (v_rest, 'ABERTO', '__teste_maquina_estados')
  RETURNING id INTO v_order;

  r := private.transition_order_status(v_order, 'EM_TRANSITO');
  SELECT status INTO v_status FROM orders WHERE id = v_order;
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_TRANSITION' AND v_status = 'ABERTO',
    'ABERTO → EM_TRANSITO (pular a triagem) → INVALID_TRANSITION, pedido intacto');

  r := private.transition_order_status(v_order, 'XYZ');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_STATUS', 'status inventado XYZ → INVALID_STATUS');
  r := private.transition_order_status(v_order, NULL);
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_STATUS', 'status nulo → INVALID_STATUS');

  r := private.transition_order_status(v_order, 'EM_ANALISE');
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean, 'ABERTO → EM_ANALISE aceito');

  r := private.transition_order_status(v_order, 'ABERTO');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_TRANSITION', 'EM_ANALISE → ABERTO (voltar) → INVALID_TRANSITION');

  r := private.transition_order_status(v_order, 'EM_TRANSITO');
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean, 'EM_ANALISE → EM_TRANSITO aceito');

  r := private.transition_order_status(v_order, 'EM_ANALISE');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_TRANSITION', 'EM_TRANSITO → EM_ANALISE → INVALID_TRANSITION');
  r := private.transition_order_status(v_order, 'ABERTO');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_TRANSITION', 'EM_TRANSITO → ABERTO → INVALID_TRANSITION');

  r := private.transition_order_status(v_order, 'CONCLUIDO_TOTAL');
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean, 'EM_TRANSITO → CONCLUIDO_TOTAL aceito');

  r := private.transition_order_status(v_order, 'CANCELADO');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'TERMINAL_STATE', 'estado final continua respondendo TERMINAL_STATE');
  r := private.transition_order_status(v_order, 'XYZ');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_STATUS', 'status inventado vem antes de TERMINAL_STATE');

  r := private.transition_order_status(gen_random_uuid(), 'EM_ANALISE');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'ORDER_NOT_FOUND', 'pedido inexistente → ORDER_NOT_FOUND');

  -- Recusa de cancelamento (decisão D1)
  INSERT INTO orders (restaurant_id, status, notes) VALUES (v_rest, 'CANCELAMENTO_PENDENTE', '__teste_maquina_estados')
  RETURNING id INTO v_order2;
  r := private.transition_order_status(v_order2, 'EM_ANALISE');
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean, 'CANCELAMENTO_PENDENTE → EM_ANALISE (recusar) aceito');

  SELECT count(*) INTO v_cnt FROM order_status_logs WHERE order_id = v_order;
  INSERT INTO _t (ok, name) VALUES (v_cnt = 3, 'só as 3 transições aceitas geraram log (as recusadas não)');

  -- 3. CHECK em orders.status ----------------------------------------------------------
  BEGIN
    UPDATE orders SET status = 'XYZ' WHERE id = v_order2;
    v_ok := false;
  EXCEPTION WHEN check_violation THEN
    v_ok := true;
  END;
  INSERT INTO _t (ok, name) VALUES (v_ok, 'UPDATE direto para XYZ barrado pelo CHECK');

  SELECT convalidated INTO v_ok FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_status_check';
  INSERT INTO _t (ok, name) VALUES (coalesce(v_ok, false), 'CHECK orders_status_check existe e está validado');

  -- 4. Segurança -----------------------------------------------------------------------
  r := public.transition_order_status(v_order2, 'EM_TRANSITO');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'UNAUTHENTICATED', 'RPC pública sem sessão → UNAUTHENTICATED');

  INSERT INTO _t (ok, name) VALUES
    (NOT has_function_privilege('authenticated', 'private.is_valid_transition(text, text)', 'EXECUTE'),
     'authenticated não executa private.is_valid_transition'),
    (NOT has_function_privilege('authenticated', 'private.transition_order_status(uuid, text, text, text, jsonb)', 'EXECUTE'),
     'authenticated não executa private.transition_order_status'),
    (has_function_privilege('authenticated', 'public.transition_order_status(uuid, text, text, text, jsonb)', 'EXECUTE'),
     'authenticated continua executando public.transition_order_status');

  -- Resultado ----------------------------------------------------------------------------
  SELECT count(*) FILTER (WHERE NOT coalesce(ok, false)),
         string_agg(CASE WHEN coalesce(ok, false) THEN 'OK     ' ELSE 'FALHA  ' END || name, E'\n' ORDER BY n)
  INTO v_fail, v_log
  FROM _t;

  RAISE EXCEPTION E'RESULTADO: % falha(s) — rollback proposital, nada foi gravado.\n%', v_fail, v_log;
END
$test$;
