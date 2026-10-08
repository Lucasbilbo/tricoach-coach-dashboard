-- PENDIENTE_009 — autorización y rendimiento de las RLS del panel del coach
-- NO SE APLICA SOLA. Revisar y aplicar a mano (Supabase SQL editor o MCP).
-- Preparada la noche del 2026-10-08 a partir del estado REAL de producción
-- (pg_policies, role_table_grants, pg_indexes y advisors, en solo lectura).
--
-- Solo toca tablas del PANEL: coaches, coach_athletes, coach_sessions,
-- coach_plantillas, athlete_invitations. NO toca profiles ni las tablas de
-- TriCoach/Forja (comparten instancia; sus avisos de los advisors son suyos).
--
-- Comprobado antes de redactarla (2026-10-08): 55 sesiones, TODAS con relación
-- coach_athletes y coach en la whitelist; 5 relaciones (1 coach=atleta);
-- 0 invitaciones de no-coaches. Nada existente deja de cumplir las policies.
--
-- ── 1. El agujero ───────────────────────────────────────────────────────────
-- Las policies "Coach ve sus atletas" (coach_athletes) y "Coach gestiona sus
-- sesiones" (coach_sessions) son FOR ALL con USING (coach_id = auth.uid()) y
-- SIN WITH CHECK: Postgres usa entonces el USING para las filas nuevas, así que
-- cualquier usuario autenticado podía:
--   a) insertar en coach_sessions { coach_id: él, athlete_id: OTRO } y
--   b) (si es coach) insertar en coach_athletes { coach_id: él, athlete_id: OTRO }
--      → canAccessAthlete le daba acceso a los datos de Strava de ese atleta.
-- (a) se explotaba vía send-to-intervals / delete-session (escribir y borrar en
-- el Intervals → Garmin del otro); eso YA está cerrado en el código (PR
-- fix/autorizacion-sesiones, canCoachSession). Esta migración cierra la raíz.
--
-- ── 2. Rendimiento (advisors) ───────────────────────────────────────────────
-- auth_rls_initplan: auth.uid() → (select auth.uid()) (se evalúa una vez, no
-- por fila). multiple_permissive_policies: una sola policy SELECT en
-- coach_sessions. unindexed_foreign_keys: índices de las FK del panel.

BEGIN;

-- coaches: solo leerse a sí mismo (la whitelist se mantiene a mano / service)
DROP POLICY IF EXISTS "Coach se ve a sí mismo" ON public.coaches;
CREATE POLICY "Coach se ve a sí mismo" ON public.coaches
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- coach_athletes: SOLO LECTURA desde el cliente. Las relaciones las crea la
-- RPC accept_invitation (SECURITY DEFINER, service); la UI no inserta/borra.
DROP POLICY IF EXISTS "Coach ve sus atletas" ON public.coach_athletes;
DROP POLICY IF EXISTS "Atleta ve su propia relación" ON public.coach_athletes;
CREATE POLICY "Coach o atleta ven su relación" ON public.coach_athletes
  FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()) OR athlete_id = (select auth.uid()));

-- coach_sessions: leer = coach dueño o atleta destinatario (una sola policy);
-- escribir = coach dueño CON relación real con ese atleta (o él mismo).
DROP POLICY IF EXISTS "Coach gestiona sus sesiones" ON public.coach_sessions;
DROP POLICY IF EXISTS "Atleta ve sus propias sesiones" ON public.coach_sessions;
CREATE POLICY "Coach o atleta ven la sesión" ON public.coach_sessions
  FOR SELECT TO authenticated
  USING (coach_id = (select auth.uid()) OR athlete_id = (select auth.uid()));
CREATE POLICY "Coach crea sesiones de sus atletas" ON public.coach_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    coach_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = (select auth.uid()) AND ca.athlete_id = coach_sessions.athlete_id
    )
  );
CREATE POLICY "Coach edita sesiones de sus atletas" ON public.coach_sessions
  FOR UPDATE TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (  -- impide "mover" una sesión a un atleta ajeno
    coach_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = (select auth.uid()) AND ca.athlete_id = coach_sessions.athlete_id
    )
  );
CREATE POLICY "Coach borra sus sesiones" ON public.coach_sessions
  FOR DELETE TO authenticated
  USING (coach_id = (select auth.uid()));
-- Nota: el caso "me entreno yo" (coach = atleta) ya tiene su fila en
-- coach_athletes (1 relación coach_id = athlete_id), así que pasa el EXISTS.

-- coach_plantillas: igual que antes, con initplan
DROP POLICY IF EXISTS "Coach gestiona sus plantillas" ON public.coach_plantillas;
CREATE POLICY "Coach gestiona sus plantillas" ON public.coach_plantillas
  FOR ALL TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (coach_id = (select auth.uid()));

-- athlete_invitations: solo coaches de la whitelist crean invitaciones suyas
DROP POLICY IF EXISTS "Coach gestiona sus invitaciones" ON public.athlete_invitations;
CREATE POLICY "Coach gestiona sus invitaciones" ON public.athlete_invitations
  FOR ALL TO authenticated
  USING (coach_id = (select auth.uid()))
  WITH CHECK (
    coach_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = (select auth.uid()))
  );

-- Privilegios: anon no necesita NADA en estas tablas (la invitación pública va
-- por la RPC verify_invitation_token) y nadie del cliente necesita TRUNCATE /
-- TRIGGER / REFERENCES (TRUNCATE ignora RLS; PostgREST no lo expone, pero sobra).
REVOKE ALL ON public.coaches, public.coach_athletes, public.coach_sessions,
  public.coach_plantillas, public.athlete_invitations FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.coaches, public.coach_athletes,
  public.coach_sessions, public.coach_plantillas, public.athlete_invitations FROM authenticated;

-- Índices de las FK y de las consultas reales del panel
CREATE INDEX IF NOT EXISTS coach_sessions_coach_atleta_fecha_idx
  ON public.coach_sessions (coach_id, athlete_id, fecha);          -- SessionsList
CREATE INDEX IF NOT EXISTS coach_sessions_atleta_fecha_idx
  ON public.coach_sessions (athlete_id, fecha);                    -- AthleteHome, tecnica.js
CREATE INDEX IF NOT EXISTS coach_athletes_athlete_id_idx
  ON public.coach_athletes (athlete_id);
CREATE INDEX IF NOT EXISTS athlete_invitations_coach_id_idx
  ON public.athlete_invitations (coach_id);
CREATE INDEX IF NOT EXISTS athlete_invitations_athlete_id_idx
  ON public.athlete_invitations (athlete_id);

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ────────────────────────────────
-- select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies
--  where schemaname='public' and tablename in
--  ('coaches','coach_athletes','coach_sessions','coach_plantillas','athlete_invitations');
-- Y en la app: el coach lista atletas, crea/edita/borra una sesión, envía al
-- reloj; el atleta ve sus sesiones; una invitación nueva se crea y se acepta.
--
-- ── Fuera de esta migración (decisión de Lucas) ─────────────────────────────
-- * profiles: 4 policies permisivas duplicadas + initplan. Tabla COMPARTIDA con
--   TriCoach; revisar allí antes de tocarla.
-- * verify_invitation_token ejecutable por anon: INTENCIONADO (JoinPage la
--   llama sin sesión; solo devuelve valid/coach_nombre/email).
-- * Auth → "Leaked password protection" desactivado: activarlo en el panel de
--   Supabase (Authentication → Policies), es un interruptor, no SQL.
