-- 013_sesiones_hora.sql — hora de inicio y "movida por" en coach_sessions (2026-10)
--
-- La agenda del coach y del atleta coloca cada sesión A SU HORA dentro de la
-- franja de disponibilidad. Hasta ahora coach_sessions solo tenía `fecha`.
--
-- - hora_inicio_min: minutos desde las 0:00 (450 = 7:30). NULL = sin hora (la
--   sesión va a la fila "sin hora" de la agenda, como hasta ahora).
-- - movida_por / movida_at: quién movió la sesión de día u hora por última vez
--   desde la agenda. Jon ve "movida por <atleta>" cuando la mueve el atleta.
--
-- Permisos: NO cambian. El atleta sigue sin poder escribir en coach_sessions;
-- mover una sesión pasa por la Netlify Function `move-session` (service key),
-- que solo toca fecha / hora / movida_* y reenvía el evento a Intervals.icu.

BEGIN;

ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS hora_inicio_min int,
  ADD COLUMN IF NOT EXISTS movida_por text,
  ADD COLUMN IF NOT EXISTS movida_at timestamptz;

ALTER TABLE public.coach_sessions DROP CONSTRAINT IF EXISTS coach_sessions_hora_inicio_min_check;
ALTER TABLE public.coach_sessions ADD CONSTRAINT coach_sessions_hora_inicio_min_check
  CHECK (hora_inicio_min IS NULL OR (hora_inicio_min BETWEEN 0 AND 1435 AND hora_inicio_min % 5 = 0));

ALTER TABLE public.coach_sessions DROP CONSTRAINT IF EXISTS coach_sessions_movida_por_check;
ALTER TABLE public.coach_sessions ADD CONSTRAINT coach_sessions_movida_por_check
  CHECK (movida_por IS NULL OR movida_por IN ('atleta', 'coach'));

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ────────────────────────────────
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='coach_sessions'
--    and column_name in ('hora_inicio_min','movida_por','movida_at');
