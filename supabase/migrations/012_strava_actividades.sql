-- 012_strava_actividades.sql — copia local de las actividades de Strava (2026-10)
--
-- Antes cada carga del panel pedía a Strava toda la ventana (hasta 26 semanas,
-- ~3-4 s). Ahora el backend guarda el resumen de cada actividad y solo pide a
-- Strava lo nuevo (sincronización incremental, ver lib/actividades-store.js).
--
-- Acceso: RLS activado y SIN policies → solo el backend con la service key
-- (mismo patrón que temporada_*). Contiene FC y GPS: nunca se lee desde el cliente.

CREATE TABLE IF NOT EXISTS public.strava_actividades (
  athlete_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  strava_id      bigint      NOT NULL,
  start_date     timestamptz NOT NULL,
  -- Resumen tal cual lo devuelve GET /athlete/activities (el mapeo a métricas
  -- sigue en las functions: así un cambio de fórmula no exige migrar datos)
  datos          jsonb       NOT NULL,
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, strava_id)
);

CREATE INDEX IF NOT EXISTS strava_actividades_atleta_fecha_idx
  ON public.strava_actividades (athlete_id, start_date DESC);

-- Estado de sincronización por atleta
CREATE TABLE IF NOT EXISTS public.strava_sync (
  athlete_id          uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- La tabla tiene TODAS las actividades del atleta con start_date >= este instante
  cubierto_desde      timestamptz,
  -- Última consulta a Strava que se completó bien
  sincronizado_at     timestamptz,
  -- Actividad más reciente vista (aunque sea anterior a cubierto_desde)
  ultima_actividad_at timestamptz
);

ALTER TABLE public.strava_actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strava_sync ENABLE ROW LEVEL SECURITY;
