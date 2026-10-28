-- ==============================================================================
-- InsumoSync — Compras e Notas Fiscais no Almoxarifado (Fase 7.A)
-- Regras: docs/business-rules.md seção 10 · Schema: docs/database-schema.md 2.11–2.16, RPCs 16–20
-- ADR: docs/adr/002-compras-custo-medio-e-nfe.md
--
-- Pré-requisitos: Migration B (schema `private`, auth_guard, current_app_role).
--
-- Ordem de travas em toda RPC que mexe em saldo:
--   purchase_invoices (FOR UPDATE, só no estorno) → products (FOR UPDATE, ORDER BY id)
--   → product_costs (FOR UPDATE, ORDER BY product_id)
-- É a mesma ordem produto-primeiro das RPCs de pedido, então não há deadlock cruzado.
--
-- Rode a invariante do CLAUDE.md §4 antes e depois: esta migration não altera
-- saldo nenhum por si só (só cria estrutura).
-- ==============================================================================

BEGIN;

-- 1. VALIDADORES -----------------------------------------------------------------

-- CNPJ numérico ou alfanumérico (Receita, a partir de 07/2026): valor de cada
-- caractere = ASCII − 48, que para dígitos é o próprio dígito.
CREATE FUNCTION private.is_valid_cnpj(p_cnpj text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $function$
DECLARE
  w1    int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  w2    int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum int;
  v_r   int;
  i     int;
BEGIN
  IF p_cnpj IS NULL OR p_cnpj !~ '^[0-9A-Z]{12}[0-9]{2}$' THEN
    RETURN false;
  END IF;
  IF p_cnpj = repeat(substr(p_cnpj, 1, 1), 14) THEN
    RETURN false;
  END IF;

  v_sum := 0;
  FOR i IN 1..12 LOOP
    v_sum := v_sum + (ascii(substr(p_cnpj, i, 1)) - 48) * w1[i];
  END LOOP;
  v_r := v_sum % 11;
  IF (CASE WHEN v_r < 2 THEN 0 ELSE 11 - v_r END) <> ascii(substr(p_cnpj, 13, 1)) - 48 THEN
    RETURN false;
  END IF;

  v_sum := 0;
  FOR i IN 1..13 LOOP
    v_sum := v_sum + (ascii(substr(p_cnpj, i, 1)) - 48) * w2[i];
  END LOOP;
  v_r := v_sum % 11;
  RETURN (CASE WHEN v_r < 2 THEN 0 ELSE 11 - v_r END) = ascii(substr(p_cnpj, 14, 1)) - 48;
END;
$function$;

-- Chave de acesso da NF-e: 44 posições, DV por módulo 11 (pesos 2..9 da direita).
-- Chave com letras (emitente com CNPJ alfanumérico): só o formato é verificado.
CREATE FUNCTION private.is_valid_nfe_key(p_key text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $function$
DECLARE
  v_sum int := 0;
  v_w   int := 2;
  v_r   int;
  i     int;
BEGIN
  IF p_key IS NULL OR p_key !~ '^[0-9A-Z]{43}[0-9]$' THEN
    RETURN false;
  END IF;
  IF p_key !~ '^[0-9]{44}$' THEN
    RETURN true;
  END IF;

  FOR i IN REVERSE 43..1 LOOP
    v_sum := v_sum + (ascii(substr(p_key, i, 1)) - 48) * v_w;
    v_w := CASE WHEN v_w = 9 THEN 2 ELSE v_w + 1 END;
  END LOOP;
  v_r := v_sum % 11;
  RETURN (CASE WHEN v_r < 2 THEN 0 ELSE 11 - v_r END) = ascii(substr(p_key, 44, 1)) - 48;
END;
$function$;

-- Número/série da nota: só dígitos perde os zeros à esquerda ("000123" = "123"),
-- para o XML e a digitação manual baterem na checagem de duplicidade.
CREATE FUNCTION private.normalize_invoice_code(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $function$
  SELECT CASE
    WHEN btrim(coalesce(p_value, '')) ~ '^[0-9]+$'
      THEN coalesce(nullif(ltrim(btrim(p_value), '0'), ''), '0')
    ELSE upper(btrim(coalesce(p_value, '')))
  END;
$function$;

-- 2. TABELAS ---------------------------------------------------------------------

CREATE TABLE public.suppliers (
  id         uuid        NOT NULL DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  cnpj       text,
  phone      text,
  email      text,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT suppliers_name_check CHECK (btrim(name) <> ''),
  CONSTRAINT suppliers_cnpj_check CHECK (cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$')
);
CREATE UNIQUE INDEX suppliers_cnpj_uq ON public.suppliers (cnpj) WHERE cnpj IS NOT NULL;

CREATE TABLE public.purchase_invoices (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  supplier_id     uuid        NOT NULL,
  invoice_number  text        NOT NULL,
  series          text        NOT NULL DEFAULT '',
  access_key      text,
  issued_at       date        NOT NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  items_total     numeric     NOT NULL,
  freight         numeric     NOT NULL DEFAULT 0,
  other_costs     numeric     NOT NULL DEFAULT 0,
  discount        numeric     NOT NULL DEFAULT 0,
  total_amount    numeric     NOT NULL,
  xml_total       numeric,
  status          text        NOT NULL DEFAULT 'LANCADA',
  notes           text,
  created_by      uuid        DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  reversed_at     timestamptz,
  reversed_by     uuid,
  reversal_reason text,
  CONSTRAINT purchase_invoices_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT purchase_invoices_created_by_fkey  FOREIGN KEY (created_by)  REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT purchase_invoices_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT purchase_invoices_number_check  CHECK (btrim(invoice_number) <> ''),
  CONSTRAINT purchase_invoices_key_check     CHECK (access_key ~ '^[0-9A-Z]{43}[0-9]$'),
  CONSTRAINT purchase_invoices_amounts_check CHECK (items_total >= 0 AND freight >= 0 AND other_costs >= 0
                                                    AND discount >= 0 AND total_amount >= 0),
  CONSTRAINT purchase_invoices_status_check  CHECK (status IN ('LANCADA', 'ESTORNADA')),
  CONSTRAINT purchase_invoices_reversal_check CHECK (
    (status = 'LANCADA'   AND reversed_at IS NULL)
    OR (status = 'ESTORNADA' AND reversed_at IS NOT NULL AND reversal_reason IS NOT NULL))
);
-- Duplicidade só entre notas lançadas: a estornada pode ser lançada de novo, corrigida.
CREATE UNIQUE INDEX purchase_invoices_number_uq ON public.purchase_invoices (supplier_id, series, invoice_number)
  WHERE status = 'LANCADA';
CREATE UNIQUE INDEX purchase_invoices_key_uq ON public.purchase_invoices (access_key)
  WHERE status = 'LANCADA' AND access_key IS NOT NULL;
CREATE INDEX idx_purchase_invoices_supplier_issued ON public.purchase_invoices (supplier_id, issued_at DESC);
CREATE INDEX idx_purchase_invoices_received        ON public.purchase_invoices (received_at DESC);
CREATE INDEX idx_purchase_invoices_created_by      ON public.purchase_invoices (created_by);
CREATE INDEX idx_purchase_invoices_reversed_by     ON public.purchase_invoices (reversed_by) WHERE reversed_by IS NOT NULL;

CREATE TABLE public.purchase_invoice_items (
  id                uuid    NOT NULL DEFAULT gen_random_uuid(),
  invoice_id        uuid    NOT NULL,
  line_number       int     NOT NULL,
  product_id        uuid    NOT NULL,
  supplier_code     text,
  description       text,
  invoice_unit      text,
  invoice_qty       numeric NOT NULL,
  conversion_factor numeric NOT NULL DEFAULT 1,
  stock_qty         numeric NOT NULL,
  unit_cost         numeric NOT NULL,
  total_cost        numeric NOT NULL,
  CONSTRAINT purchase_invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  CONSTRAINT purchase_invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
  CONSTRAINT purchase_invoice_items_line_uq UNIQUE (invoice_id, line_number),
  CONSTRAINT purchase_invoice_items_qty_check CHECK (invoice_qty > 0 AND conversion_factor > 0 AND stock_qty > 0),
  CONSTRAINT purchase_invoice_items_cost_check CHECK (unit_cost >= 0 AND total_cost >= 0)
);
CREATE INDEX idx_purchase_invoice_items_product ON public.purchase_invoice_items (product_id);

CREATE TABLE public.purchase_invoice_files (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  invoice_id   uuid        NOT NULL,
  storage_path text        NOT NULL,
  kind         text        NOT NULL,
  size_bytes   bigint      NOT NULL,
  uploaded_by  uuid        DEFAULT auth.uid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_invoice_files_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_invoice_files_invoice_id_fkey  FOREIGN KEY (invoice_id)  REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  CONSTRAINT purchase_invoice_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT purchase_invoice_files_path_uq UNIQUE (storage_path),
  CONSTRAINT purchase_invoice_files_kind_check CHECK (kind IN ('XML', 'PDF', 'IMAGEM'))
);
CREATE INDEX idx_purchase_invoice_files_invoice     ON public.purchase_invoice_files (invoice_id);
CREATE INDEX idx_purchase_invoice_files_uploaded_by ON public.purchase_invoice_files (uploaded_by);

CREATE TABLE public.supplier_product_links (
  supplier_id       uuid        NOT NULL,
  supplier_code     text        NOT NULL,
  product_id        uuid        NOT NULL,
  conversion_factor numeric     NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_product_links_pkey PRIMARY KEY (supplier_id, supplier_code),
  CONSTRAINT supplier_product_links_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE,
  CONSTRAINT supplier_product_links_product_id_fkey  FOREIGN KEY (product_id)  REFERENCES public.products(id)  ON DELETE CASCADE,
  CONSTRAINT supplier_product_links_factor_check CHECK (conversion_factor > 0)
);
CREATE INDEX idx_supplier_product_links_product ON public.supplier_product_links (product_id);

CREATE TABLE public.product_costs (
  product_id       uuid        NOT NULL,
  average_cost     numeric     NOT NULL,
  last_cost        numeric     NOT NULL,
  last_purchase_at timestamptz NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_costs_pkey PRIMARY KEY (product_id),
  CONSTRAINT product_costs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  CONSTRAINT product_costs_check CHECK (average_cost >= 0 AND last_cost >= 0)
);

ALTER TABLE public.stock_movements
  ADD COLUMN purchase_invoice_id uuid,
  ADD COLUMN created_by uuid,
  ADD CONSTRAINT stock_movements_purchase_invoice_id_fkey FOREIGN KEY (purchase_invoice_id)
    REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  ADD CONSTRAINT stock_movements_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_stock_movements_purchase_invoice ON public.stock_movements (purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;
CREATE INDEX idx_stock_movements_created_by       ON public.stock_movements (created_by) WHERE created_by IS NOT NULL;

-- 3. RLS: leitura só estoque/admin; escrita só por RPC ------------------------------
ALTER TABLE public.suppliers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_product_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_costs          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select_by_role" ON public.suppliers
  FOR SELECT TO authenticated USING ((SELECT public.current_app_role()) IN ('estoque', 'admin'));
CREATE POLICY "purchase_invoices_select_by_role" ON public.purchase_invoices
  FOR SELECT TO authenticated USING ((SELECT public.current_app_role()) IN ('estoque', 'admin'));
CREATE POLICY "purchase_invoice_items_select_by_role" ON public.purchase_invoice_items
  FOR SELECT TO authenticated USING ((SELECT public.current_app_role()) IN ('estoque', 'admin'));
CREATE POLICY "purchase_invoice_files_select_by_role" ON public.purchase_invoice_files
  FOR SELECT TO authenticated USING ((SELECT public.current_app_role()) IN ('estoque', 'admin'));
CREATE POLICY "supplier_product_links_select_by_role" ON public.supplier_product_links
  FOR SELECT TO authenticated USING ((SELECT public.current_app_role()) IN ('estoque', 'admin'));
CREATE POLICY "product_costs_select_by_role" ON public.product_costs
  FOR SELECT TO authenticated USING ((SELECT public.current_app_role()) IN ('estoque', 'admin'));

REVOKE ALL ON public.suppliers, public.purchase_invoices, public.purchase_invoice_items,
              public.purchase_invoice_files, public.supplier_product_links, public.product_costs
  FROM anon, authenticated;
GRANT SELECT ON public.suppliers, public.purchase_invoices, public.purchase_invoice_items,
                public.purchase_invoice_files, public.supplier_product_links, public.product_costs
  TO authenticated;

-- 4. RPCs PRIVADAS ---------------------------------------------------------------

-- 4.1 Fornecedor: cria (p_id nulo) ou edita
CREATE FUNCTION private.upsert_supplier(p_id uuid, p_name text, p_cnpj text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_cnpj text := nullif(regexp_replace(upper(coalesce(p_cnpj, '')), '[^0-9A-Z]', '', 'g'), '');
  v_dup  uuid;
  v_id   uuid;
BEGIN
  IF v_name = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD', 'error', 'Informe o nome do fornecedor.');
  END IF;

  IF v_cnpj IS NOT NULL AND NOT private.is_valid_cnpj(v_cnpj) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_CNPJ', 'error', 'CNPJ inválido. Confira os dígitos.');
  END IF;

  IF v_cnpj IS NOT NULL THEN
    SELECT id INTO v_dup FROM suppliers WHERE cnpj = v_cnpj AND id IS DISTINCT FROM p_id;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_SUPPLIER', 'supplier_id', v_dup,
        'error', 'Já existe um fornecedor com este CNPJ.');
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO suppliers (name, cnpj, phone, email)
    VALUES (v_name, v_cnpj, nullif(btrim(p_phone), ''), nullif(lower(btrim(p_email)), ''))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('success', true, 'supplier_id', v_id, 'action', 'created');
  END IF;

  UPDATE suppliers
  SET name = v_name, cnpj = v_cnpj,
      phone = nullif(btrim(p_phone), ''), email = nullif(lower(btrim(p_email)), ''),
      updated_at = now()
  WHERE id = p_id
  RETURNING id INTO v_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUPPLIER_NOT_FOUND', 'error', 'Fornecedor não encontrado.');
  END IF;

  RETURN jsonb_build_object('success', true, 'supplier_id', v_id, 'action', 'updated');
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_SUPPLIER', 'error', 'Já existe um fornecedor com este CNPJ.');
END;
$function$;

-- 4.2 Fornecedor: inativar/reativar
CREATE FUNCTION private.set_supplier_active(p_id uuid, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  UPDATE suppliers SET is_active = coalesce(p_active, true), updated_at = now() WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUPPLIER_NOT_FOUND', 'error', 'Fornecedor não encontrado.');
  END IF;
  RETURN jsonb_build_object('success', true, 'supplier_id', p_id, 'is_active', coalesce(p_active, true));
END;
$function$;

-- 4.3 Entrada por nota: valida tudo, depois trava e escreve
CREATE FUNCTION private.register_purchase_entry(p_supplier_id uuid, p_invoice jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_supplier    suppliers%ROWTYPE;
  v_number      text;
  v_series      text;
  v_key         text;
  v_issued      date;
  v_freight     numeric;
  v_other       numeric;
  v_discount    numeric;
  v_xml_total   numeric;
  v_items_total numeric := 0;
  v_total       numeric;
  v_existing    uuid;
  v_invoice_id  uuid;

  v_elem        jsonb;
  v_line        int := 0;
  v_n           int;
  v_pid_txt     text;
  v_active      boolean;
  v_pids        uuid[]    := '{}';
  v_qtys        numeric[] := '{}';
  v_factors     numeric[] := '{}';
  v_costs       numeric[] := '{}';
  v_codes       text[]    := '{}';
  v_descs       text[]    := '{}';
  v_units       text[]    := '{}';
  v_qty         numeric;
  v_factor      numeric;
  v_cost        numeric;

  v_stock       numeric;
  v_avg         numeric;
  v_stock_qty   numeric;
  v_conv_cost   numeric;
  v_new_avg     numeric;
  i             int;
BEGIN
  -- Cabeçalho -------------------------------------------------------------------
  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object'
     OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD', 'error', 'Dados da nota inválidos.');
  END IF;

  SELECT * INTO v_supplier FROM suppliers WHERE id = p_supplier_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUPPLIER_NOT_FOUND', 'error', 'Fornecedor não encontrado.');
  END IF;
  IF NOT v_supplier.is_active THEN
    RETURN jsonb_build_object('success', false, 'code', 'SUPPLIER_INACTIVE',
      'error', 'Fornecedor inativo. Reative-o antes de lançar a nota.');
  END IF;

  v_number := private.normalize_invoice_code(p_invoice->>'invoice_number');
  v_series := private.normalize_invoice_code(p_invoice->>'series');
  IF v_number = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD', 'error', 'Informe o número da nota.');
  END IF;
  -- Série vazia continua vazia (e não '0'): só normaliza quando informada
  IF btrim(coalesce(p_invoice->>'series', '')) = '' THEN
    v_series := '';
  END IF;

  v_key := nullif(regexp_replace(upper(coalesce(p_invoice->>'access_key', '')), '[^0-9A-Z]', '', 'g'), '');
  IF v_key IS NOT NULL AND NOT private.is_valid_nfe_key(v_key) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_ACCESS_KEY',
      'error', 'Chave de acesso inválida. Confira os 44 dígitos.');
  END IF;

  BEGIN
    v_issued := (p_invoice->>'issued_at')::date;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      v_issued := NULL;
  END;
  IF v_issued IS NULL OR v_issued < DATE '2000-01-01'
     OR v_issued > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_DATE',
      'error', 'Data de emissão inválida (não pode ser futura).');
  END IF;

  -- Valores opcionais: ausente/nulo = 0; presente precisa ser número >= 0
  v_freight  := CASE WHEN coalesce(jsonb_typeof(p_invoice->'freight'), 'null') = 'null' THEN 0
                     WHEN jsonb_typeof(p_invoice->'freight') = 'number' THEN (p_invoice->>'freight')::numeric
                     ELSE -1 END;
  v_other    := CASE WHEN coalesce(jsonb_typeof(p_invoice->'other_costs'), 'null') = 'null' THEN 0
                     WHEN jsonb_typeof(p_invoice->'other_costs') = 'number' THEN (p_invoice->>'other_costs')::numeric
                     ELSE -1 END;
  v_discount := CASE WHEN coalesce(jsonb_typeof(p_invoice->'discount'), 'null') = 'null' THEN 0
                     WHEN jsonb_typeof(p_invoice->'discount') = 'number' THEN (p_invoice->>'discount')::numeric
                     ELSE -1 END;
  v_xml_total := CASE WHEN jsonb_typeof(p_invoice->'xml_total') = 'number' THEN (p_invoice->>'xml_total')::numeric END;
  IF v_freight < 0 OR v_other < 0 OR v_discount < 0 OR v_xml_total < 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_COST',
      'error', 'Frete, despesas, desconto e total precisam ser números maiores ou iguais a zero.');
  END IF;

  -- Itens -----------------------------------------------------------------------
  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_line := v_line + 1;

    IF jsonb_typeof(v_elem) <> 'object' THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD', 'line', v_line,
        'error', format('Item %s da nota está em formato inválido.', v_line));
    END IF;

    v_pid_txt := v_elem->>'product_id';
    IF v_pid_txt IS NULL OR v_pid_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND', 'line', v_line,
        'error', format('Item %s: associe a linha da nota a um insumo do catálogo.', v_line));
    END IF;

    SELECT is_active INTO v_active FROM products WHERE id = v_pid_txt::uuid;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_NOT_FOUND', 'line', v_line,
        'error', format('Item %s: insumo não encontrado no catálogo.', v_line));
    END IF;
    IF NOT v_active THEN
      RETURN jsonb_build_object('success', false, 'code', 'PRODUCT_INACTIVE', 'line', v_line,
        'error', format('Item %s: o insumo está inativo. Reative-o antes de dar entrada.', v_line));
    END IF;

    IF jsonb_typeof(v_elem->'invoice_qty') IS DISTINCT FROM 'number' THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY', 'line', v_line,
        'error', format('Item %s: informe a quantidade.', v_line));
    END IF;
    v_qty := (v_elem->>'invoice_qty')::numeric;

    IF coalesce(jsonb_typeof(v_elem->'conversion_factor'), 'null') = 'null' THEN
      v_factor := 1;
    ELSIF jsonb_typeof(v_elem->'conversion_factor') = 'number' THEN
      v_factor := (v_elem->>'conversion_factor')::numeric;
    ELSE
      v_factor := 0;
    END IF;

    IF v_qty <= 0 OR v_factor <= 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_QUANTITY', 'line', v_line,
        'error', format('Item %s: quantidade e fator de conversão precisam ser maiores que zero.', v_line));
    END IF;

    IF jsonb_typeof(v_elem->'unit_cost') IS DISTINCT FROM 'number' THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_COST', 'line', v_line,
        'error', format('Item %s: informe o custo unitário.', v_line));
    END IF;
    v_cost := (v_elem->>'unit_cost')::numeric;
    IF v_cost < 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'INVALID_COST', 'line', v_line,
        'error', format('Item %s: o custo unitário não pode ser negativo.', v_line));
    END IF;

    v_pids    := v_pids    || v_pid_txt::uuid;
    v_qtys    := v_qtys    || v_qty;
    v_factors := v_factors || v_factor;
    v_costs   := v_costs   || v_cost;
    v_codes   := v_codes   || nullif(btrim(v_elem->>'supplier_code'), '');
    v_descs   := v_descs   || nullif(btrim(v_elem->>'description'), '');
    v_units   := v_units   || nullif(upper(btrim(v_elem->>'invoice_unit')), '');
    v_items_total := v_items_total + round(v_qty * v_cost, 2);
  END LOOP;

  v_n := coalesce(array_length(v_pids, 1), 0);
  IF v_n = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'EMPTY_INVOICE', 'error', 'A nota precisa de pelo menos um item.');
  END IF;

  v_total := v_items_total + v_freight + v_other - v_discount;
  IF v_total < 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_COST', 'error', 'O desconto é maior que o valor da nota.');
  END IF;

  -- Duplicidade (o índice único parcial cobre a corrida) --------------------------
  SELECT id INTO v_existing FROM purchase_invoices
  WHERE status = 'LANCADA'
    AND ((supplier_id = p_supplier_id AND series = v_series AND invoice_number = v_number)
         OR (v_key IS NOT NULL AND access_key = v_key))
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_INVOICE', 'invoice_id', v_existing,
      'error', 'Esta nota já foi lançada.');
  END IF;

  -- Escrita -----------------------------------------------------------------------
  PERFORM 1 FROM products      WHERE id         = ANY (v_pids) ORDER BY id         FOR UPDATE;
  PERFORM 1 FROM product_costs WHERE product_id = ANY (v_pids) ORDER BY product_id FOR UPDATE;

  BEGIN
    INSERT INTO purchase_invoices (supplier_id, invoice_number, series, access_key, issued_at,
                                   items_total, freight, other_costs, discount, total_amount,
                                   xml_total, notes, created_by)
    VALUES (p_supplier_id, v_number, v_series, v_key, v_issued,
            v_items_total, v_freight, v_other, v_discount, v_total,
            v_xml_total, nullif(btrim(p_invoice->>'notes'), ''), auth.uid())
    RETURNING id INTO v_invoice_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE_INVOICE', 'error', 'Esta nota já foi lançada.');
  END;

  -- Linhas em sequência: o mesmo insumo em duas linhas recalcula o médio duas vezes
  FOR i IN 1..v_n LOOP
    v_stock_qty := v_qtys[i] * v_factors[i];
    v_conv_cost := v_costs[i] / v_factors[i];

    SELECT current_stock INTO v_stock FROM products WHERE id = v_pids[i];
    SELECT average_cost INTO v_avg FROM product_costs WHERE product_id = v_pids[i];
    IF NOT FOUND OR v_stock <= 0 THEN
      v_new_avg := v_conv_cost;
    ELSE
      v_new_avg := (v_stock * v_avg + v_stock_qty * v_conv_cost) / (v_stock + v_stock_qty);
    END IF;
    v_new_avg := round(v_new_avg, 6);

    UPDATE products SET current_stock = current_stock + v_stock_qty WHERE id = v_pids[i];

    INSERT INTO product_costs (product_id, average_cost, last_cost, last_purchase_at, updated_at)
    VALUES (v_pids[i], v_new_avg, round(v_conv_cost, 6), now(), now())
    ON CONFLICT (product_id) DO UPDATE
      SET average_cost = EXCLUDED.average_cost, last_cost = EXCLUDED.last_cost,
          last_purchase_at = EXCLUDED.last_purchase_at, updated_at = now();

    INSERT INTO purchase_invoice_items (invoice_id, line_number, product_id, supplier_code, description,
                                        invoice_unit, invoice_qty, conversion_factor, stock_qty,
                                        unit_cost, total_cost)
    VALUES (v_invoice_id, i, v_pids[i], v_codes[i], v_descs[i],
            v_units[i], v_qtys[i], v_factors[i], v_stock_qty,
            v_costs[i], round(v_qtys[i] * v_costs[i], 2));

    INSERT INTO stock_movements (product_id, type, quantity, reason, purchase_invoice_id, created_by, created_at)
    VALUES (v_pids[i], 'ENTRADA_COMPRA', v_stock_qty,
            format('Compra NF %s%s — %s', v_number, CASE WHEN v_series <> '' THEN '/' || v_series ELSE '' END, v_supplier.name),
            v_invoice_id, auth.uid(), now());

    IF v_codes[i] IS NOT NULL THEN
      INSERT INTO supplier_product_links (supplier_id, supplier_code, product_id, conversion_factor, updated_at)
      VALUES (p_supplier_id, v_codes[i], v_pids[i], v_factors[i], now())
      ON CONFLICT (supplier_id, supplier_code) DO UPDATE
        SET product_id = EXCLUDED.product_id, conversion_factor = EXCLUDED.conversion_factor, updated_at = now();
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',      true,
    'invoice_id',   v_invoice_id,
    'items_total',  v_items_total,
    'total_amount', v_total,
    'items_count',  v_n
  );
