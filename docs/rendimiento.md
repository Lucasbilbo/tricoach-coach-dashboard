<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Rendimiento y caché · latencia Ohio↔Frankfurt · peticiones en cola. Índice: CLAUDE.md. -->

## Rendimiento y caché (2026-10)

- **Cliente**: TODA lectura de `coach-athlete-data` pasa por `pedirDatosAtleta`
  (`src/lib/athleteData.js` → `athleteDataCache.js`): deduplica peticiones en
  vuelo, reutiliza respuestas OK 5 min (clave atleta|weeks|records) y nunca
  cachea errores. Se invalida con `invalidarDatosAtleta(athleteId)` al guardar,
  editar o borrar sesiones (los metros de técnica salen de `coach_sessions`) y
  con el botón "Actualizar" del análisis. No usar `fetch` directo a esa función.
- **Panel del coach**: `coach-dashboard-data` y el resumen de temporadas pasan
  por `src/lib/panelData.js` (`valueCache.js`, 5 min, sin cachear fallos). Se
  invalidan al cambiar sesiones (`invalidarDatosAtleta` también invalida el
  dashboard) y al guardar/borrar pruebas (`invalidarTemporadas`).
- **Cambio de usuario**: `src/lib/clientCache.js` vacía todas las cachés
  registradas (`registrarCache`) en `onAuthStateChange` si cambia el uid.
- **Actividades de Strava en Supabase** (migración 012, aplicada 2026-10-20):
  tablas `strava_actividades` (resumen tal cual de `/athlete/activities` en
  `datos` jsonb) y `strava_sync` (cobertura y última sync por atleta). RLS sin
  policies: solo la service key. Lógica en `netlify/functions/lib/actividades-store.js`,
  usada por `coach-athlete-data` y `coach-dashboard-data`: ventana no cubierta o
  `force` → Strava entero y se guarda; sync < 5 min → solo BD; más vieja →
  Strava desde (última sync − 7 días) + BD; Strava caído con ventana cubierta →
  BD. Si las tablas fallan, cae a Strava directo. Con el webhook activo la
  frescura pasa de 5 min a 6 h (ver «Webhook de Strava»). El token de Strava solo se
  refresca si hay que llamar. "Actualizar" manda `force:true` 15 s
  (`forzarDatosAtleta`). Webhook de Strava ACTIVO desde 2026-11-26 (ver abajo).
- **Webhook de Strava** (2026-11-26, ACTIVO: suscripción 391494 creada con
  `callback_url` en `jongarcia.getricoach.com`, y `STRAVA_WEBHOOK_VERIFY_TOKEN`,
  `STRAVA_WEBHOOK_SUBSCRIPTION_ID` y `STRAVA_WEBHOOK_ACTIVO=1` puestas en Netlify.
  Comprobar que está viva: `curl -G https://www.strava.com/api/v3/push_subscriptions
  -d client_id=… -d client_secret=…`. Para volver a la frescura de 5 min: borrar
  `STRAVA_WEBHOOK_ACTIVO` y redesplegar). Pasos de la alta, por si hay que repetirla:
  `netlify/functions/strava-webhook.js` + `lib/strava-webhook.js`. Por cada
  actividad creada/editada/borrada envejece la `strava_sync` de ese atleta (el
  atleta sale del `owner_id` buscando en `strava_actividades.datos->athlete->>id`;
  sin migraciones), así la siguiente lectura pide a Strava solo lo nuevo; sin
  eventos se lee solo de Supabase hasta 6 h. Responde 200 siempre (Strava
  desactiva la suscripción si falla). Activarlo: (1) en Netlify, variable
  `STRAVA_WEBHOOK_VERIFY_TOKEN` (cadena aleatoria) y deploy; (2) crear la
  suscripción: `curl -X POST https://www.strava.com/api/v3/push_subscriptions
  -F client_id=… -F client_secret=… -F callback_url=https://<dominio>/.netlify/functions/strava-webhook
  -F verify_token=<el mismo>` (devuelve `id`); (3) `STRAVA_WEBHOOK_SUBSCRIPTION_ID=<id>`
  y `STRAVA_WEBHOOK_ACTIVO=1`, deploy. Strava admite UNA suscripción por app:
  si TriCoach v2 usa la misma app de Strava, la comparten.
- **Servidor**: splits de Strava cacheados por actividad 24 h en memoria de la
  instancia (`lib/ttl-cache.js`, tope 500; solo respuestas válidas).
- **Medición**: `coach-athlete-data` devuelve `Server-Timing` (`total`,
  `strava-lista`, `strava-splits`, `splits-cache`). Netlify solo retiene ~1 h de
  observabilidad en este plan; medir con DevTools o `performance.getEntriesByType`.
- Medido en producción 2026-10-20: 1ª carga 2 peticiones (~3,5–4 s, 15 splits a
  Strava); cambio de selector 1 petición con los 15 splits desde caché; volver a
  un rango ya visto o reentrar desde el dashboard: 0 peticiones.
  Volver de un atleta al dashboard: 0 peticiones (antes ~4 s + ~2 s).
  Con la copia en Supabase: recargar un atleta ya sincronizado ~1,7 s sin tocar
  Strava (antes ~4–5 s); mismos KPIs que leyendo de Strava. 172 actividades de
  26 semanas ≈ 1,2 MB.

