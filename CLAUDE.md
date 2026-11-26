# TriCoach — Coach Dashboard

Dashboard web para entrenador de triatlón (GetRiCoach). El coach ve datos reales
de sus atletas (Strava, vía Supabase) y les prescribe entrenamientos que se
envían a Intervals.icu → Garmin. Los atletas tienen su propia vista (`/home`).

> Este archivo refleja el CÓDIGO real en `main` (revisado 2026-09). Para el
> diseño inicial ya obsoleto ver `coach-dashboard-spec-v2.md` (marcado histórico).

## Reglas del proyecto (duras)

- **React + Vite con JavaScript** — sin TypeScript, nunca.
- **Netlify Functions SIEMPRE CommonJS** — `require()` / `exports.handler`, módulo
  `https` nativo, sin `supabase-js` en functions. `netlify/functions/package.json`
  fija `{"type":"commonjs"}` y anula el `"type":"module"` de la raíz.
- **Inline styles únicamente** — sin librerías UI (no Tailwind/MUI/styled).
- **Tokens de terceros NUNCA al frontend** — `strava_token`, `strava_refresh_token`
  e `intervals_api_key` se usan solo en backend con la service key. El frontend
  pregunta si hay conexión con `misConexiones()` (`src/lib/connections.js` →
  función `my-connections`, solo booleanos). La única escritura de la key desde el
  cliente es el alta en `IntervalsSetup` (update del propio perfil, RLS).
- **Timezone: Europe/Madrid** — TODA fecha de actividad y agrupación semanal se
  deriva del instante UTC (`start_date`) convertido a Madrid con `fechaMadrid`,
  NO de `start_date_local` (que viene en la TZ de la actividad).
- **Un commit por cambio**, con lint y build en verde. Auditar antes de tocar.
- **Vite pineado a `^7` + `@vitejs/plugin-react@^5`**: Vite 8 (rolldown) genera
  bundles sin los módulos JSX propios (página en blanco sin error). No subir sin
  verificar que el bundle de entrada contiene strings de la app.
- Dev local: `netlify dev` (puerto 8888, sirve frontend + functions).

## Invariantes clave (resumen: el detalle y el porqué están en `docs/`)

- **Métricas**: una sola fuente en `netlify/functions/lib/metrics.js`; hrTSS contra la FC umbral (90 % de la FC máx si no hay); `'other'` no entra en el volumen; ATL/CTL/TSB solo en `src/lib/carga.js` (EWMA 7/42, ventana de 26 semanas).
- **Seguridad**: la identidad NUNCA sale del body (coach = JWT; `athleteId` se autoriza contra `coach_athletes`); acciones sobre una sesión con `canCoachSession`; en el frontend, `authHeaders()`; `profiles` es compartida con TriCoach v2 (un trigger protege `plan` y otros campos).
- **Rendimiento**: toda lectura de `coach-athlete-data` pasa por `pedirDatosAtleta`; NO lanzar dos llamadas a la misma función a la vez (Netlify las pone en cola: unirlas); en una función, nada de idas a Supabase en serie si no dependen entre sí (Ohio ↔ Frankfurt, ~200–500 ms cada una).
- **Reloj**: las notas del entrenador y la nutrición NUNCA van al reloj; el texto (cue) va delante de la duración; el reenvío crea el evento nuevo y después borra el anterior.
- **Diseño**: colores y tipografía en `src/lib/theme.js` (no hardcodear); texto ≥ 12 px y objetivos táctiles ≥ 44 px; una píldora principal por pantalla; marca «GetRiCoach», nunca «TriCoach» en la UI; todo cambio visual pasa antes por Claude Design.

## Documentación por tema (léela ANTES de tocar ese área)

| Si tocas… | Lee |
|---|---|
| Cachés, latencia, Strava en Supabase, webhook, `Server-Timing`, peticiones concurrentes | `docs/rendimiento.md` |
| Auth de las functions, JWT local, RLS, rate limit, cabeceras/CSP | `docs/autenticacion.md` |
| TSS, ATL/CTL/TSB, zonas, `lib/metrics.js` | `docs/metricas.md` |
| Envío a Intervals/Garmin, texto del workout, natación, creador de sesiones, escritura rápida | `docs/entrega-intervals.md` |
| Feedback, cumplimiento, TSS previsto, proyección, nutrición y despensa | `docs/nutricion-feedback.md` |
| Potenciómetro, FTP, FC umbral | `docs/potenciometro.md` |
| Temporada, disponibilidad, agenda con horas, mover sesiones, planificar | `docs/agenda-disponibilidad.md` |
| Colores, tipografía, componentes de UI, gráficos, pestaña Análisis | `docs/design-system.md` |

Los informes de auditoría antiguos (raíz y `auditorias/` en el Project de Claude) son históricos: lo vigente está aquí y en `docs/`.

## Stack

- Frontend: React 19 + Vite, react-router-dom v7, recharts. Recharts (~100 KB
  gzip) va en chunks propios: los gráficos se importan con `React.lazy` DENTRO de
  `StravaAnalysis`, así que solo se descarga al abrir la pestaña Análisis (no en
  Sesiones/Entrenos ni en el dashboard).
