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

## Design system (dirección visual aprobada 2026-07)

Sistema de color **por disciplina** sobre fondo oscuro Void. Al mezclar 3 deportes
en una misma vista de datos, el color deja de ser decoración y pasa a ser información.

### Tokens de color
| Token | Hex | Uso |
|---|---|---|
| Void (background) | `#0B0D12` | Fondo de la vista |
| Slate (card) | `#12151C` | Superficie de cards |
| Border (cardBorder) | `#1B202C` | Bordes de cards, separadores |
| Ink (textPrimary) | `#EDEEF2` | Texto primario, números neutros |
| Mist (textSecondary) | `#8A90A0` | Texto secundario, labels |
| Mist oscuro (textTertiary) | `#5C6270` | Texto terciario (subetiquetas) |
| Swim · Neritic Teal | `#2FBFAF` | Natación · también `accent` de marca |
| Bike · Asphalt Amber | `#E8934A` | Ciclismo |
| Run · Exertion Coral | `#E85D5D` | Running · también `error` |
| Load · Dusk Violet | `#8B7FD1` | TSS/carga (no es disciplina) |
| Rest border | `#2A3040` | Borde punteado de días de descanso |

`strength` → Load violet `#8B7FD1`; `other` → Mist oscuro `#5C6270`.
Contraste verificado (WCAG sobre Void): Swim 8.51:1 (AAA), Bike 8.06:1 (AAA),
Run 5.70:1 (AA), Load 5.60:1 (AA).

### Tipografía (Google Fonts en `index.html`)
- **JetBrains Mono** (400/500/600/700) — TODO valor numérico: km, ritmo, TSS,
  potencia, FC, minutos, fechas. Tabular figures. `FONTS.mono` en theme.
- **Archivo** (400/500/600/700) — nombres, labels, texto de sesión, botones. `FONTS.sans`.
- Tamaños: 34px/700 nombre atleta (24px móvil) · 26px/600 stat hero (19px móvil)
  · 15px/600 semana · 14px/400 nombre sesión · 13/12/11/10px labels y metadatos.

### Spacing / Radius
- Radius: card 12px (10px móvil), contenedor de página 16px.
- Gap estándar entre cards 16px. Padding interno de card 18-24px.

### Elemento de firma — Línea de Transición
Franja de barras apiladas por día (7 columnas), cada barra segmentada por
disciplina, con 3 estados que se distinguen por **relleno + borde** (no solo color):
completado (relleno sólido, sin borde), programado (borde punteado color disciplina
+ relleno opacity 0.18), descanso (borde punteado `#2A3040`, altura mínima ~14%, sin
relleno). Anima `height`/`width` con `transition: 180ms ease` al cambiar de semana
(corto a propósito). Componente: `src/components/shared/TransitionLine.jsx`.

Constantes centralizadas en `src/lib/theme.js` (COLORS, FONTS, DISCIPLINE_COLORS,
cardStyle, etc.) — no hardcodear colores ni fuentes en componentes.

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
