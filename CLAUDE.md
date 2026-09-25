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
  e `intervals_api_key` se usan solo en backend con la service key. (Deuda actual:
  el frontend aún lee `strava_token`/`intervals_api_key` para checks booleanos; ver
  auditoría — pendiente pasar a flags.)
- **Timezone: Europe/Madrid** — TODA fecha de actividad y agrupación semanal se
  deriva del instante UTC (`start_date`) convertido a Madrid con `fechaMadrid`,
  NO de `start_date_local` (que viene en la TZ de la actividad).
- **Un commit por cambio**, con lint y build en verde. Auditar antes de tocar.
- **Vite pineado a `^7` + `@vitejs/plugin-react@^5`**: Vite 8 (rolldown) genera
  bundles sin los módulos JSX propios (página en blanco sin error). No subir sin
  verificar que el bundle de entrada contiene strings de la app.
- Dev local: `netlify dev` (puerto 8888, sirve frontend + functions).

## Stack

- Frontend: React 19 + Vite, react-router-dom v7, recharts (solo en las rutas de
  análisis, cargado con `React.lazy`).
- Backend: Netlify Functions (CommonJS).
- DB/Auth: Supabase (cliente JS solo en el frontend con la anon key).
- Datos: Strava API v3 · Entrega: Intervals.icu API.

## Autenticación de las Netlify Functions

- Las funciones que devuelven o mutan datos exigen `Authorization: Bearer <jwt>`
  de la sesión de Supabase. Verificación en `netlify/functions/lib/auth.js`
  (`verifyAuth`: GET `/auth/v1/user` + whitelist en `coaches`).
- **La identidad NUNCA se lee del body**: el coach sale del JWT. `athleteId` puede
  venir del body porque se autoriza contra `coach_athletes` (`canAccessAthlete`), o
  `uid === athleteId` si es el propio atleta. En `send-to-intervals`, coach y atleta
  se derivan de la sesión prescrita.
- OAuth de Strava con `state` firmado (HMAC-SHA256 + nonce + expiración) en
  `lib/oauth-state.js` — anti-CSRF de vinculación.
- Rate limit best-effort vía RPC `check_rate_limit` (`lib/rate-limit.js`), aplicado
  en `accept-invitation` y `verify-intervals-key`. Fail-open.
- En el frontend, usar `authHeaders()` (`src/lib/authHeaders.js`) en todos los fetch.
- `VITE_COACH_SECRET`/`COACH_FUNCTION_SECRET` están OBSOLETOS; el código no los usa.
  NUNCA reintroducir un secreto compartido con prefijo `VITE_` como autenticación.

## Métricas — fuente ÚNICA de verdad

- **`netlify/functions/lib/metrics.js`** (backend): `mapDisciplina`, `intensidadPct`
  (SIN redondear), `zonaFc` (recibe la intensidad sin redondear — 79.96 % es Z3, no
  Z4), `tssEstimado` (hrTSS), `cargaActividad`, `fechaMadrid`, `round`.
- **TSS**: `cargaActividad(movingTimeSec, fcMedia, fcMax, disciplina)`:
  - con FC → hrTSS = horas × (intensidad/100)² × 100.
  - sin FC + disciplina de entrenamiento → estimación por `TSS_POR_HORA_SIN_FC`
    (swim 55, bike 50, run 65, strength 40), marcada `tss_estimado_sin_fc: true`
    (el frontend la muestra con `~`).
  - `'other'` (golf, paseos) → sin TSS ni zona, etiqueta "no computa".
  - Dashboard y vista de atleta llaman al MISMO helper → mismo TSS.
- **`'other'` se excluye del volumen** (horas/km/nº, cards de 7 días y Línea de
  Transición). El volumen es solo natación/bici/carrera/fuerza.
- **ATL/CTL/TSB**: `src/lib/carga.js` (`computeCargaDiaria`/`computeCargaHoy`),
  fuente única compartida por `TSSChart` y `athleteStats`. Medias móviles
  EXPONENCIALES (EWMA), constantes 7 (ATL) y 42 (CTL), calculadas día a día hasta
  HOY (Madrid): la carga decae hasta hoy aunque no haya actividad reciente.
  TSB = CTL − ATL de hoy.
