-- 010 — disponibilidad del atleta (plantilla semanal + excepciones por fecha)
-- APLICADA en producción el 2026-10-18 (SQL Editor de Supabase). Verificada con pg_policies,
-- role_table_grants y RLS activa en ambas tablas.
--
-- Para qué: el atleta declara qué disciplinas puede hacer cada día de la semana
-- y cuántos minutos (o "sin límite"), y el coach lo ve al planificar. Los avisos
-- al prescribir son informativos; la lógica está en src/lib/disponibilidad.js.
--
-- Modelo:
--  * atleta_disponibilidad_semana: una fila = "ese día de la semana (1 = lunes
--    … 7 = domingo, ISO) puedo esa disciplina". max_minutos NULL = SIN LÍMITE
--    ("tengo el tiempo que necesite"). Sin fila = no puedo.
--  * atleta_disponibilidad_fecha: excepciones por fecha que SUSTITUYEN a la
--    plantilla de ese día entero: 'no_disponible' (día libre/viaje, sin
--    disciplina) o 'limitada' (una fila por disciplina que sí cabe ese día).
--  * Si el atleta no ha configurado nada, la lógica no avisa.
--
-- Acceso: cliente de Supabase + RLS (como coach_sessions / coach_plantillas).
--  * LEE: el propio atleta, o un coach con relación real en coach_athletes.
--  * ESCRIBE: SOLO el atleta. El coach no tiene policy de escritura, así que no
--    puede insertar, editar ni borrar (lo impone la base de datos, no la UI).
--  * Estilo de la 009: (select auth.uid()) y una sola policy SELECT por tabla.
--  * Privilegios: anon sin acceso; authenticated sin TRUNCATE/TRIGGER/REFERENCES.
--
-- updated_at NO lleva trigger: lo fija el cliente en cada escritura (lote B).
-- Depende de la 009 (coach_athletes con SELECT para coach y atleta; sin ella la
-- relación coach-atleta podía falsificarse).
--
-- Tabla compartida con TriCoach/Forja: profiles NO se toca. profiles.disponibilidad
-- (texto libre de otra app) no se reutiliza.

BEGIN;

CREATE TABLE public.atleta_disponibilidad_semana (
  athlete_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  disciplina  text NOT NULL CHECK (disciplina IN ('swim', 'bike', 'run', 'strength')),
  max_minutos integer CHECK (max_minutos IS NULL OR max_minutos BETWEEN 5 AND 720),  -- NULL = sin límite
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, dia_semana, disciplina)
);

CREATE TABLE public.atleta_disponibilidad_fecha (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  fecha       date NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('no_disponible', 'limitada')),
  disciplina  text CHECK (disciplina IN ('swim', 'bike', 'run', 'strength')),
  max_minutos integer CHECK (max_minutos IS NULL OR max_minutos BETWEEN 5 AND 720),  -- NULL = sin límite
  nota        text CHECK (nota IS NULL OR char_length(nota) <= 200),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'no_disponible' AND disciplina IS NULL AND max_minutos IS NULL)
    OR (tipo = 'limitada' AND disciplina IS NOT NULL)
  )
);
-- Una fila por (atleta, fecha, disciplina); el día libre (disciplina NULL) cuenta como '*'.
CREATE UNIQUE INDEX atleta_disponibilidad_fecha_uq
  ON public.atleta_disponibilidad_fecha (athlete_id, fecha, coalesce(disciplina, '*'));

-- ── RLS: atleta_disponibilidad_semana ───────────────────────────────────────
ALTER TABLE public.atleta_disponibilidad_semana ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver disponibilidad" ON public.atleta_disponibilidad_semana
  FOR SELECT TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_disponibilidad_semana.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );
CREATE POLICY "atleta inserta la suya" ON public.atleta_disponibilidad_semana
  FOR INSERT TO authenticated
  WITH CHECK (athlete_id = (select auth.uid()));
CREATE POLICY "atleta edita la suya" ON public.atleta_disponibilidad_semana
  FOR UPDATE TO authenticated
  USING (athlete_id = (select auth.uid()))
  WITH CHECK (athlete_id = (select auth.uid()));
CREATE POLICY "atleta borra la suya" ON public.atleta_disponibilidad_semana
  FOR DELETE TO authenticated
  USING (athlete_id = (select auth.uid()));

-- ── RLS: atleta_disponibilidad_fecha ────────────────────────────────────────
ALTER TABLE public.atleta_disponibilidad_fecha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ver disponibilidad" ON public.atleta_disponibilidad_fecha
  FOR SELECT TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_disponibilidad_fecha.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );
CREATE POLICY "atleta inserta la suya" ON public.atleta_disponibilidad_fecha
  FOR INSERT TO authenticated
  WITH CHECK (athlete_id = (select auth.uid()));
CREATE POLICY "atleta edita la suya" ON public.atleta_disponibilidad_fecha
  FOR UPDATE TO authenticated
  USING (athlete_id = (select auth.uid()))
  WITH CHECK (athlete_id = (select auth.uid()));
CREATE POLICY "atleta borra la suya" ON public.atleta_disponibilidad_fecha
  FOR DELETE TO authenticated
  USING (athlete_id = (select auth.uid()));

-- ── Privilegios ─────────────────────────────────────────────────────────────
REVOKE ALL ON public.atleta_disponibilidad_semana, public.atleta_disponibilidad_fecha FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.atleta_disponibilidad_semana,
  public.atleta_disponibilidad_fecha FROM authenticated;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ────────────────────────────────
-- select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies
--  where schemaname = 'public'
--    and tablename in ('atleta_disponibilidad_semana', 'atleta_disponibilidad_fecha')
--  order by tablename, policyname;
-- select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
--   from information_schema.role_table_grants
--  where table_schema = 'public'
--    and table_name in ('atleta_disponibilidad_semana', 'atleta_disponibilidad_fecha')
--    and grantee in ('anon', 'authenticated') group by 1, 2 order by 1, 2;
-- (anon no debe aparecer; authenticated: DELETE, INSERT, SELECT, UPDATE.)
--
-- ── Pruebas por rol (dentro de una transacción con ROLLBACK) ────────────────
-- Para cada caso: set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
--  1. ATLETA: inserta, lee, edita y borra filas suyas (athlete_id = su uuid)  → permitido.
--  2. ATLETA: inserta con athlete_id de OTRO atleta                          → RLS lo rechaza.
--  3. COACH vinculado (fila en coach_athletes): select de las filas de su atleta → las ve.
--  4. COACH vinculado: insert / update / delete sobre las filas de su atleta  → rechazado
--     (insert: violación de RLS; update/delete: 0 filas afectadas).
--  5. COACH NO vinculado: select de las filas de ese atleta                   → 0 filas.
--  6. ANON (set local role anon): select                                      → permission denied.
