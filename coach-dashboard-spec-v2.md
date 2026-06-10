# Coach Dashboard — Spec v2 (estado real del proyecto)

Dashboard web para entrenador de triatlón. React + Vite (JS sin TypeScript),
Supabase (auth + datos), Netlify Functions (CommonJS) y Strava API v3.

Actualizado: 2026-06-10. Refleja el código en `main`, no el diseño inicial.

## Variables de entorno

Frontend (`.env` local y Netlify, prefijo `VITE_`):

| Variable | Uso |
|---|---|
| `VITE_SUPABASE_URL` | Cliente Supabase del frontend |
| `VITE_SUPABASE_ANON_KEY` | Cliente Supabase del frontend (anon) |
| `VITE_COACH_SECRET` | Valor que viaja en el header `x-coach-secret` hacia las functions |

Backend (Netlify env, solo functions):

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | REST API de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key (bypassa RLS). ⚠️ NO es `SUPABASE_SERVICE_KEY` |
| `COACH_FUNCTION_SECRET` | Secret compartido; las functions lo comparan con el header `x-coach-secret`. Su valor debe coincidir con `VITE_COACH_SECRET` |
| `STRAVA_CLIENT_ID` | OAuth Strava |
| `STRAVA_CLIENT_SECRET` | OAuth Strava |

Historial de nombres (errores ya corregidos — no reintroducir):
- `SUPABASE_SERVICE_KEY` → el nombre real es `SUPABASE_SERVICE_ROLE_KEY`
- La function leía `COACH_SECRET` → ahora lee `COACH_FUNCTION_SECRET`, que es como está configurado en Netlify

## Arquitectura de ficheros

```
netlify/functions/
  package.json              # {"type":"commonjs"} — anula el "type":"module" raíz
  coach-athlete-data.js     # POST {athleteId, coachId, weeks} → {atleta, actividades, semanas}
  coach-activity-detail.js  # POST {activityId, athleteId, coachId} → {actividad, vueltas}
  coach-dashboard-data.js   # POST {coachId} → [{athlete_id, nombre, km_semana, ...}]
src/
  App.jsx                   # Router + sesión (rutas: /, /dashboard, /athlete/:id)
  lib/
    supabase.js             # Cliente Supabase (frontend, anon key)
    theme.js                # Design system: COLORS, DISCIPLINE_COLORS, estilos base
    chartUtils.js           # lunesDeSemana, ritmoToDecimal, decimalToRitmo, mediaMovil…
  components/
    Login.jsx               # Email+password y Google OAuth; verifica tabla coaches
    Dashboard.jsx           # Cards de atletas con métricas 7 días (coach-dashboard-data)
    AthleteView.jsx          # Tabs Análisis / Sesiones prescritas, métricas, tabla
    ActivityDetail.jsx      # Modal detalle de actividad (splits, vueltas, mapa)
    PolylineMap.jsx         # Decodificador de polyline de Google + render en canvas
    PrescribeModal.jsx      # Alta/edición de sesiones (INSERT/UPSERT coach_sessions)
    SessionsList.jsx        # Lista de sesiones con estado Completada/Pendiente/Programada
    charts/
      ChartCard.jsx         # Card contenedora con título uppercase
      VolumeChart.jsx       # Barras apiladas horas/semana por disciplina
      ZonesChart.jsx        # Distribución de tiempo en zonas FC (Z1–Z5)
      PaceChart.jsx         # Progresión ritmo running (eje invertido + media móvil 3)
      PowerChart.jsx        # Progresión potencia ciclismo (null si <3 con vatios)
      TSSChart.jsx          # TSS semanal + ATL/CTL si ≥8 semanas
supabase/migrations/
  001_coach_tables.sql      # coaches, coach_athletes, coach_sessions + RLS
  002_rls_forja_tables.sql  # RLS en forja_* y training_cycles (aplicada el 2026-06-10)
```

## Columnas reales de `profiles` (Supabase TriCoach)

Las que usan las functions — verificadas contra la base de datos real:

| Columna | Tipo | Uso |
|---|---|---|
| `strava_token` | text | Access token. ⚠️ NO es `strava_access_token` |
| `strava_refresh_token` | text | Refresh token |
| `strava_token_expires_at` | bigint | Unix timestamp. ⚠️ NO es `strava_expires_at` |
| `fc_maxima` | int | FC máxima del atleta. ⚠️ NO es `fc_max`. Fallback: 185 |
| `nombre`, `email` | text | Identificación del atleta |

## Fases implementadas

1. **Fase 1 — Base**: scaffold, login (email+password y Google OAuth, ambos
   verifican pertenencia a `coaches`), dashboard de atletas, vista de atleta con
   métricas resumen y tabla de actividades, function `coach-athlete-data`.
2. **Fase 2 — Gráficos**: VolumeChart, ZonesChart, PaceChart, PowerChart,
   TSSChart (Recharts, design system, 260px).
3. **Fase 3 — Prescripción**: PrescribeModal (INSERT/UPSERT), SessionsList con
   estados según actividades reales, tabs en AthleteView.
4. **Fase 4 — Detalle de actividad**: function `coach-activity-detail` (detalle +
   laps de Strava en paralelo), modal fullscreen con métricas, splits por km con
   gradiente de ritmo, vueltas, y mapa de ruta dibujado en canvas a partir del
   polyline decodificado (sin librerías de mapas).
   Extra: `coach-dashboard-data` para las cards del dashboard con métricas
   reales de los últimos 7 días y semáforo de TSS (<300 verde, 300–450 amarillo,
   >450 rojo).

## Reglas de saneamiento de datos

- Ritmos fuera de 2.0–20.0 min/km → `null` (outliers de GPS/cinta). Aplicado en
  `coach-athlete-data`, `coach-activity-detail` y como red de seguridad en
  `PaceChart`.
- TSS estimado = `(duracion_min/60) × (intensidad_pct/100)² × 100`, solo si hay
  FC; `intensidad_pct = fc_media / fc_maxima × 100` (fallback 185).
- Semanas agrupadas por lunes en Europe/Madrid.

## ⚠️ Nota de tooling: Vite 8 rompe el bundle

Vite 8 (rolldown) + `@vitejs/plugin-react` 6 produce builds "exitosos" cuyo
bundle NO contiene ningún módulo JSX propio (ni siquiera el `createRoot`) →
página en blanco en producción sin error de build. El proyecto está pineado a
`vite@^7` + `@vitejs/plugin-react@^5`. No subir de versión sin verificar que el
bundle contiene strings de la app, p. ej.:

```bash
node -e "console.log(require('fs').readFileSync('dist/assets/<bundle>.js','utf8').includes('Acceso restringido'))"
```
