-- 006_temporada.sql — Temporada del atleta (calendario de pruebas del año)
--
-- Cada atleta tiene su lista de pruebas (candidatas, confirmadas, inscritas…).
-- La editan el propio atleta y su coach; todo cambio queda registrado en
-- temporada_cambios para que ninguno pise al otro sin enterarse.
--
-- Acceso: SOLO vía la Netlify Function `season` con service key, que verifica
-- el JWT y la relación coach_athletes (mismo modelo que el resto del backend).
-- Por eso RLS va activado y SIN policies: anon/authenticated no leen ni escriben.
--
-- Multideporte: el campo deporte no asume triatlón (Leire solo corre).

CREATE TABLE IF NOT EXISTS public.temporada_eventos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nombre            text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 120),
  deporte           text NOT NULL CHECK (deporte IN ('run', 'tri', 'bike', 'swim', 'other')),
  distancia         text CHECK (distancia IS NULL OR char_length(distancia) <= 80),
  fecha             date,
  fecha_aprox       boolean NOT NULL DEFAULT false,
  estado            text NOT NULL DEFAULT 'candidata'
                    CHECK (estado IN ('candidata', 'confirmada', 'inscrito', 'descartada', 'hecha')),
  prioridad         text CHECK (prioridad IS NULL OR prioridad IN ('A', 'B', 'C')),
  escenario         text CHECK (escenario IS NULL OR char_length(escenario) <= 40),
  precio            text CHECK (precio IS NULL OR char_length(precio) <= 60),
  url               text CHECK (url IS NULL OR (char_length(url) <= 500 AND url ~ '^https?://')),
  inscripcion_antes date,
  notas             text CHECK (notas IS NULL OR char_length(notas) <= 1000),
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_temporada_eventos_athlete_fecha
  ON public.temporada_eventos (athlete_id, fecha);

ALTER TABLE public.temporada_eventos ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo service key (Netlify Function `season`).

CREATE TABLE IF NOT EXISTS public.temporada_cambios (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  athlete_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  evento_id   uuid,               -- sin FK: el log sobrevive al borrado del evento
  actor_id    uuid NOT NULL,
  accion      text NOT NULL CHECK (accion IN ('crear', 'editar', 'borrar')),
  resumen     text NOT NULL CHECK (char_length(resumen) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_temporada_cambios_athlete
  ON public.temporada_cambios (athlete_id, created_at DESC);

ALTER TABLE public.temporada_cambios ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo service key.