END;
$function$;

-- 4.4 Anexo: o arquivo já está no Storage; aqui só é registrado na nota
CREATE FUNCTION private.attach_purchase_file(p_invoice_id uuid, p_storage_path text, p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_size bigint;
  v_id   uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM purchase_invoices WHERE id = p_invoice_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVOICE_NOT_FOUND', 'error', 'Nota não encontrada.');
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('XML', 'PDF', 'IMAGEM')
     OR p_storage_path IS NULL
     OR split_part(p_storage_path, '/', 1) <> p_invoice_id::text
     OR p_storage_path LIKE '%..%' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_PAYLOAD', 'error', 'Arquivo ou tipo de anexo inválido.');
  END IF;

  SELECT coalesce((metadata->>'size')::bigint, 0) INTO v_size
  FROM storage.objects
  WHERE bucket_id = 'purchase-invoices' AND name = p_storage_path;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'FILE_NOT_FOUND',
      'error', 'O arquivo não foi encontrado no armazenamento. Envie de novo.');
  END IF;

  INSERT INTO purchase_invoice_files (invoice_id, storage_path, kind, size_bytes, uploaded_by)
  VALUES (p_invoice_id, p_storage_path, p_kind, v_size, auth.uid())
  ON CONFLICT (storage_path) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_ATTACHED', 'error', 'Este arquivo já está anexado.');
  END IF;

  RETURN jsonb_build_object('success', true, 'file_id', v_id);
