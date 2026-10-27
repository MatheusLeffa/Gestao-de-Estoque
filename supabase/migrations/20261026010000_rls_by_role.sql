-- ==============================================================================
-- InsumoSync — Migration B: RLS por papel e auth_guard nas RPCs
-- Fase 5.7 (docs/database-schema.md seções 4.2 e 4.3)
--
-- ⚠️ APLICAR SOMENTE DEPOIS de:
--   1. Migration A (20261026000000_auth_profiles.sql) aplicada;
--   2. usuários admin, estoque e restaurante criados com perfil ativo;
--   3. front com login no ar e testado com os três papéis.
-- A partir daqui, acesso sem login deixa de funcionar.
--
-- Rode a query de invariante de estoque (CLAUDE.md §4) ANTES e DEPOIS e compare:
-- esta migration não toca current_stock nem approved_qty.
--
-- Estratégia: as 12 RPCs vão, sem alteração de corpo, para o schema `private`
-- (não exposto pela API). No `public` ficam funções finas com a mesma assinatura,
-- que chamam auth_guard, aplicam a regra extra e delegam. Rollback no fim do arquivo.
-- ==============================================================================

BEGIN;

-- 1. SCHEMA PRIVADO -------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;

ALTER FUNCTION public.apply_order_triage(uuid, jsonb, text)                                        SET SCHEMA private;
ALTER FUNCTION public.check_product_usage(uuid)                                                    SET SCHEMA private;
ALTER FUNCTION public.create_or_update_product(uuid, text, text, text, numeric, numeric, text)     SET SCHEMA private;
ALTER FUNCTION public.deactivate_product(uuid, boolean)                                            SET SCHEMA private;
ALTER FUNCTION public.delete_product(uuid)                                                         SET SCHEMA private;
ALTER FUNCTION public.get_admin_analytics()                                                        SET SCHEMA private;
ALTER FUNCTION public.get_restaurant_recommendations(uuid, integer)                                SET SCHEMA private;
ALTER FUNCTION public.get_stock_forecasting(integer)                                               SET SCHEMA private;
ALTER FUNCTION public.place_order_with_reservation(uuid, jsonb, text)                              SET SCHEMA private;
ALTER FUNCTION public.reactivate_product(uuid)                                                     SET SCHEMA private;
ALTER FUNCTION public.restock_product(uuid, numeric, text)                                         SET SCHEMA private;
ALTER FUNCTION public.transition_order_status(uuid, text, text, text)                              SET SCHEMA private;

-- search_path fixo: as tabelas continuam em public, e a chamada sem schema de
-- deactivate_product → transition_order_status resolve para a função pública (com guard).
ALTER FUNCTION private.apply_order_triage(uuid, jsonb, text)                                    SET search_path = public;
ALTER FUNCTION private.check_product_usage(uuid)                                                SET search_path = public;
ALTER FUNCTION private.create_or_update_product(uuid, text, text, text, numeric, numeric, text) SET search_path = public;
ALTER FUNCTION private.deactivate_product(uuid, boolean)                                        SET search_path = public;
ALTER FUNCTION private.delete_product(uuid)                                                     SET search_path = public;
ALTER FUNCTION private.get_admin_analytics()                                                    SET search_path = public;
ALTER FUNCTION private.get_restaurant_recommendations(uuid, integer)                            SET search_path = public;
ALTER FUNCTION private.get_stock_forecasting(integer)                                           SET search_path = public;
ALTER FUNCTION private.place_order_with_reservation(uuid, jsonb, text)                          SET search_path = public;
ALTER FUNCTION private.reactivate_product(uuid)                                                 SET search_path = public;
ALTER FUNCTION private.restock_product(uuid, numeric, text)                                     SET search_path = public;
ALTER FUNCTION private.transition_order_status(uuid, text, text, text)                          SET search_path = public;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM public, anon, authenticated;

-- 2. RPCs PÚBLICAS COM GUARD ----------------------------------------------------