### Latencia Ohio ↔ Frankfurt (auditoría 2026-11-25)
- Las Netlify Functions corren en la región por defecto **`cmh` (Ohio)** y Supabase
  está en **eu-central-1 (Frankfurt)**: cada ida a Supabase desde una función
  cuesta ~200–500 ms (medido en edge_logs, `request.cf.colo = CMH`), frente a
  ~25–60 ms desde el navegador (MAD). La BD responde en decenas de ms. Informe:
  `auditorias/AUDITORIA_RENDIMIENTO_2026-11-25.md` (Project de Claude).
- **Regla**: en una función, nada de idas a Supabase en serie si no dependen
  entre sí. Patrones aplicados:
  - `verifyAuth` consulta `coaches` en paralelo con `/auth/v1/user` usando el
    `sub` SIN verificar (`uidSinVerificar`); solo vale si coincide con el uid
    verificado. Mismo patrón en `my-connections` (perfil) y
    `coach-dashboard-data` (atletas + perfiles en UNA query embebida
    `coach_athletes?select=athlete_id,perfil:profiles!coach_athletes_athlete_id_fkey(*)`).
  - `coach-athlete-data` lanza perfil y ajustes junto a la autorización (no se
    usan ni devuelven si no autoriza).
  - `actividades-store` incremental: `[Strava ∥ leer BD]` → `[guardar ∥ borrar]`
    → `guardarSync`, y combina en memoria.
- **Frontend**: `/home` no espera a `misConexiones` para pintar los entrenos; el
  panel del coach guarda la última respuesta en localStorage por uid
  (`dashboardGuardado`, 7 días, se borra al cambiar de usuario) y la pinta al
  instante con «Actualizando…».
- **Gráficos de Análisis** (2026-11-26): `StravaAnalysis` solo se monta cuando ya
  han llegado los datos, así que su `React.lazy` pedía Recharts DESPUÉS de la
  función (Forma y Carga semanal salían como cuadro vacío unos segundos).
  `src/lib/precargarGraficos.js` pide FormaChart y TSSChart al abrir la pestaña
  Análisis (efecto en `AthleteHome` y `AthleteView`, también con `?tab=analisis`),
  en paralelo con los datos. Solo ahí: las demás pestañas NO descargan Recharts.
  Mismas rutas que en `StravaAnalysis` = mismo chunk. No precargar en el arranque.
- **Peticiones concurrentes en cola (2026-11-26)**: medido en producción, dos
  llamadas a `coach-athlete-data` a la vez NO corren en paralelo: la segunda
  espera a que acabe la primera (hueco de ~1,9 s entre su `total` de servidor y
  el tiempo del navegador; en serie el hueco es de 240–480 ms). No es arranque en
  frío (la función son 148 KB sin dependencias). Regla: **no lanzar dos llamadas
  a la misma función a la vez**; unirlas. Aplicado: `cargaSemanas` en
  `coach-athlete-data` (solo con `weeks`, mayor que él, sin rango) devuelve en
  `carga: { actividades, semanas }` la serie de 26 semanas de ATL/CTL en la misma
  respuesta (periodo exacto por el `after` de Strava; best-effort) y
  `athleteDataCache` la SIEMBRA como la clave (26, records:false), también en
  vuelo (`pedirDatosAtleta(id, weeks, { carga: SEMANAS_CARGA })`); si la respuesta
  no la trae, se pide aparte como antes. Tests: `athlete-data-cache`,
  `coach-athlete-data`. **Trampa**: los efectos de un hijo corren ANTES que los
  del padre; si `StravaAnalysis` se monta vacío en el primer render, pide la
  serie de 26 semanas por su cuenta y no hay unión posible (pasó en `/home`:
  `cargandoStrava` empieza en false; ahora «sin datos ni error» cuenta como
  cargando). Comprobar siempre en producción con un hook de `fetch` que sale UNA
  llamada con `cargaSemanas` al abrir Análisis.
  **Sesiones (2026-11-27)**: si la sesión pasada más antigua queda fuera de las
  8 semanas base, `SessionsList` pide SIEMPRE la ventana de 26 semanas
  (`ESTADO_MAX_SEMANAS`), no una a medida: es la clave que `AthleteView` ya
  sembró, así que es un acierto de caché y no una segunda llamada a Strava.
- Hecho 2026-11-26: verificación del JWT en local, cachés de auth y webhook de
  Strava (activo en producción, ver arriba).
- Pendiente: mover las functions a **`fra`** (Netlify → Cloud compute →
  Functions → Region; requiere plan Pro). Es la mejora grande: cada ida
  bajaría a ~10–30 ms. Strava (EE. UU.) iría algo más lento, pero casi nunca
  está en el camino crítico. Keep-alive en `https` NO ayuda aquí (el coste es
  Cloudflare Ohio → origen Frankfurt, no el TLS Lambda → Cloudflare).
