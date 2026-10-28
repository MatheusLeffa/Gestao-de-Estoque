-- ==============================================================================
-- Teste da migration 20261029000000_purchases.sql (Compras e Notas Fiscais)
--
-- Seguro para rodar em produção: tudo acontece num único bloco DO que termina com
-- RAISE EXCEPTION proposital, então NADA é gravado. O resultado vem na mensagem
-- de erro: "RESULTADO: N falha(s)" seguido de uma linha por verificação.
--
-- Rodar no SQL Editor do Supabase (como postgres), depois de aplicar a migration.
-- As funções private.* são chamadas direto (sem sessão, auth.uid() é nulo);
-- o guard das públicas é testado à parte.
-- ==============================================================================

DO $test$
DECLARE
  v_log       text := '';
  v_fail      int  := 0;
  r           jsonb;
  v_sup       uuid;
  v_sup2      uuid;
  v_prod_a    uuid;
  v_prod_b    uuid;
  v_inv1      uuid;
  v_inv2      uuid;
  v_num       numeric;
  v_txt       text;
  v_cnt       int;
  v_ok        boolean;
  v_today     text := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD');
  v_tomorrow  text := to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date + 1, 'YYYY-MM-DD');
  v_key       text := '35261011222333000181550010000001231123456783';
BEGIN
  -- Registro de resultado: OK/FALHA + nome
  CREATE TEMP TABLE _t (n serial, ok boolean, name text) ON COMMIT DROP;

  -- 1. Validadores -----------------------------------------------------------------
  INSERT INTO _t (ok, name) VALUES
    (private.is_valid_cnpj('11222333000181'),       'CNPJ numérico válido'),
    (private.is_valid_cnpj('12ABC34501DE35'),       'CNPJ alfanumérico válido (exemplo da Receita)'),
    (NOT private.is_valid_cnpj('11222333000182'),   'CNPJ com DV errado é recusado'),
    (NOT private.is_valid_cnpj('11111111111111'),   'CNPJ com todos os dígitos iguais é recusado'),
    (private.is_valid_nfe_key(v_key),               'chave NF-e válida'),
    (NOT private.is_valid_nfe_key(left(v_key, 43) || '4'), 'chave NF-e com DV errado é recusada'),
    (NOT private.is_valid_nfe_key(left(v_key, 43)), 'chave NF-e com 43 posições é recusada'),
    (private.normalize_invoice_code('000123') = '123', 'número 000123 vira 123');

  -- 2. Fornecedores ------------------------------------------------------------------
  r := private.upsert_supplier(NULL, 'Fornecedor Teste Ltda', '11.222.333/0001-81', '(11) 4000-0000', 'Compras@Teste.com');
  v_sup := (r->>'supplier_id')::uuid;
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean AND r->>'action' = 'created', 'fornecedor criado com CNPJ mascarado');
  SELECT cnpj = '11222333000181' AND email = 'compras@teste.com' INTO v_ok FROM suppliers WHERE id = v_sup;
  INSERT INTO _t (ok, name) VALUES (v_ok, 'CNPJ salvo sem máscara e e-mail em minúsculas');

  r := private.upsert_supplier(NULL, 'Outro', '11222333000181', NULL, NULL);
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'DUPLICATE_SUPPLIER', 'CNPJ repetido → DUPLICATE_SUPPLIER');
  r := private.upsert_supplier(NULL, 'Outro', '11222333000182', NULL, NULL);
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_CNPJ', 'CNPJ inválido → INVALID_CNPJ');
  r := private.upsert_supplier(NULL, '   ', NULL, NULL, NULL);
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_PAYLOAD', 'nome vazio → INVALID_PAYLOAD');
  r := private.upsert_supplier(gen_random_uuid(), 'Fantasma', NULL, NULL, NULL);
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'SUPPLIER_NOT_FOUND', 'editar fornecedor inexistente → SUPPLIER_NOT_FOUND');

  r := private.upsert_supplier(NULL, 'Fornecedor Inativo', NULL, NULL, NULL);
  v_sup2 := (r->>'supplier_id')::uuid;
  r := private.set_supplier_active(v_sup2, false);
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean AND NOT (r->>'is_active')::boolean, 'fornecedor inativado');

  -- 3. Insumos de teste ---------------------------------------------------------------
  INSERT INTO products (name, category, unit, current_stock, min_stock_alert)
  VALUES ('__teste_compra_A', 'Mercearia & Temperos', 'L', 10, 1) RETURNING id INTO v_prod_a;
  INSERT INTO products (name, category, unit, current_stock, min_stock_alert)
  VALUES ('__teste_compra_B', 'Mercearia & Temperos', 'KG', 0, 1) RETURNING id INTO v_prod_b;

  -- 4. Validações da entrada (nada pode ser gravado) ------------------------------------
  r := private.register_purchase_entry(v_sup2,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_today),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 1, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'SUPPLIER_INACTIVE', 'fornecedor inativo → SUPPLIER_INACTIVE');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_tomorrow),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 1, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_DATE', 'emissão futura → INVALID_DATE');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', 'ontem'),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 1, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_DATE', 'data em texto inválido → INVALID_DATE');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_today), '[]'::jsonb);
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'EMPTY_INVOICE', 'nota sem itens → EMPTY_INVOICE');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_today),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 0, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_QUANTITY' AND (r->>'line')::int = 1, 'quantidade 0 → INVALID_QUANTITY na linha 1');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_today),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 1, 'unit_cost', -1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_COST', 'custo negativo → INVALID_COST');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_today),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', '5', 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_QUANTITY', 'quantidade enviada como texto → INVALID_QUANTITY');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_today, 'access_key', left(v_key, 43) || '4'),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 1, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_ACCESS_KEY', 'chave com DV errado → INVALID_ACCESS_KEY');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '1', 'issued_at', v_today, 'discount', 999),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 1, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_COST', 'desconto maior que a nota → INVALID_COST');

  SELECT count(*) INTO v_cnt FROM purchase_invoices WHERE supplier_id IN (v_sup, v_sup2);
  SELECT current_stock INTO v_num FROM products WHERE id = v_prod_a;
  INSERT INTO _t (ok, name) VALUES (v_cnt = 0 AND v_num = 10, 'validações recusadas não gravaram nada');

  -- 5. Entrada válida: 2 CX de 12 L a R$ 60 (A) + 3 KG a R$ 10 (B), frete 5, desconto 2
  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '000123', 'series', '001', 'issued_at', v_today,
                            'access_key', v_key, 'freight', 5, 'discount', 2, 'xml_total', 153),
         jsonb_build_array(
           jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 2, 'conversion_factor', 12, 'unit_cost', 60,
                              'supplier_code', 'AZ-12', 'description', 'AZEITE CX 12X1L', 'invoice_unit', 'cx'),
           jsonb_build_object('product_id', v_prod_b, 'invoice_qty', 3, 'unit_cost', 10)));
  v_inv1 := (r->>'invoice_id')::uuid;
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean, 'entrada válida lançada: ' || coalesce(r->>'error', 'ok'));
  INSERT INTO _t (ok, name) VALUES ((r->>'items_total')::numeric = 150 AND (r->>'total_amount')::numeric = 153,
                         'totais: itens 150, nota 153 (150 + 5 − 2)');

  SELECT current_stock INTO v_num FROM products WHERE id = v_prod_a;
  INSERT INTO _t (ok, name) VALUES (v_num = 34, 'A: 10 + 2 × 12 = 34 L');
  SELECT current_stock INTO v_num FROM products WHERE id = v_prod_b;
  INSERT INTO _t (ok, name) VALUES (v_num = 3, 'B: 0 + 3 = 3 KG');

  SELECT average_cost INTO v_num FROM product_costs WHERE product_id = v_prod_a;
  INSERT INTO _t (ok, name) VALUES (v_num = 5, 'custo médio A = 60 / 12 = 5 (sem médio anterior)');
  SELECT average_cost INTO v_num FROM product_costs WHERE product_id = v_prod_b;
  INSERT INTO _t (ok, name) VALUES (v_num = 10, 'custo médio B = 10 (saldo anterior zero)');

  SELECT invoice_number = '123' AND series = '1' INTO v_ok FROM purchase_invoices WHERE id = v_inv1;
  INSERT INTO _t (ok, name) VALUES (v_ok, 'número e série sem zeros à esquerda');

  SELECT count(*) INTO v_cnt FROM stock_movements WHERE purchase_invoice_id = v_inv1 AND type = 'ENTRADA_COMPRA';
  INSERT INTO _t (ok, name) VALUES (v_cnt = 2, 'duas movimentações ENTRADA_COMPRA ligadas à nota');

  SELECT product_id = v_prod_a AND conversion_factor = 12 INTO v_ok
  FROM supplier_product_links WHERE supplier_id = v_sup AND supplier_code = 'AZ-12';
  INSERT INTO _t (ok, name) VALUES (coalesce(v_ok, false), 'de-para AZ-12 → insumo A com fator 12 memorizado');

  SELECT invoice_unit = 'CX' INTO v_ok FROM purchase_invoice_items WHERE invoice_id = v_inv1 AND line_number = 1;
  INSERT INTO _t (ok, name) VALUES (v_ok, 'unidade da nota salva em maiúsculas');

  -- 6. Duplicidade --------------------------------------------------------------------
  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '123', 'series', '1', 'issued_at', v_today),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_b, 'invoice_qty', 1, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'DUPLICATE_INVOICE' AND (r->>'invoice_id')::uuid = v_inv1,
                         'mesmo número/série → DUPLICATE_INVOICE apontando a nota existente');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '999', 'issued_at', v_today, 'access_key', v_key),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_b, 'invoice_qty', 1, 'unit_cost', 1)));
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'DUPLICATE_INVOICE', 'mesma chave de acesso → DUPLICATE_INVOICE');

  -- 7. Segunda entrada de A: 6 L a R$ 8 → médio (34 × 5 + 6 × 8) / 40 = 5,45
  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '124', 'issued_at', v_today),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 6, 'unit_cost', 8)));
  v_inv2 := (r->>'invoice_id')::uuid;
  SELECT average_cost, last_cost INTO v_num, v_txt FROM product_costs WHERE product_id = v_prod_a;
  INSERT INTO _t (ok, name) VALUES (v_num = 5.45 AND v_txt::numeric = 8, 'custo médio A = 5,45 e último custo = 8');

  -- 8. Invariante das compras (business-rules 10.7) -----------------------------------
  SELECT bool_and(mov = inv) INTO v_ok FROM (
    SELECT p.id,
      coalesce((SELECT sum(quantity) FROM stock_movements
                WHERE product_id = p.id AND type IN ('ENTRADA_COMPRA', 'ESTORNO_COMPRA')), 0) AS mov,
      coalesce((SELECT sum(it.stock_qty) FROM purchase_invoice_items it
                JOIN purchase_invoices pi ON pi.id = it.invoice_id
                WHERE it.product_id = p.id AND pi.status = 'LANCADA'), 0) AS inv
    FROM products p WHERE p.id IN (v_prod_a, v_prod_b)) x;
  INSERT INTO _t (ok, name) VALUES (v_ok, 'invariante: movimentos de compra = stock_qty das notas lançadas');

  -- 9. Estorno ----------------------------------------------------------------------
  r := private.reverse_purchase_entry(v_inv2, '  ');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'REASON_REQUIRED', 'estorno sem motivo → REASON_REQUIRED');

  r := private.reverse_purchase_entry(v_inv2, 'Quantidade ou insumo errado');
  SELECT current_stock INTO v_num FROM products WHERE id = v_prod_a;
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean AND v_num = 34, 'estorno da nota 124 devolve A para 34');
  SELECT average_cost INTO v_num FROM product_costs WHERE product_id = v_prod_a;
  INSERT INTO _t (ok, name) VALUES (v_num = 5.45, 'estorno não recalcula o custo médio (limitação documentada)');

  r := private.reverse_purchase_entry(v_inv2, 'de novo');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'ALREADY_REVERSED', 'segundo estorno → ALREADY_REVERSED');

  r := private.register_purchase_entry(v_sup,
         jsonb_build_object('invoice_number', '124', 'issued_at', v_today),
         jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'invoice_qty', 5, 'unit_cost', 8)));
  INSERT INTO _t (ok, name) VALUES ((r->>'success')::boolean, 'nota estornada pode ser lançada de novo, corrigida');

  -- Saldo insuficiente: simula que A saiu para os restaurantes
  UPDATE products SET current_stock = 1 WHERE id = v_prod_a;
  r := private.reverse_purchase_entry(v_inv1, 'Nota lançada em duplicidade');
  SELECT current_stock INTO v_num FROM products WHERE id = v_prod_b;
  SELECT status INTO v_txt FROM purchase_invoices WHERE id = v_inv1;
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INSUFFICIENT_STOCK' AND (r->>'product_id')::uuid = v_prod_a
                         AND v_num = 3 AND v_txt = 'LANCADA',
                         'estorno sem saldo → INSUFFICIENT_STOCK, sem mexer em B nem na nota');

  -- 10. Anexos -------------------------------------------------------------------------
  r := private.attach_purchase_file(v_inv1, v_inv1 || '/nota.pdf', 'PDF');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'FILE_NOT_FOUND', 'anexo sem arquivo no Storage → FILE_NOT_FOUND');
  r := private.attach_purchase_file(v_inv1, v_inv2 || '/nota.pdf', 'PDF');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_PAYLOAD', 'anexo fora da pasta da nota → INVALID_PAYLOAD');
  r := private.attach_purchase_file(v_inv1, v_inv1 || '/nota.doc', 'DOC');
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'INVALID_PAYLOAD', 'tipo de anexo inválido → INVALID_PAYLOAD');

  -- 11. Segurança --------------------------------------------------------------------
  r := public.register_purchase_entry(v_sup, '{}'::jsonb, '[]'::jsonb);
  INSERT INTO _t (ok, name) VALUES (r->>'code' = 'UNAUTHENTICATED', 'RPC pública sem sessão → UNAUTHENTICATED');

  INSERT INTO _t (ok, name) VALUES
    (NOT has_function_privilege('authenticated', 'private.register_purchase_entry(uuid, jsonb, jsonb)', 'EXECUTE'),
     'authenticated não executa private.register_purchase_entry'),
    (NOT has_function_privilege('anon', 'public.register_purchase_entry(uuid, jsonb, jsonb)', 'EXECUTE'),
     'anon não executa public.register_purchase_entry'),
    (has_function_privilege('authenticated', 'public.reverse_purchase_entry(uuid, text)', 'EXECUTE'),
     'authenticated executa public.reverse_purchase_entry'),
    (NOT has_table_privilege('authenticated', 'public.purchase_invoices', 'INSERT'),
     'authenticated não insere direto em purchase_invoices'),
    (NOT has_table_privilege('anon', 'public.product_costs', 'SELECT'),
     'anon não lê product_costs');

  SELECT count(*) INTO v_cnt FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('suppliers', 'purchase_invoices', 'purchase_invoice_items',
                     'purchase_invoice_files', 'supplier_product_links', 'product_costs');
  INSERT INTO _t (ok, name) VALUES (v_cnt = 6, 'uma policy de leitura em cada uma das 6 tabelas');

  SELECT NOT public INTO v_ok FROM storage.buckets WHERE id = 'purchase-invoices';
  INSERT INTO _t (ok, name) VALUES (coalesce(v_ok, false), 'bucket purchase-invoices existe e é privado');

  -- Resultado ----------------------------------------------------------------------------
  SELECT count(*) FILTER (WHERE NOT coalesce(ok, false)),
         string_agg(CASE WHEN coalesce(ok, false) THEN 'OK     ' ELSE 'FALHA  ' END || name, E'\n' ORDER BY n)
  INTO v_fail, v_log
  FROM _t;

  RAISE EXCEPTION E'RESULTADO: % falha(s) — rollback proposital, nada foi gravado.\n%', v_fail, v_log;
END
$test$;