-- 2.1 Restaurante (admin também opera a área /restaurante)
CREATE FUNCTION public.place_order_with_reservation(p_restaurant_id uuid, p_items jsonb, p_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['restaurante', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;

  IF public.current_app_role() = 'restaurante' AND p_restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'error', 'Você só pode fazer pedidos para o seu próprio restaurante.');
  END IF;

  RETURN private.place_order_with_reservation(p_restaurant_id, p_items, p_notes);
END;
$function$;

CREATE FUNCTION public.get_restaurant_recommendations(p_restaurant_id uuid, p_days_window integer DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['restaurante', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;

  IF public.current_app_role() = 'restaurante' AND p_restaurant_id IS DISTINCT FROM public.current_restaurant_id() THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'error', 'Você só pode consultar sugestões do seu próprio restaurante.');
  END IF;

  RETURN private.get_restaurant_recommendations(p_restaurant_id, p_days_window);
END;
$function$;

-- 2.2 Transições: matriz de docs/state-machine.md seção 4
CREATE FUNCTION public.transition_order_status(p_order_id uuid, p_new_status text, p_reason text DEFAULT NULL::text, p_completion_type text DEFAULT NULL::text)
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

  RETURN private.transition_order_status(p_order_id, p_new_status, p_reason, p_completion_type);
END;
$function$;

-- 2.3 Depósito
CREATE FUNCTION public.apply_order_triage(p_order_id uuid, p_items jsonb, p_deposit_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.apply_order_triage(p_order_id, p_items, p_deposit_notes);
END;
$function$;

CREATE FUNCTION public.restock_product(p_product_id uuid, p_quantity numeric, p_reason text DEFAULT 'Entrada manual no depósito'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.restock_product(p_product_id, p_quantity, p_reason);
END;
$function$;

CREATE FUNCTION public.create_or_update_product(p_id uuid, p_name text, p_category text, p_unit text, p_current_stock numeric, p_min_stock_alert numeric, p_image_url text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.create_or_update_product(p_id, p_name, p_category, p_unit, p_current_stock, p_min_stock_alert, p_image_url);
END;
$function$;

CREATE FUNCTION public.deactivate_product(p_product_id uuid, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.deactivate_product(p_product_id, p_force);
END;
$function$;

CREATE FUNCTION public.reactivate_product(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.reactivate_product(p_product_id);
END;
$function$;

CREATE FUNCTION public.delete_product(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.delete_product(p_product_id);
END;
$function$;

CREATE FUNCTION public.check_product_usage(p_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.check_product_usage(p_product_id);
END;
$function$;

CREATE FUNCTION public.get_stock_forecasting(p_days_window integer DEFAULT 14)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.get_stock_forecasting(p_days_window);
END;
$function$;

-- 2.4 Administrador
CREATE FUNCTION public.get_admin_analytics()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.get_admin_analytics();
END;
$function$;

-- 2.5 Execução só para authenticated
DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.apply_order_triage(uuid, jsonb, text)',
    'public.check_product_usage(uuid)',
    'public.create_or_update_product(uuid, text, text, text, numeric, numeric, text)',
    'public.deactivate_product(uuid, boolean)',
    'public.delete_product(uuid)',
    'public.get_admin_analytics()',
    'public.get_restaurant_recommendations(uuid, integer)',
    'public.get_stock_forecasting(integer)',
    'public.place_order_with_reservation(uuid, jsonb, text)',
    'public.reactivate_product(uuid)',
    'public.restock_product(uuid, numeric, text)',
    'public.transition_order_status(uuid, text, text, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
  END LOOP;
END $$;

-- 3. RLS DAS TABELAS ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read access to restaurants"   ON public.restaurants;
DROP POLICY IF EXISTS "Allow public read access to products"      ON public.products;
DROP POLICY IF EXISTS "Allow public manage products"              ON public.products;
DROP POLICY IF EXISTS "Allow public manage orders"                ON public.orders;
DROP POLICY IF EXISTS "Allow public manage order_items"           ON public.order_items;
DROP POLICY IF EXISTS "Allow public manage order_status_logs"     ON public.order_status_logs;
DROP POLICY IF EXISTS "Allow public manage stock_movements"       ON public.stock_movements;

CREATE POLICY "products_select_by_role" ON public.products
  FOR SELECT TO authenticated
  USING ((SELECT public.current_app_role()) IS NOT NULL);

CREATE POLICY "restaurants_select_by_role" ON public.restaurants
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) IN ('estoque', 'admin')
    OR id = (SELECT public.current_restaurant_id())
  );

CREATE POLICY "orders_select_by_role" ON public.orders
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) IN ('estoque', 'admin')
    OR restaurant_id = (SELECT public.current_restaurant_id())
  );

CREATE POLICY "order_items_select_by_role" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) IN ('estoque', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.restaurant_id = (SELECT public.current_restaurant_id())
    )
  );

CREATE POLICY "order_status_logs_select_by_role" ON public.order_status_logs
  FOR SELECT TO authenticated
  USING (
    (SELECT public.current_app_role()) IN ('estoque', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_logs.order_id
        AND o.restaurant_id = (SELECT public.current_restaurant_id())
    )
  );

CREATE POLICY "stock_movements_select_by_role" ON public.stock_movements
  FOR SELECT TO authenticated
  USING ((SELECT public.current_app_role()) IN ('estoque', 'admin'));

-- Escrita só por RPC SECURITY DEFINER: nenhum privilégio de escrita para o cliente.
REVOKE ALL ON public.restaurants, public.products, public.orders, public.order_items,
              public.order_status_logs, public.stock_movements
  FROM anon, authenticated;
GRANT SELECT ON public.restaurants, public.products, public.orders, public.order_items,
                public.order_status_logs, public.stock_movements
  TO authenticated;

-- 4. STORAGE product-images: leitura pública continua; envio só estoque/admin ----
DROP POLICY IF EXISTS "Upload product-images" ON storage.objects;
DROP POLICY IF EXISTS "Update product-images" ON storage.objects;

CREATE POLICY "product-images insert by stock" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.current_app_role()) IN ('estoque', 'admin'));

CREATE POLICY "product-images update by stock" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND (SELECT public.current_app_role()) IN ('estoque', 'admin'))
  WITH CHECK (bucket_id = 'product-images' AND (SELECT public.current_app_role()) IN ('estoque', 'admin'));