- Backend: Netlify Functions (CommonJS).
- DB/Auth: Supabase (cliente solo en el frontend con la anon key). Desde
  2026-11-26 NO se usa `@supabase/supabase-js`: `src/lib/supabase.js` monta el
  cliente con `@supabase/auth-js` + `@supabase/postgrest-js` (misma config y
  misma clave de sesión `sb-<ref>-auth-token`) y `storageDe()` carga
  `@supabase/storage-js` bajo demanda (solo capturas de fuerza). API:
  `supabase.auth`, `supabase.from`, `supabase.rpc`. Los tres paquetes van
  fijados a la MISMA versión; súbelos juntos. Entrada 137,7 → 108,5 KB gzip.
  Todas las pantallas son `lazy` (también JoinPage e IntervalsSetup).
- Datos: Strava API v3 · Entrega: Intervals.icu API.

## Estructura

- `src/components/` — Login, Dashboard (panel del coach), AthleteView (atleta,
  vista coach), SessionsList, SemanaCalendario + HojaMover (agenda),
  WorkoutBuilder/WorkoutDetail (+ `workout/`: bloques, chips, parser, atajos),
  AdjuntoEntreno, FeedbackSesion, Cumplimiento, AgendaAtleta,
  DisponibilidadEditor, ActivityDetail, PolylineMap, PRsBlock, WeekCompare;
  `charts/` (ChartCard, FormaChart, PowerChart, TSSChart), `shared/`
  (StravaAnalysis, TransitionLine, SinStrava, AnalisisCargando), `season/`,
  `ui/` (primitivas).
- `src/pages/` — AthleteHome (atleta), IntervalsSetup, JoinPage (invitaciones).
- `src/lib/` — datos/caché: supabase, authHeaders, connections, athleteData +
  athleteDataCache, panelData, valueCache, clientCache, planCarga, *Api
  (disponibilidad, feedback, season). Lógica pura (con tests): carga,
  athleteStats, estadoSesion, cumplimiento, tssPrevisto, proyeccion, feedback,
  disponibilidad, agenda, planificacion, season, adjuntos. Formato/UI: theme,
  chartUtils, activityFormat, intervalsText (re-exporta el .cjs del backend).
- `src/hooks/` — useDisponibilidad, useIsMobile.
- `netlify/functions/` — coach-dashboard-data, coach-athlete-data,
  coach-activity-detail, send-to-intervals, move-session, delete-session,
  season, my-connections, strava-auth, verify-intervals-key, accept-invitation,
  set-fc-max, sync-ftp, strava-webhook;
  `lib/` (auth, http, supabase-rest, rate-limit, oauth-state, metrics, semanas,
  strava, strava-lista, actividades-store, jwt-local, strava-webhook, tecnica, ttl-cache, server-timing,
  intervals-api, intervals-evento, intervals-text.cjs, mover-reglas.cjs, potencia,
  season-validate).
- `supabase/migrations/` — 001–027 (+ ficheros `PENDIENTE_*` que NO se aplican
  solos). 017 aplicada 2026-10-29 (SQL Editor); 018–022 aplicadas en producción
  (2026-11-19/20); 023–027 aplicadas por MCP el 2026-11-24 (nombres iguales al fichero). **Nombres en el historial de Supabase ≠ nombre del fichero**
  (se aplicaron por MCP con otro nombre): 018 → `018_productos_nutricion`,
  019 → `nutricion_tomado_items`, 020 → `recetas_bidon`, **021 → `019_atleta_potencia`**
  (se renumeró después), 022 → `022_fc_umbral`. En el mismo historial aparecen
  `013_intervals_event_ids` y `014_intervals_athlete_unico`: son de **TriCoach v2**
  (misma BD); la 014 crea el índice único `profiles_intervals_athlete_id_key`
  (un Intervals por cuenta; `IntervalsSetup` lo explica si choca).
- `audit/` — `recompute.mjs` (recálculo independiente de métricas). `real-data.mjs`
  está gitignoreado (actividades reales con FC).
- `test/` — `npm test` (node --test, sin dependencias).

## Variables de entorno

Frontend (`.env`, prefijo `VITE_`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Backend (Netlify env): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (⚠️ no
`SUPABASE_SERVICE_KEY`), `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
Opcionales: `SUPABASE_JWT_SECRET` (solo si el proyecto firma con el secreto
HS256 clásico: verificación del JWT en local), `STRAVA_WEBHOOK_VERIFY_TOKEN`,
`STRAVA_WEBHOOK_SUBSCRIPTION_ID`, `STRAVA_WEBHOOK_ACTIVO` (webhook de Strava).

## Columnas reales de `profiles` (verificadas)

`strava_token`, `strava_refresh_token`, `strava_token_expires_at` (bigint unix),
`fc_maxima` (int, ⚠️ no `fc_max`), `intervals_api_key`, `intervals_athlete_id`,
`nombre`, `email`.
