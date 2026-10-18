-- 011 — disponibilidad por TRAMOS HORARIOS (sustituye al modelo de minutos de la 010)
-- APLICADA en producción el 2026-10-18 (SQL Editor de Supabase). Verificada: 4 políticas por tabla,
-- RLS activa, anon sin permisos, authenticated solo DELETE/INSERT/SELECT/UPDATE.
--
-- Por qué: el atleta marca en un calendario "nado de 7:00 a 8:00, bici de 18:00
-- a 20:00" en lugar de límites de minutos. Cada fila es un tramo
-- (inicio_min, fin_min) en minutos desde las 00:00, en bloques de 30 min.
--  * atleta_disponibilidad_semana: tramo por día de la semana (1 = lunes … 7) y disciplina.
--  * atleta_disponibilidad_fecha: excepciones por fecha que SUSTITUYEN a la plantilla
--    de ese día: 'no_disponible' (sin disciplina ni horas) o 'limitada' (un tramo por fila).
--
-- Seguridad: las tablas de la 010 estaban vacías al preparar esto; si ya tuvieran
-- datos, la migración se detiene (RAISE) en vez de borrarlos.
-- Acceso: igual que la 010 — LEE el atleta o su coach vinculado; ESCRIBE solo el atleta.
-- updated_at lo fija el cliente.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.atleta_disponibilidad_semana)
     OR EXISTS (SELECT 1 FROM public.atleta_disponibilidad_fecha) THEN
    RAISE EXCEPTION '011: las tablas de disponibilidad ya tienen datos; no se recrean';
  END IF;
END $$;

DROP TABLE public.atleta_disponibilidad_semana;
DROP TABLE public.atleta_disponibilidad_fecha;

CREATE TABLE public.atleta_disponibilidad_semana (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  dia_semana  smallint NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  disciplina  text NOT NULL CHECK (disciplina IN ('swim', 'bike', 'run', 'strength')),
  inicio_min  smallint NOT NULL CHECK (inicio_min BETWEEN 0 AND 1410),
  fin_min     smallint NOT NULL CHECK (fin_min BETWEEN 30 AND 1440),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (fin_min > inicio_min)
);
CREATE INDEX atleta_disponibilidad_semana_athlete_idx
  ON public.atleta_disponibilidad_semana (athlete_id, dia_semana);

CREATE TABLE public.atleta_disponibilidad_fecha (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  fecha       date NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('no_disponible', 'limitada')),
  disciplina  text CHECK (disciplina IN ('swim', 'bike', 'run', 'strength')),
  inicio_min  smallint CHECK (inicio_min BETWEEN 0 AND 1410),
  fin_min     smallint CHECK (fin_min BETWEEN 30 AND 1440),
  nota        text CHECK (nota IS NULL OR char_length(nota) <= 200),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (tipo = 'no_disponible' AND disciplina IS NULL AND inicio_min IS NULL AND fin_min IS NULL)
    OR (tipo = 'limitada' AND disciplina IS NOT NULL AND inicio_min IS NOT NULL
        AND fin_min IS NOT NULL AND fin_min > inicio_min)
  )
);
CREATE INDEX atleta_disponibilidad_fecha_athlete_idx
  ON public.atleta_disponibilidad_fecha (athlete_id, fecha);

-- ── RLS (idéntica a la 010) ─────────────────────────────────────────────────
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

REVOKE ALL ON public.atleta_disponibilidad_semana, public.atleta_disponibilidad_fecha FROM anon;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.atleta_disponibilidad_semana,
  public.atleta_disponibilidad_fecha FROM authenticated;

COMMIT;

-- Verificación (solo lectura): policies = 4 por tabla, anon sin grants, authenticated = DELETE,INSERT,SELECT,UPDATE.
