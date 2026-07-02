# TriCoach — Coach Dashboard

Dashboard web para entrenador de triatlón. Lee datos de atletas (Strava vía Supabase) y muestra métricas de entrenamiento.

## Reglas del proyecto

- **React + Vite con JavaScript** — sin TypeScript, nunca.
- **Netlify Functions SIEMPRE CommonJS** — `require()` y `exports.handler`, nunca `import`/`export`.
- **Inline styles únicamente** — sin librerías UI (no Tailwind, no MUI, no styled-components).
- **Strava tokens NUNCA en frontend** — siempre en backend (Netlify Functions) con la service key de Supabase.
- **Timezone: Europe/Madrid** — toda agrupación por fechas/semanas usa esta zona horaria.
- **`git push origin main` después de cada commit.**
- **Dev local: `netlify dev`** (puerto 8888, sirve frontend + functions).

## Stack

- Frontend: React 19 + Vite, react-router-dom, recharts
- ⚠️ Vite pineado a `^7` + `@vitejs/plugin-react@^5`: Vite 8 (rolldown) + plugin-react 6 genera bundles sin los módulos JSX propios (página en blanco sin error de build). Ver `coach-dashboard-spec-v2.md`.
- Backend: Netlify Functions (CommonJS, módulo `https` nativo, sin supabase-js en functions)
- DB/Auth: Supabase (cliente JS solo en frontend con anon key)
- Datos: Strava API v3

## Design system

- Background: `#0A0F1E`
- Cards: `#0F1729` con border `1px solid rgba(255,255,255,0.06)`
- Accent: `#00D4FF`
- Texto primario: `#F1F5F9`, secundario: `#64748B`
- Fuente: Inter (Google Fonts en `index.html`)
- Colores por disciplina — run: `#FF4D6D`, bike: `#00E5A0`, swim: `#00D4FF`, strength: `#7C3AED`

Constantes centralizadas en `src/lib/theme.js` — no hardcodear colores en componentes.

## Variables de entorno

Frontend (`.env`, prefijo VITE_):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Backend (Netlify env):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`

## Autenticación de las Netlify Functions (desde S2, julio 2026)

- Las funciones que devuelven datos (`coach-dashboard-data`, `coach-athlete-data`,
  `coach-activity-detail`, `send-to-intervals`) exigen `Authorization: Bearer <jwt>`
  de la sesión de Supabase. Verificación en `netlify/functions/lib/auth.js`
  (GET /auth/v1/user + whitelist en `coaches`).
- La identidad NUNCA se lee del body: el coach sale del JWT; `athleteId` puede venir
  del body porque se verifica contra `coach_athletes` (o `uid === athleteId` si es
  el propio atleta). En `send-to-intervals`, coach y atleta se derivan de la sesión.
- En el frontend, usar `authHeaders()` de `src/lib/authHeaders.js` en todos los fetch.
- `VITE_COACH_SECRET`/`COACH_FUNCTION_SECRET` están OBSOLETOS: el código ya no los
  usa. Siguen definidos en Netlify solo por si hiciera falta un rollback — se pueden
  borrar cuando este cambio lleve unos días estable. NUNCA reintroducir un secreto
  compartido con prefijo VITE_ como mecanismo de autenticación.

## Estructura

- `src/components/` — Login, Dashboard, AthleteView
- `src/lib/` — supabase.js (cliente), theme.js (design system)
- `netlify/functions/` — coach-athlete-data.js (CommonJS)
- `supabase/migrations/` — SQL de tablas del coach
