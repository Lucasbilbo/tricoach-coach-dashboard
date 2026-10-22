-- 015_sesion_feedback.sql — feedback del atleta tras cada sesión (2026-10)
--
-- El atleta cuenta cómo le fue un entreno prescrito: esfuerzo percibido (RPE
-- 1–10, escala CR-10), sensaciones (1 = fatal … 5 = genial), un comentario y si
-- tuvo molestias (con texto opcional). Jon lo lee en la sesión.
--
-- Una fila por sesión (PK = session_id). Tabla propia y no columnas en
-- coach_sessions porque el atleta NO tiene escritura en coach_sessions (RLS) y
-- así sigue: aquí solo escribe lo suyo.
--
-- Acceso: LEE el atleta o su coach vinculado (coach_athletes); ESCRIBE solo el
-- atleta, y solo sobre sesiones que son suyas. updated_at lo fija el cliente.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sesion_feedback (
  session_id      uuid PRIMARY KEY REFERENCES public.coach_sessions(id) ON DELETE CASCADE,
  athlete_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  rpe             smallint CHECK (rpe IS NULL OR rpe BETWEEN 1 AND 10),
  sensacion       smallint CHECK (sensacion IS NULL OR sensacion BETWEEN 1 AND 5),
  comentario      text CHECK (comentario IS NULL OR char_length(comentario) <= 600),
  molestias       boolean NOT NULL DEFAULT false,
  molestias_texto text CHECK (molestias_texto IS NULL OR char_length(molestias_texto) <= 200),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Algo hay que contar: una fila vacía no aporta nada
  CHECK (rpe IS NOT NULL OR sensacion IS NOT NULL OR molestias OR char_length(coalesce(comentario, '')) > 0)
);
CREATE INDEX IF NOT EXISTS sesion_feedback_athlete_idx ON public.sesion_feedback (athlete_id);

ALTER TABLE public.sesion_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver feedback" ON public.sesion_feedback;
CREATE POLICY "ver feedback" ON public.sesion_feedback
  FOR SELECT TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = sesion_feedback.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

-- La sesión tiene que ser del propio atleta (no vale poner tu athlete_id en la
-- sesión de otro).
DROP POLICY IF EXISTS "atleta crea el suyo" ON public.sesion_feedback;
CREATE POLICY "atleta crea el suyo" ON public.sesion_feedback
  FOR INSERT TO authenticated
  WITH CHECK (
    athlete_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = sesion_feedback.session_id
        AND cs.athlete_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "atleta edita el suyo" ON public.sesion_feedback;
CREATE POLICY "atleta edita el suyo" ON public.sesion_feedback
  FOR UPDATE TO authenticated
  USING (athlete_id = (select auth.uid()))
  WITH CHECK (
    athlete_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.coach_sessions cs
      WHERE cs.id = sesion_feedback.session_id
        AND cs.athlete_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "atleta borra el suyo" ON public.sesion_feedback;
CREATE POLICY "atleta borra el suyo" ON public.sesion_feedback
  FOR DELETE TO authenticated
  USING (athlete_id = (select auth.uid()));

REVOKE ALL ON public.sesion_feedback FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sesion_feedback TO authenticated;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ────────────────────────────────
-- select policyname, cmd from pg_policies where tablename = 'sesion_feedback';