- **Calentamiento**: la carga se calcula sobre una ventana fija de 26 semanas
  (fetch dedicado en `StravaAnalysis`), independiente del selector de semanas, que
  solo recorta lo que se DIBUJA. Con poco histórico la CTL queda algo subestimada.
- `fc_maxima` del perfil (fallback 185). Ritmos fuera de 2–20 min/km → null.

## Entrega a Intervals.icu (`send-to-intervals.js`)

- Texto del workout: `lib/intervals-text.cjs` (fuente única; el preview del builder
  lo re-exporta desde `src/lib/intervalsText.js`). **Las notas del entrenador NUNCA
  se envían al reloj** (`incluirNotas:false` en el envío; `true` solo en el preview).
- Idempotente: si la sesión ya tenía `intervals_event_id`, borra el evento anterior
  antes de recrear. Compensación: si el PATCH a Supabase no se confirma tras
  reintentos, borra el evento recién creado (evita huérfanos). Ver auditoría para la
  ventana no atómica del borrado previo.

## Estructura

- `src/components/` — Login, Dashboard, AthleteView (coach), SessionsList,
  WorkoutBuilder/WorkoutDetail (+ `workout/`), ActivityDetail, PolylineMap,
  WeekCompare, `charts/` (ChartCard, PowerChart, TSSChart), `shared/`
  (StravaAnalysis, TransitionLine).
- `src/pages/` — AthleteHome (atleta), IntervalsSetup, JoinPage (invitaciones).
- `src/lib/` — supabase, theme, authHeaders, chartUtils, metrics(front), carga,
  athleteStats, activityFormat, transitionColumns, intervalsText.
- `netlify/functions/` — coach-dashboard-data, coach-athlete-data,
  coach-activity-detail, send-to-intervals, strava-auth, verify-intervals-key,
  accept-invitation; `lib/` (auth, http, supabase-rest, strava, metrics,
  rate-limit, oauth-state, intervals-text.cjs).
- `supabase/migrations/` — 001–005 (+ ficheros `PENDIENTE_*` que NO se aplican solos).
- `audit/` — `recompute.mjs` (recálculo independiente de métricas). `real-data.mjs`
  está gitignoreado (actividades reales con FC).

## Variables de entorno

Frontend (`.env`, prefijo `VITE_`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Backend (Netlify env): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (⚠️ no
`SUPABASE_SERVICE_KEY`), `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.

## Columnas reales de `profiles` (verificadas)

`strava_token`, `strava_refresh_token`, `strava_token_expires_at` (bigint unix),
`fc_maxima` (int, ⚠️ no `fc_max`), `intervals_api_key`, `intervals_athlete_id`,
`nombre`, `email`.

## Design system (dirección visual aprobada 2026-07)

Color **por disciplina** sobre fondo oscuro Void. Constantes en `src/lib/theme.js`
(COLORS, FONTS, DISCIPLINE_COLORS, cardStyle) — no hardcodear.

| Token | Hex | Uso |
|---|---|---|
| Void (background) | `#0B0D12` | Fondo |
| Slate (card) | `#12151C` | Superficie de cards |
| Border | `#1B202C` | Bordes/separadores |
| Ink (textPrimary) | `#EDEEF2` | Texto primario, números |
| Mist (textSecondary) | `#8A90A0` | Texto secundario |
| Mist oscuro (textTertiary) | `#5C6270` | Terciario |
| Swim · Neritic Teal | `#2FBFAF` | Natación · `accent` de marca |
| Bike · Asphalt Amber | `#E8934A` | Ciclismo |
| Run · Exertion Coral | `#E85D5D` | Running · `error` |
| Load · Dusk Violet | `#8B7FD1` | TSS/carga (`strength` también) |

Tipografía (Google Fonts en `index.html`): **JetBrains Mono** para TODO valor
numérico (km, ritmo, TSS, FC, fechas); **Archivo** para nombres, labels y texto.

### Línea de Transición
Barras apiladas por semana segmentadas por disciplina, con estados por relleno+borde
(completado/programado/descanso). `src/components/shared/TransitionLine.jsx`.
