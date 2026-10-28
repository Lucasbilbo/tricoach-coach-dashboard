-- 017_sesion_nutricion.sql — plan de nutrición durante una sesión (2026-10)
--
-- PLAN: carbohidratos g/h, líquido ml/h, sodio mg/h y una nota libre por sesión
-- prescrita. LO EDITAN LOS DOS: el atleta de la sesión y su coach vinculado.
-- REAL (tomado_*, estomago): lo que el atleta tomó de verdad y qué tal le sentó
-- (1 mal · 2 regular · 3 bien). La UI solo deja escribirlo al atleta; Jon lo ve
-- junto al plan.
--
-- Tabla propia (no columnas en coach_sessions) porque el atleta NO tiene
-- escritura en coach_sessions (RLS) y así sigue. Mismo patrón que
-- sesion_feedback (015).
--
-- Acceso: LEE y ESCRIBE el atleta de la sesión o un coach vinculado a ese
-- atleta (coach_athletes). athlete_id tiene que coincidir con el de la sesión
-- (no vale colgar una fila de la sesión de otro).
--
-- Aditiva: solo crea una tabla. Para deshacer: DROP TABLE public.sesion_nutricion;

BEGIN;

CREATE TABLE IF NOT EXISTS public.sesion_nutricion (
  session_id        uuid PRIMARY KEY REFERENCES public.coach_sessions(id) ON DELETE CASCADE,
  athlete_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  carbohidratos_g_h smallint CHECK (carbohidratos_g_h IS NULL OR carbohidratos_g_h BETWEEN 0 AND 150),
  liquido_ml_h      smallint CHECK (liquido_ml_h IS NULL OR liquido_ml_h BETWEEN 0 AND 1500),
  sodio_mg_h        smallint CHECK (sodio_mg_h IS NULL OR sodio_mg_h BETWEEN 0 AND 2000),
  notas             text CHECK (notas IS NULL OR char_length(notas) <= 400),
  tomado_carbohidratos_g_h smallint CHECK (tomado_carbohidratos_g_h IS NULL OR tomado_carbohidratos_g_h BETWEEN 0 AND 150),
  tomado_liquido_ml_h      smallint CHECK (tomado_liquido_ml_h IS NULL OR tomado_liquido_ml_h BETWEEN 0 AND 1500),
  estomago                 smallint CHECK (estomago IS NULL OR estomago BETWEEN 1 AND 3),
  tomado_notas             text CHECK (tomado_notas IS NULL OR char_length(tomado_notas) <= 300),
  actualizado_por   uuid DEFAULT auth.uid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (carbohidratos_g_h IS NOT NULL OR liquido_ml_h IS NOT NULL OR sodio_mg_h IS NOT NULL
         OR char_length(coalesce(notas, '')) > 0
         OR tomado_carbohidratos_g_h IS NOT NULL OR tomado_liquido_ml_h IS NOT NULL OR estomago IS NOT NULL
         OR char_length(coalesce(tomado_notas, '')) > 0)
);
CREATE INDEX IF NOT EXISTS sesion_nutricion_athlete_idx ON public.sesion_nutricion (athlete_id);

ALTER TABLE public.sesion_nutricion ENABLE ROW LEVEL SECURITY;

-- ¿Puede el usuario actual tocar la nutrición del atleta a?
-- (él mismo o un coach vinculado). Inline en cada policy, sin función, como 015.

DROP POLICY IF EXISTS "ver nutricion" ON public.sesion_nutricion;
CREATE POLICY "ver nutricion" ON public.sesion_nutricion
  FOR SELECT TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = sesion_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "crear nutricion" ON public.sesion_nutricion;
CREATE POLICY "crear nutricion" ON public.sesion_nutricion
  FOR INSERT TO authenticated
  WITH CHECK (
    actualizado_por = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = sesion_nutricion.session_id
        AND cs.athlete_id = sesion_nutricion.athlete_id
    )
    AND (
      athlete_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.coach_athletes ca
        WHERE ca.athlete_id = sesion_nutricion.athlete_id
          AND ca.coach_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "editar nutricion" ON public.sesion_nutricion;
CREATE POLICY "editar nutricion" ON public.sesion_nutricion
  FOR UPDATE TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = sesion_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  )
  WITH CHECK (
    actualizado_por = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = sesion_nutricion.session_id
        AND cs.athlete_id = sesion_nutricion.athlete_id
    )
    AND (
      athlete_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.coach_athletes ca
        WHERE ca.athlete_id = sesion_nutricion.athlete_id
          AND ca.coach_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "borrar nutricion" ON public.sesion_nutricion;
CREATE POLICY "borrar nutricion" ON public.sesion_nutricion
  FOR DELETE TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = sesion_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

REVOKE ALL ON public.sesion_nutricion FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sesion_nutricion TO authenticated;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ────────────────────────────────
-- select policyname, cmd from pg_policies where tablename = 'sesion_nutricion';
--   → 4 filas: ver / crear / editar / borrar nutricion
-- En la app: abre una sesión como Jon → "Nutrición" → "Usar sugerencia" →
-- Guardar. Entra como atleta en /home y comprueba que la ves y la puedes editar.
