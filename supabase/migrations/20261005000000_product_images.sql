-- ==============================================================================
-- InsumoSync — Migration: Imagens nos Produtos & Atualização de RPC
-- Adiciona a coluna image_url em products e atualiza create_or_update_product
-- ==============================================================================

-- 1. Coluna image_url na tabela products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Bucket no Supabase Storage (se storage existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('product-images', 'product-images', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    -- Política permissiva de leitura pública
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access product-images'
    ) THEN
      CREATE POLICY "Public Access product-images" ON storage.objects
        FOR SELECT USING (bucket_id = 'product-images');
    END IF;

    -- Política de upload para usuários autenticados / anon em desenvolvimento
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Upload product-images'
    ) THEN
      CREATE POLICY "Upload product-images" ON storage.objects
        FOR INSERT WITH CHECK (bucket_id = 'product-images');
      CREATE POLICY "Update product-images" ON storage.objects
        FOR UPDATE USING (bucket_id = 'product-images');
    END IF;
  END IF;
END $$;

-- 3. Atualizar RPC create_or_update_product
DROP FUNCTION IF EXISTS public.create_or_update_product(uuid, text, text, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.create_or_update_product(
  p_id uuid,
  p_name text,
  p_category text,
  p_unit text,
  p_current_stock numeric,
  p_min_stock_alert numeric,
  p_image_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_product_id UUID;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO products (name, category, unit, current_stock, min_stock_alert, is_active, image_url)
    VALUES (
      p_name,
      p_category,
      p_unit,
      p_current_stock,
      p_min_stock_alert,
      true,
      NULLIF(p_image_url, '')
    )
    RETURNING id INTO v_product_id;

    IF p_current_stock > 0 THEN
      INSERT INTO stock_movements (product_id, type, quantity, reason)
      VALUES (v_product_id, 'ENTRADA_MANUAL', p_current_stock, 'Estoque inicial no cadastro do produto');
    END IF;

    RETURN jsonb_build_object('success', true, 'product_id', v_product_id, 'action', 'created');
  ELSE
    UPDATE products
    SET
      name            = p_name,
      category        = p_category,
      unit            = p_unit,
      min_stock_alert = p_min_stock_alert,
      image_url       = CASE
        WHEN p_image_url = '' THEN NULL
        WHEN p_image_url IS NOT NULL THEN p_image_url
        ELSE image_url
      END
    WHERE id = p_id;

    RETURN jsonb_build_object('success', true, 'product_id', p_id, 'action', 'updated');
  END IF;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
