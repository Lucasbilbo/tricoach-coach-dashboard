-- 003_intervals_integration.sql
-- Integración Intervals.icu → Garmin: campos en profiles y coach_sessions,
-- tabla athlete_invitations y políticas RLS asociadas.

-- ── 1. Campos Intervals en profiles ─────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS intervals_api_key text,
  ADD COLUMN IF NOT EXISTS intervals_athlete_id text;

-- ── 2. Campos workout estructurado en coach_sessions ────────────────────────

ALTER TABLE public.coach_sessions
  ADD COLUMN IF NOT EXISTS workout_steps jsonb,
  ADD COLUMN IF NOT EXISTS intervals_event_id text,
  ADD COLUMN IF NOT EXISTS enviado_a_garmin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS garmin_enviado_at timestamptz;

-- ── 3. Tabla athlete_invitations ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.athlete_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  email       text,
  used        boolean NOT NULL DEFAULT false,
  athlete_id  uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_athlete_invitations_coach
  ON public.athlete_invitations (coach_id);

CREATE INDEX IF NOT EXISTS idx_athlete_invitations_token
  ON public.athlete_invitations (token);

ALTER TABLE public.athlete_invitations ENABLE ROW LEVEL SECURITY;

-- El coach gestiona sus propias invitaciones
CREATE POLICY "coach_manages_invitations"
  ON public.athlete_invitations FOR ALL
  USING (coach_id = auth.uid());

-- Lectura pública por token (para que el atleta verifique el link)
CREATE POLICY "public_read_invitation_by_token"
  ON public.athlete_invitations FOR SELECT
  USING (true);
