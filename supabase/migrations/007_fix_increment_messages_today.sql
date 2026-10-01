-- 007_fix_increment_messages_today.sql — APLICADA 2026-10-01
--
-- Bug: increment_messages_today (límite diario de mensajes del chat de TriCoach)
-- tenía `SET search_path = ''` pero hacía `UPDATE profiles` sin esquema, así que
-- fallaba SIEMPRE con 42P01 (relation "profiles" does not exist). claude.js trata
-- cualquier respuesta distinta de -1 como "permitido" → el límite Free/Pro NO se
-- estaba aplicando (fail-open silencioso).
--
-- Fix: mismo cuerpo con `public.profiles`. Además se cierra el EXECUTE a
-- anon/authenticated: el único llamador es claude.js con la service key, y con
-- anon cualquiera podía agotar el contador de mensajes de otro usuario.
--
-- Sustituye al punto 4 de PENDIENTE_006 (el resto de ese fichero ya estaba
-- aplicado en producción: accept_invitation y check_rate_limit → service_role).

CREATE OR REPLACE FUNCTION public.increment_messages_today(p_user_id uuid, p_limit integer, p_today text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE new_count int;
BEGIN
  UPDATE public.profiles
  SET messages_today = CASE WHEN last_message_date::text = p_today THEN messages_today + 1 ELSE 1 END,
      last_message_date = p_today::date
  WHERE id = p_user_id AND (last_message_date::text != p_today OR messages_today < p_limit)
  RETURNING messages_today INTO new_count;
  RETURN COALESCE(new_count, -1);
END; $$;

REVOKE ALL ON FUNCTION public.increment_messages_today(uuid, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_messages_today(uuid, integer, text) TO service_role;