END;
$function$;

-- 4.5 Estorno: devolve exatamente o stock_qty da nota, se ainda houver saldo
CREATE FUNCTION private.reverse_purchase_entry(p_invoice_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
  v_status text;
  v_number text;
  v_series text;
  v_rec    record;
  v_count  int := 0;
BEGIN
  IF v_reason = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'REASON_REQUIRED', 'error', 'Informe o motivo do estorno.');
  END IF;

  SELECT status, invoice_number, series INTO v_status, v_number, v_series
  FROM purchase_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVOICE_NOT_FOUND', 'error', 'Nota não encontrada.');
  END IF;
  IF v_status = 'ESTORNADA' THEN
    RETURN jsonb_build_object('success', false, 'code', 'ALREADY_REVERSED', 'error', 'Esta nota já foi estornada.');
  END IF;

  PERFORM 1 FROM products
  WHERE id IN (SELECT product_id FROM purchase_invoice_items WHERE invoice_id = p_invoice_id)
  ORDER BY id FOR UPDATE;

  -- Confere todos antes de escrever qualquer um
  FOR v_rec IN
    SELECT it.product_id, p.name, p.current_stock, SUM(it.stock_qty) AS qty
    FROM purchase_invoice_items it JOIN products p ON p.id = it.product_id
    WHERE it.invoice_id = p_invoice_id
    GROUP BY it.product_id, p.name, p.current_stock
    ORDER BY it.product_id
  LOOP
    IF v_rec.current_stock < v_rec.qty THEN
      RETURN jsonb_build_object('success', false, 'code', 'INSUFFICIENT_STOCK',
        'product_id', v_rec.product_id, 'product_name', v_rec.name,
        'available', v_rec.current_stock, 'required', v_rec.qty,
        'error', format('Não há saldo de "%s" para estornar (disponível %s, nota %s).',
                        v_rec.name, v_rec.current_stock, v_rec.qty));
    END IF;
  END LOOP;

  FOR v_rec IN
    SELECT product_id, SUM(stock_qty) AS qty
    FROM purchase_invoice_items WHERE invoice_id = p_invoice_id
    GROUP BY product_id ORDER BY product_id
  LOOP
    UPDATE products SET current_stock = current_stock - v_rec.qty WHERE id = v_rec.product_id;
    INSERT INTO stock_movements (product_id, type, quantity, reason, purchase_invoice_id, created_by, created_at)
    VALUES (v_rec.product_id, 'ESTORNO_COMPRA', -v_rec.qty,
            format('Estorno da NF %s%s: %s', v_number, CASE WHEN v_series <> '' THEN '/' || v_series ELSE '' END, v_reason),
            p_invoice_id, auth.uid(), now());
    v_count := v_count + 1;
  END LOOP;

  UPDATE purchase_invoices
  SET status = 'ESTORNADA', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id, 'reversed_items', v_count);
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.is_valid_cnpj(text)                                 FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.is_valid_nfe_key(text)                              FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.normalize_invoice_code(text)                        FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.upsert_supplier(uuid, text, text, text, text)       FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.set_supplier_active(uuid, boolean)                  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.register_purchase_entry(uuid, jsonb, jsonb)         FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.attach_purchase_file(uuid, text, text)              FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.reverse_purchase_entry(uuid, text)                  FROM public, anon, authenticated;

