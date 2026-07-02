-- 005_hardening_backend.sql — lote de endurecimiento (auditoría 2026-07-02)
-- Cubre S5 (accept-invitation atómico) y el rate limit compartido por S5 y S6.
-- S3 (stack traces) y S4 (HMAC del state de Strava) son solo cambios de código
-- en las Netlify Functions, no tocan el esquema.

-- ── Rate limit compartido (S5c, S6) ─────────────────────────────────────────
-- Netlify plan nf_team_dev no ofrece rate limiting nativo de funciones, así que
-- se implementa con una tabla de hits + una RPC. La tabla no la lee nadie desde
-- el cliente: RLS activado y sin policies; solo la service key (que la bypasa)
-- y la RPC SECURITY DEFINER la tocan.

CREATE TABLE IF NOT EXISTS public.rate_limit_hits (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket  text NOT NULL,
  subject text NOT NULL,
  hit_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_lookup
  ON public.rate_limit_hits (bucket, subject, hit_at);

ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- Sin policies: inaccesible para anon/authenticated. Solo service key / RPC.

-- Registra un intento y devuelve true si está DENTRO del límite, false si lo
-- excede. Limpia oportunistamente los hits viejos del bucket.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket text, p_subject text, p_max int, p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cnt int;
BEGIN
  DELETE FROM public.rate_limit_hits
   WHERE bucket = p_bucket
     AND hit_at < now() - make_interval(secs => p_window_seconds);

  SELECT count(*) INTO cnt
    FROM public.rate_limit_hits
   WHERE bucket = p_bucket
     AND subject = p_subject
     AND hit_at >= now() - make_interval(secs => p_window_seconds);

  IF cnt >= p_max THEN
    RETURN false;
  END IF;

  INSERT INTO public.rate_limit_hits (bucket, subject) VALUES (p_bucket, p_subject);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;

-- ── S5: accept-invitation atómico ───────────────────────────────────────────
-- Reemplaza el check-then-act de accept-invitation.js. El usuario en auth.users
-- lo sigue creando GoTrue (admin API) desde la función ANTES de llamar aquí;
-- esta RPC hace atómicamente: validar token + marcar usado + crear perfil +
-- crear relación. Si el token ya se usó (carrera), o un insert falla, la
-- transacción entera hace rollback. La función compensa borrando el usuario
-- Auth si esta RPC no devuelve ok.
--
-- Respuesta uniforme 'INVALID_TOKEN' para token inexistente/usado/malformado
-- (no filtra si el token existe).
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_token text, p_athlete_id uuid, p_email text, p_nombre text
) RETURNS TABLE (ok boolean, coach_id uuid, error_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  inv     record;
  updated int;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{32}$' THEN
    RETURN QUERY SELECT false, NULL::uuid, 'INVALID_TOKEN'; RETURN;
  END IF;

  SELECT * INTO inv FROM public.athlete_invitations WHERE token = p_token;
  IF NOT FOUND OR inv.used THEN
    RETURN QUERY SELECT false, NULL::uuid, 'INVALID_TOKEN'; RETURN;
  END IF;

  IF inv.email IS NOT NULL AND lower(inv.email) <> lower(p_email) THEN
    RETURN QUERY SELECT false, NULL::uuid, 'EMAIL_MISMATCH'; RETURN;
  END IF;

  -- Serialización de la carrera: marcar used SIN tocar athlete_id todavía
  -- (athlete_invitations.athlete_id tiene FK a profiles, que aún no existe).
  -- Si dos requests concurrentes llegan aquí, solo una afecta una fila; la
  -- otra ve 0 filas y aborta sin haber escrito nada.
  UPDATE public.athlete_invitations
     SET used = true, used_at = now()
   WHERE token = p_token AND used = false;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, 'INVALID_TOKEN'; RETURN;
  END IF;

  -- Crear el perfil (satisface el FK) y la relación. Si algo falla, la
  -- excepción revierte toda la transacción, incluido el UPDATE de arriba.
  INSERT INTO public.profiles (id, nombre, email) VALUES (p_athlete_id, p_nombre, p_email);
  INSERT INTO public.coach_athletes (coach_id, athlete_id) VALUES (inv.coach_id, p_athlete_id);
  UPDATE public.athlete_invitations SET athlete_id = p_athlete_id WHERE token = p_token;

  RETURN QUERY SELECT true, inv.coach_id, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text, text) TO service_role;
