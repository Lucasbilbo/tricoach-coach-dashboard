-- 008_coach_plantillas.sql — plantillas de entrenamiento del coach
--
-- El coach guarda sus sesiones típicas ("Cambios 8x1'", "Rodaje Z2 50'") y las
-- carga en el builder para cualquier atleta. Mismo modelo de acceso que
-- coach_sessions: el frontend usa el cliente de Supabase y RLS limita cada fila
-- a su coach (coach_id = auth.uid()).

CREATE TABLE IF NOT EXISTS public.coach_plantillas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid NOT NULL DEFAULT auth.uid() REFERENCES public.coaches(id) ON DELETE CASCADE,
  nombre        text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 80),
  disciplina    text NOT NULL CHECK (disciplina IN ('swim', 'bike', 'run', 'strength', 'other')),
  workout_steps jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, disciplina, nombre)
);

ALTER TABLE public.coach_plantillas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach gestiona sus plantillas" ON public.coach_plantillas;
CREATE POLICY "Coach gestiona sus plantillas" ON public.coach_plantillas
  FOR ALL TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());
