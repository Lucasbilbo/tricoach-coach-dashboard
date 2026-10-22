-- 016_profiles_campos_protegidos.sql — el usuario no puede tocar campos de
-- sistema de su perfil (auditoría 2026-10-22)
--
-- Problema: las RLS de `profiles` solo comprueban que la fila sea la tuya, no QUÉ
-- columnas cambias. Con la anon key (pública) y su sesión, cualquier usuario podía
-- ponerse `plan = 'pro'` (el backend de TriCoach se fía de ese campo para el Pro:
-- mensajes ilimitados, Strava, informes), o tocar stripe_customer_id, deleted_at,
-- los contadores de límites… La tabla es compartida (este panel + TriCoach v2).
--
-- Arreglo: trigger BEFORE INSERT/UPDATE que, cuando quien escribe es un usuario
-- (PostgREST hace SET ROLE authenticated/anon), mantiene esos campos como estaban
-- (UPDATE) o con su valor de alta (INSERT). Silencioso a propósito: ninguna
-- pantalla de TriCoach escribe estos campos desde el navegador (revisado en el
-- repo: solo crea el perfil con plan 'free'), así que no rompe nada; un intento
-- de abuso simplemente no tiene efecto. El backend (service_role) y las funciones
-- SECURITY DEFINER (accept_invitation, increment_messages_today: corren como su
-- dueño) siguen pudiendo escribirlos.
--
-- Además se limpian las RLS: había 6 políticas solapadas (una ALL que también
-- dejaba BORRAR tu perfil, sin uso: TriCoach borra cuentas desde el servidor) →
-- 3 políticas, solo para authenticated, con (select auth.uid()) (advisor
-- auth_rls_initplan). Leer tu propia fila no cambia (TriCoach hace select('*')).

BEGIN;

CREATE OR REPLACE FUNCTION public.profiles_proteger_campos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Solo restringe a los usuarios (vía PostgREST). service_role, postgres y las
  -- funciones SECURITY DEFINER pasan sin tocar.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.plan := 'free';
    NEW.stripe_customer_id := NULL;
    NEW.messages_today := 0;
    NEW.last_message_date := NULL;
    NEW.ajustes_hoy := 0;
    NEW.ultima_fecha_ajuste := NULL;
    NEW.deleted_at := NULL;
    NEW.created_at := now();
  ELSE
    NEW.id := OLD.id;
    NEW.plan := OLD.plan;
    NEW.stripe_customer_id := OLD.stripe_customer_id;
    NEW.messages_today := OLD.messages_today;
    NEW.last_message_date := OLD.last_message_date;
    NEW.ajustes_hoy := OLD.ajustes_hoy;
    NEW.ultima_fecha_ajuste := OLD.ultima_fecha_ajuste;
    NEW.deleted_at := OLD.deleted_at;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_proteger_campos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_proteger_campos ON public.profiles;
CREATE TRIGGER profiles_proteger_campos
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_proteger_campos();

-- ── RLS: de 6 políticas solapadas a 3 ───────────────────────────────────────
DROP POLICY IF EXISTS "Usuario ve su perfil" ON public.profiles;
DROP POLICY IF EXISTS "usuarios pueden ver su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "usuarios pueden crear su perfil" ON public.profiles;
DROP POLICY IF EXISTS "usuarios pueden actualizar su perfil" ON public.profiles;

CREATE POLICY "usuario ve su perfil" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));
CREATE POLICY "usuario crea su perfil" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));
CREATE POLICY "usuario edita su perfil" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ────────────────────────────────
-- select policyname, cmd, roles from pg_policies where tablename = 'profiles';
-- select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal;
