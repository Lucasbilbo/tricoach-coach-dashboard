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
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_COACH_SECRET`

Backend (Netlify env):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COACH_FUNCTION_SECRET`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`

## Estructura

- `src/components/` — Login, Dashboard, AthleteView
- `src/lib/` — supabase.js (cliente), theme.js (design system)
- `netlify/functions/` — coach-athlete-data.js (CommonJS)
- `supabase/migrations/` — SQL de tablas del coach
