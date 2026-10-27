-- ==============================================================================
-- InsumoSync — Migration A: Perfis de usuário e funções de autorização
-- Fase 5.7 (docs/database-schema.md seção 4.1)
--
-- Não altera nenhuma policy nem RPC existente: o app no ar continua funcionando
-- igual. O aperto do RLS vem na Migration B (20261026010000_rls_by_role.sql).
-- ==============================================================================

-- 1. TABELA profiles (1:1 com auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text        NOT NULL CHECK (role IN ('estoque', 'restaurante', 'admin')),
  restaurant_id uuid        REFERENCES public.restaurants(id),
  full_name     text        NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_restaurante_requires_restaurant
    CHECK (role <> 'restaurante' OR restaurant_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_profiles_restaurant_id ON public.profiles USING btree (restaurant_id);

-- 2. RLS: cada usuário lê só a própria linha; ninguém escreve pelo cliente
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- 3. FUNÇÕES AUXILIARES
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active;
$function$;

CREATE OR REPLACE FUNCTION public.current_restaurant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT restaurant_id FROM public.profiles WHERE id = auth.uid() AND is_active;
$function$;

-- Retorna NULL quando o chamador tem um dos papéis exigidos; senão o JSONB de erro
-- no padrão do projeto. Uso no início de toda RPC exposta:
--   v_err := public.auth_guard(ARRAY['estoque','admin']);
--   IF v_err IS NOT NULL THEN RETURN v_err; END IF;
CREATE OR REPLACE FUNCTION public.auth_guard(p_roles text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHENTICATED',
      'error', 'Sessão ausente ou expirada. Faça login novamente.');
  END IF;

  v_role := public.current_app_role();

  IF v_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'error', 'Usuário sem perfil ativo. Procure o administrador.');
  END IF;

  IF NOT (v_role = ANY (p_roles)) THEN
    RETURN jsonb_build_object('success', false, 'code', 'FORBIDDEN',
      'error', 'Seu perfil não tem permissão para esta operação.');
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.current_app_role()        FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.current_restaurant_id()   FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.auth_guard(text[])        FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.current_app_role()        TO authenticated;
GRANT  EXECUTE ON FUNCTION public.current_restaurant_id()   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_guard(text[])        TO authenticated;
