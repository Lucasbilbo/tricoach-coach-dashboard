<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Autenticación de las Netlify Functions, RLS y cabeceras. Índice: CLAUDE.md. -->

## Autenticación de las Netlify Functions

- Las funciones que devuelven o mutan datos exigen `Authorization: Bearer <jwt>`
  de la sesión de Supabase. Verificación en `netlify/functions/lib/auth.js`
  (`verifyAuth` + whitelist en `coaches`). Desde 2026-11-26 la firma se comprueba
  EN LA FUNCIÓN (`lib/jwt-local.js`): ES256/RS256 con el JWKS público del
  proyecto (cacheado por instancia, se vuelve a pedir si llega un `kid` nuevo) o
  HS256 si hay `SUPABASE_JWT_SECRET`; exp, iss, aud y role. Si no puede decidir
  (proyecto con secreto HS256 y sin la variable, JWKS caído) cae a GET
  `/auth/v1/user` como antes. `coach-athlete-data` marca `auth-local` /
  `auth-remoto` en Server-Timing. Diferencia: en local no se ve un cierre de
  sesión hasta que caduca el token (1 h). Cachés por instancia (60 s): whitelist
  de coaches y relaciones coach-atleta POSITIVAS (un «no» nunca se cachea).
- **La identidad NUNCA se lee del body**: el coach sale del JWT. `athleteId` puede
  venir del body porque se autoriza contra `coach_athletes` (`canAccessAthlete`), o
  `uid === athleteId` si es el propio atleta. En `send-to-intervals`, coach y atleta
  se derivan de la sesión prescrita.
- **Acciones de coach sobre una sesión** (`send-to-intervals`, `delete-session`):
  ser `session.coach_id` NO basta — `canCoachSession` (lib/auth.js) exige además
  whitelist de `coaches` y relación real en `coach_athletes` (o coach = atleta).
  Motivo: las RLS de `coach_sessions` dejaban a cualquier usuario autenticado
  insertar filas con `coach_id` = él y el `athlete_id` de otro (2026-10-08).
  La raíz en BD: `supabase/migrations/009_autorizacion_rls_panel.sql` (aplicada 2026-10-18).
- OAuth de Strava con `state` firmado (HMAC-SHA256 + nonce + expiración) en
  `lib/oauth-state.js` — anti-CSRF de vinculación.
- Rate limit best-effort vía RPC `check_rate_limit` (`lib/rate-limit.js`), aplicado
  en `accept-invitation` y `verify-intervals-key`, en las que leen Strava y (desde
  2026-10-23) en las que escriben: `send-to-intervals`, `move-session`,
  `delete-session` y `season` (solo upsert/delete), por uid, en paralelo con la
  primera lectura (no añade latencia). Límites en `LIMITES`. Fail-open.
- En el frontend, usar `authHeaders()` (`src/lib/authHeaders.js`) en todos los fetch.
- **`profiles` es compartida con TriCoach v2** (mismo Supabase). Migración 016 (aplicada 2026-10-23):
  trigger `profiles_proteger_campos` — si escribe un usuario (authenticated/anon)
  NO puede cambiar `plan`, `stripe_customer_id`, `messages_today`,
  `last_message_date`, `ajustes_hoy`, `ultima_fecha_ajuste`, `deleted_at`,
  `created_at` (en UPDATE se mantienen; en INSERT van a su valor de alta, plan
  'free'). Antes cualquiera se ponía `plan='pro'` con la anon key. El backend
  (service_role) y las SECURITY DEFINER sí pueden. Si TriCoach necesita escribir
  uno de esos campos desde el navegador, que lo haga por una función de backend.
  RLS de profiles: 3 políticas (ver/crear/editar la propia), sin DELETE.
- Cabeceras (`netlify.toml`): X-Frame-Options DENY, nosniff, Referrer-Policy,
  Permissions-Policy y CSP con los únicos orígenes que usa la app (Supabase; las
  fuentes van en el bundle desde 2026-11). `/assets/*` inmutable 1 año (llevan hash). Si se añade un
  origen nuevo (imágenes, otra API) hay que añadirlo a la CSP.
- Contraseña de alta: mínimo 8 caracteres (JoinPage + accept-invitation).
- `VITE_COACH_SECRET`/`COACH_FUNCTION_SECRET` están OBSOLETOS; el código no los usa.
  NUNCA reintroducir un secreto compartido con prefijo `VITE_` como autenticación.