COMMIT;

-- PostgREST recarrega o cache de funções e permissões
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- ROLLBACK (rodar só se algo falhar em produção; devolve o estado anterior)
-- ==============================================================================
-- BEGIN;
-- DROP FUNCTION public.apply_order_triage(uuid, jsonb, text);
-- DROP FUNCTION public.check_product_usage(uuid);
-- DROP FUNCTION public.create_or_update_product(uuid, text, text, text, numeric, numeric, text);
-- DROP FUNCTION public.deactivate_product(uuid, boolean);
-- DROP FUNCTION public.delete_product(uuid);
-- DROP FUNCTION public.get_admin_analytics();
-- DROP FUNCTION public.get_restaurant_recommendations(uuid, integer);
-- DROP FUNCTION public.get_stock_forecasting(integer);
-- DROP FUNCTION public.place_order_with_reservation(uuid, jsonb, text);
-- DROP FUNCTION public.reactivate_product(uuid);
-- DROP FUNCTION public.restock_product(uuid, numeric, text);
-- DROP FUNCTION public.transition_order_status(uuid, text, text, text);
--
-- ALTER FUNCTION private.apply_order_triage(uuid, jsonb, text)                                    SET SCHEMA public;
-- ALTER FUNCTION private.check_product_usage(uuid)                                                SET SCHEMA public;
-- ALTER FUNCTION private.create_or_update_product(uuid, text, text, text, numeric, numeric, text) SET SCHEMA public;
-- ALTER FUNCTION private.deactivate_product(uuid, boolean)                                        SET SCHEMA public;
-- ALTER FUNCTION private.delete_product(uuid)                                                     SET SCHEMA public;
-- ALTER FUNCTION private.get_admin_analytics()                                                    SET SCHEMA public;
-- ALTER FUNCTION private.get_restaurant_recommendations(uuid, integer)                            SET SCHEMA public;
-- ALTER FUNCTION private.get_stock_forecasting(integer)                                           SET SCHEMA public;
-- ALTER FUNCTION private.place_order_with_reservation(uuid, jsonb, text)                          SET SCHEMA public;
-- ALTER FUNCTION private.reactivate_product(uuid)                                                 SET SCHEMA public;
-- ALTER FUNCTION private.restock_product(uuid, numeric, text)                                     SET SCHEMA public;
-- ALTER FUNCTION private.transition_order_status(uuid, text, text, text)                          SET SCHEMA public;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
--
-- DROP POLICY "products_select_by_role"          ON public.products;
-- DROP POLICY "restaurants_select_by_role"       ON public.restaurants;
-- DROP POLICY "orders_select_by_role"            ON public.orders;
-- DROP POLICY "order_items_select_by_role"       ON public.order_items;
-- DROP POLICY "order_status_logs_select_by_role" ON public.order_status_logs;
-- DROP POLICY "stock_movements_select_by_role"   ON public.stock_movements;
-- CREATE POLICY "Allow public read access to restaurants" ON public.restaurants AS PERMISSIVE FOR SELECT TO public USING (true);
-- CREATE POLICY "Allow public read access to products" ON public.products AS PERMISSIVE FOR SELECT TO public USING (true);
-- CREATE POLICY "Allow public manage products" ON public.products AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public manage orders" ON public.orders AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public manage order_items" ON public.order_items AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public manage order_status_logs" ON public.order_status_logs AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public manage stock_movements" ON public.stock_movements AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
-- GRANT ALL ON public.restaurants, public.products, public.orders, public.order_items,
--              public.order_status_logs, public.stock_movements TO anon, authenticated;
--
-- DROP POLICY "product-images insert by stock" ON storage.objects;
-- DROP POLICY "product-images update by stock" ON storage.objects;
-- CREATE POLICY "Upload product-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images');
-- CREATE POLICY "Update product-images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images');
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
