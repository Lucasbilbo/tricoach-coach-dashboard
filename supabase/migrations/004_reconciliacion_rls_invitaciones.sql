-- 004_reconciliacion_rls_invitaciones.sql
-- Lote S1 + F1 + F5 + S7 de la auditoría 2026-07-02.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DIVERGENCIAS DETECTADAS entre supabase/migrations/*.sql y el estado real
-- de producción (verificado contra pg_policies el 2026-07-02). Las policies
-- se crearon/editaron a mano en el dashboard y los .sql dejaron de ser la
-- fuente de verdad:
--
--  1. athlete_invitations — 003 define las policies "coach_manages_invitations"
--     y "public_read_invitation_by_token"; en producción existían con OTROS
--     nombres: "Coach gestiona sus invitaciones" (ALL, vigente) e
--     "Invitación pública por token" (SELECT USING true, borrada a mano el
--     2026-07-02 por exponer tokens y emails a la anon key). 003 nunca se
--     aplicó tal cual.
--  2. athlete_invitations (tabla) — en producción token/used/coach_id son
--     NULLABLE; 003 los declara NOT NULL. Los defaults sí coinciden
--     (token = encode(gen_random_bytes(16),'hex') → 32 hex). NO se corrige
--     en esta migración.
--  3. coaches — falta en producción la policy "coaches_update_own" definida
--     en 001: hoy un coach NO puede actualizar su propia fila. NO se corrige
--     en esta migración (nada lo usa todavía).
--  4. coach_athletes — producción tiene una única policy ALL
--     "Coach ve sus atletas"; 001 define 3 granulares (select/insert/delete).
--  5. coach_sessions — producción tiene "Coach gestiona sus sesiones" (ALL)
--     + "Atleta ve sus propias sesiones" (SELECT); esta última no está en
--     NINGÚN .sql del repo. 001 define 4 policies granulares que no existen.
--  6. profiles — policies duplicadas en producción (ALL "Usuario ve su
--     perfil" + granulares "usuarios pueden ..."), señalado por el advisor
--     multiple_permissive_policies. Fuera del alcance de este lote.
--
-- Esta migración deja registrado el estado que SÍ cambia ahora (S1, F1, F5).
-- Las divergencias 2, 3 y 6 quedan documentadas para una futura limpieza.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. S1: eliminar la lectura pública de athlete_invitations ───────────────
-- El drop del nombre en español ya se ejecutó a mano; se refleja aquí para el
-- historial. El segundo drop cubre el nombre que usaba 003 por si alguna otra
-- instancia lo aplicó tal cual.

DROP POLICY IF EXISTS "Invitación pública por token" ON public.athlete_invitations;
DROP POLICY IF EXISTS "public_read_invitation_by_token" ON public.athlete_invitations;

-- ── 2. S1 + F5: RPC de verificación de token para JoinPage ──────────────────
-- SECURITY DEFINER a propósito: el visitante de /join/:token no está
-- autenticado y la tabla ya no es legible por anon. Devuelve SOLO lo mínimo
-- que necesita JoinPage (válido, nombre del coach, email de la invitación
-- para pre-rellenar). Nunca devuelve el token ni otras filas.
--
-- Anti-enumeración:
--  * Respuesta idéntica (false, null, null) para token malformado, inexistente
--    o ya usado — no se distingue "no existe" de "usado".
--  * Los tres casos cuestan una única búsqueda por índice único (o ni eso, si
--    el formato no pasa el regex) → sin oráculo de timing apreciable.
--  * Los tokens tienen 128 bits de entropía (gen_random_bytes(16)): la fuerza
--    bruta es impracticable. Un rate limit por IP no es posible dentro de
--    Postgres (no hay IP); si se quiere, debe añadirse delante (Netlify edge).

CREATE OR REPLACE FUNCTION public.verify_invitation_token(p_token text)
RETURNS TABLE (valid boolean, coach_nombre text, invitation_email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv record;
BEGIN
  -- Formato real de todos los tokens en producción: 32 hex (verificado).
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT i.email AS inv_email,
         COALESCE(c.nombre, c.email) AS nombre_coach
    INTO inv
    FROM public.athlete_invitations i
    JOIN public.coaches c ON c.id = i.coach_id
   WHERE i.token = p_token
     AND i.used = false;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, inv.nombre_coach, inv.inv_email;
END;
$$;

-- Por defecto Postgres da EXECUTE a PUBLIC: se restringe explícitamente a los
-- roles que sirven la API (anon para /join sin sesión).
REVOKE ALL ON FUNCTION public.verify_invitation_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_invitation_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.verify_invitation_token(text) IS
  'Verificación de invitación para JoinPage (visitante sin sesión). SECURITY DEFINER intencional; respuesta uniforme para token inexistente/usado.';

-- ── 3. F1: el atleta puede leer su propia relación coach-atleta ─────────────
-- Mismo patrón que "Atleta ve sus propias sesiones" en coach_sessions: policy
-- de LECTURA del atleta separada de la ALL del coach. (select auth.uid()) en
-- vez de auth.uid() directo por el advisor auth_rls_initplan.

DROP POLICY IF EXISTS "Atleta ve su propia relación" ON public.coach_athletes;

CREATE POLICY "Atleta ve su propia relación"
  ON public.coach_athletes FOR SELECT
  USING (athlete_id = (SELECT auth.uid()));
