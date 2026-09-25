-- PENDIENTE_006_revoke_definer_rpcs.sql
-- ⚠️ NO se aplica automáticamente: el prefijo "PENDIENTE_" evita que el CLI de
-- Supabase lo tome como migración. Revisar y aplicar A MANO tras validar en un
-- entorno de pruebas. Idempotente.
--
-- Objetivo: las RPC SECURITY DEFINER de BACKEND no deben ser ejecutables por
-- anon/authenticated (hoy sí lo son). No romper lo que el frontend usa de forma
-- legítima (verify_invitation_token, que /join llama sin sesión con la anon key).
--
-- Estado real verificado (2026-09, pg_proc.proacl):
--   accept_invitation        → anon,authenticated,postgres,service_role  [DEBE: service_role]
--   check_rate_limit         → anon,authenticated,postgres,service_role  [DEBE: service_role]
--   verify_invitation_token  → anon,authenticated,postgres,service_role  [OK: anon lo necesita]
--   increment_messages_today → anon,authenticated,... + search_path MUTABLE [¿otra app? revisar]

begin;

-- 1) accept_invitation: solo la Netlify Function (service key) debe ejecutarla.
revoke execute on function public.accept_invitation(text, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.accept_invitation(text, uuid, text, text) to service_role;

-- 2) check_rate_limit: idem (solo service key desde lib/rate-limit).
revoke execute on function public.check_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

-- 3) verify_invitation_token: /join (visitante SIN sesión) la llama con la anon
--    key. Se MANTIENE anon+authenticated; solo se limpia PUBLIC y se re-afirma.
revoke execute on function public.verify_invitation_token(text) from public;
grant  execute on function public.verify_invitation_token(text) to anon, authenticated, service_role;

-- 4) increment_messages_today: search_path mutable (riesgo de hijacking en una
--    función SECURITY DEFINER). Se fija — cambio seguro y sin efecto en el grant.
--    NO se revoca el execute: parece pertenecer a otra app (chat de TriCoach).
--    Confirmar el dueño; si se confirma que es backend, descomentar el revoke.
alter function public.increment_messages_today(uuid, integer, text) set search_path = '';
-- revoke execute on function public.increment_messages_today(uuid, integer, text) from public, anon, authenticated;
-- grant  execute on function public.increment_messages_today(uuid, integer, text) to service_role;

-- 5) Endurecer defaults: las funciones nuevas no otorgan EXECUTE a PUBLIC por
--    defecto (afecta a los objetos creados por el rol que ejecute esto).
alter default privileges in schema public revoke execute on functions from public;

commit;

-- ── VERIFICACIÓN (ejecutar aparte; debe reflejar los roles esperados) ─────────
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--        coalesce(p.proconfig::text,'(none)') as config,
--        (select string_agg(distinct r.rolname, ',') from pg_proc pp
--           join lateral aclexplode(pp.proacl) a on true
--           join pg_roles r on r.oid = a.grantee
--          where pp.oid = p.oid and a.privilege_type = 'EXECUTE') as execute_roles
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.prosecdef
--  order by p.proname;
-- Esperado: accept_invitation / check_rate_limit → service_role (+ postgres owner);
--           verify_invitation_token → anon, authenticated, service_role (+ postgres);
--           increment_messages_today → config = search_path="".

-- ── ROLLBACK (restaura el estado permisivo previo; solo si algo se rompe) ─────
-- grant execute on function public.accept_invitation(text, uuid, text, text) to anon, authenticated;
-- grant execute on function public.check_rate_limit(text, text, integer, integer) to anon, authenticated;
-- alter default privileges in schema public grant execute on functions to public;