-- 5. RPCs PÚBLICAS (guard + delegação) --------------------------------------------
CREATE FUNCTION public.upsert_supplier(p_id uuid, p_name text, p_cnpj text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.upsert_supplier(p_id, p_name, p_cnpj, p_phone, p_email);
END;
$function$;

CREATE FUNCTION public.set_supplier_active(p_id uuid, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.set_supplier_active(p_id, p_active);
END;
$function$;

CREATE FUNCTION public.register_purchase_entry(p_supplier_id uuid, p_invoice jsonb, p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.register_purchase_entry(p_supplier_id, p_invoice, p_items);
END;
$function$;

CREATE FUNCTION public.attach_purchase_file(p_invoice_id uuid, p_storage_path text, p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.attach_purchase_file(p_invoice_id, p_storage_path, p_kind);
END;
$function$;

CREATE FUNCTION public.reverse_purchase_entry(p_invoice_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE v_err jsonb;
BEGIN
  v_err := public.auth_guard(ARRAY['estoque', 'admin']);
  IF v_err IS NOT NULL THEN RETURN v_err; END IF;
  RETURN private.reverse_purchase_entry(p_invoice_id, p_reason);
END;
$function$;

DO $$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public.upsert_supplier(uuid, text, text, text, text)',
    'public.set_supplier_active(uuid, boolean)',
    'public.register_purchase_entry(uuid, jsonb, jsonb)',
    'public.attach_purchase_file(uuid, text, text)',
    'public.reverse_purchase_entry(uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
  END LOOP;
END $$;

-- 6. STORAGE: bucket privado das notas ---------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('purchase-invoices', 'purchase-invoices', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/xml', 'text/xml'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "purchase-invoices select by stock" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'purchase-invoices' AND (SELECT public.current_app_role()) IN ('estoque', 'admin'));

-- Só dentro da pasta de uma nota existente: {invoice_id}/arquivo
CREATE POLICY "purchase-invoices insert by stock" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'purchase-invoices'
    AND (SELECT public.current_app_role()) IN ('estoque', 'admin')
    AND EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id::text = (storage.foldername(name))[1]
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- ROLLBACK (só se algo falhar; a ordem respeita as chaves estrangeiras)
-- Atenção: apaga notas e anexos lançados. Antes, estorne ou exporte o que precisar.
-- ==============================================================================
-- BEGIN;
-- DROP POLICY "purchase-invoices select by stock" ON storage.objects;
-- DROP POLICY "purchase-invoices insert by stock" ON storage.objects;
-- -- Esvaziar o bucket pelo Dashboard antes de apagá-lo:
-- DELETE FROM storage.buckets WHERE id = 'purchase-invoices';
-- DROP FUNCTION public.upsert_supplier(uuid, text, text, text, text);
-- DROP FUNCTION public.set_supplier_active(uuid, boolean);
-- DROP FUNCTION public.register_purchase_entry(uuid, jsonb, jsonb);
-- DROP FUNCTION public.attach_purchase_file(uuid, text, text);
-- DROP FUNCTION public.reverse_purchase_entry(uuid, text);
-- DROP FUNCTION private.upsert_supplier(uuid, text, text, text, text);
-- DROP FUNCTION private.set_supplier_active(uuid, boolean);
-- DROP FUNCTION private.register_purchase_entry(uuid, jsonb, jsonb);
-- DROP FUNCTION private.attach_purchase_file(uuid, text, text);
-- DROP FUNCTION private.reverse_purchase_entry(uuid, text);
-- DROP FUNCTION private.is_valid_cnpj(text);
-- DROP FUNCTION private.is_valid_nfe_key(text);
-- DROP FUNCTION private.normalize_invoice_code(text);
-- ALTER TABLE public.stock_movements DROP COLUMN purchase_invoice_id, DROP COLUMN created_by;
-- DROP TABLE public.product_costs;
-- DROP TABLE public.supplier_product_links;
-- DROP TABLE public.purchase_invoice_files;
-- DROP TABLE public.purchase_invoice_items;
-- DROP TABLE public.purchase_invoices;
-- DROP TABLE public.suppliers;
-- COMMIT;
-- NOTIFY pgrst, 'reload schema';
