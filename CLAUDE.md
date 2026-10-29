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

## Stack

- Frontend: React 19 + Vite, react-router-dom v7, recharts. Recharts (~100 KB
  gzip) va en chunks propios: los gráficos se importan con `React.lazy` DENTRO de
  `StravaAnalysis`, así que solo se descarga al abrir la pestaña Análisis (no en
  Sesiones/Entrenos ni en el dashboard).
- Backend: Netlify Functions (CommonJS).
- DB/Auth: Supabase (cliente JS solo en el frontend con la anon key).
- Datos: Strava API v3 · Entrega: Intervals.icu API.

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
  BD. Si las tablas fallan, cae a Strava directo. El token de Strava solo se
  refresca si hay que llamar. "Actualizar" manda `force:true` 15 s
  (`forzarDatosAtleta`). NO hay webhook de Strava en ningún proyecto.
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

## Autenticación de las Netlify Functions

- Las funciones que devuelven o mutan datos exigen `Authorization: Bearer <jwt>`
  de la sesión de Supabase. Verificación en `netlify/functions/lib/auth.js`
  (`verifyAuth`: GET `/auth/v1/user` + whitelist en `coaches`).
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
  Permissions-Policy y CSP con los únicos orígenes que usa la app (Supabase y
  Google Fonts). `/assets/*` inmutable 1 año (llevan hash). Si se añade un
  origen nuevo (imágenes, otra API) hay que añadirlo a la CSP.
- Contraseña de alta: mínimo 8 caracteres (JoinPage + accept-invitation).
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
- Idempotente: si la sesión ya tenía `intervals_event_id`, crea el evento nuevo y,
  confirmado en BD, borra el anterior. Compensación: si el PATCH a Supabase no se
  confirma tras reintentos, borra el evento recién creado (el anterior sigue intacto).

### Qué llega al reloj (2026-10)
- **Bici y carrera por PULSO**: la zona se envía como `Zn HR` (también en bici) y
  el objetivo por defecto es `Z1 HR`. Los atletas no tienen potenciómetro; el
  builder no ofrece potencia (se sigue generando para sesiones antiguas).
  **Natación sin objetivo por defecto** (el coach sí puede elegir ritmo /100m, zona de ritmo —`Zn Pace`, requiere ritmo umbral de natación en Intervals— o FC %) (antes `Z1 Pace` → avisos falsos).
- Ritmo exacto o rango (`4:50-5:10/km Pace`), validado en el builder.
- El material de cada paso va en el texto del paso. **El texto (cue) va DELANTE
  de la duración** (`- Pies · aletas, tabla 200mtr`): Intervals solo lleva al reloj
  lo que precede a la duración; lo de detrás se pierde (bug 2026-10, antes `@…`
  al final). `cueSeguro` neutraliza dentro del cue lo que Intervals leería como
  orden (Z4 → Zona 4, 10m → 10 minutos, 1:45 → 1.45, 4x → 4 veces, % ).
- **Natación: descansos NATIVOS** (`intensity=rest`): los pasos de descanso
  (nombre descanso/rec/pausa, o por segundos sin nombre ni objetivo) se mandan
  como descanso de Garmin (cuenta atrás), no como tiempo nadando. Solo natación.
- **Natación: pausa "pulsar vuelta" entre bloques** (`conPausas`): entre cada
  bloque y el siguiente, `- Siguiente: 300 metros Progresivo · palas, aletas 15s
  press lap intensity=rest` (con `Quita el material ·` delante si toca quitarlo).
  Dice qué viene (≤60 caracteres, Garmin corta). Se omite si ya hay descanso ahí
  (serie que acaba en descanso o bloque descanso), salvo cambio de material.
  Dentro de una serie solo si cambia el material sin descanso de por medio. Se
  calcula al generar (no se guarda); `WorkoutDetail` la pinta como "Pulsa
  vuelta · …". Intervals no tiene campo de equipo ni de técnica (drill) en
  natación (petición abierta 2026-08): el material solo llega como texto.
- **Natación: técnica / pies** (`esTecnica`: material `tabla` o nombre pies,
  patada, técnica, drill, kick): el reloj no cuenta largos sin brazada, así que
  el paso va con `press lap` ("pulsa vuelta al acabar") y no se queda esperando
  largos. El panel SUMA esos metros a la natación del día: `lib/tecnica.js`
  (`sumarTecnica`) en `coach-athlete-data` (distancia, volumen, Línea de
  Transición, ritmo; marca `metros_tecnica`, la tabla muestra "+200 téc.") y en
  `coach-dashboard-data` (km de 7 días). Cada sesión suma a UNA actividad.
- Editar una sesión ya enviada la **reenvía sola** ("Guardar y actualizar reloj");
  se marca `enviado_a_garmin=false` hasta confirmar, así un fallo no deja un ✅
  sobre una versión vieja. `duracion_min` se calcula al guardar (null si hay
  pasos por distancia). Para agenda, avisos y emparejar actividades se usa
  `duracionPrevista` (tssPrevisto.js): la real o la ESTIMADA con los ritmos,
  que la UI marca con "~" y borde discontinuo (decidido 2026-10-29; ±10 %
  frente al tiempo total de Strava). No se guarda: se calcula al pintar.
- Avisos: si el reloj queda con el entreno antiguo (`anterior_retirado:false`
  de send-to-intervals / move-session) sale un aviso ámbar (`ui/Aviso`,
  `lib/avisosReloj.js`). El creador llama a `onSaved({ cerrar })`: con
  `cerrar:false` (guardado a medias) el padre refresca pero no lo cierra.
- Reenvío: **primero crea** el evento nuevo y **después borra** el anterior
  (antes al revés: un fallo intermedio dejaba al atleta sin entreno).
- Borrar una sesión pasa por `delete-session.js`, que quita también el evento
  de Intervals (→ reloj); si Intervals falla, la sesión NO se borra.
- HTTP de Intervals compartido en `lib/intervals-api.js`. Tests: `test/entrenos-reloj.test.js`.

### Atajos del coach (2026-10)
- **Escritura rápida** (`workout/parser.js`, `AtajosBuilder.jsx`): una línea →
  bloques. `15' Z1 + 8x(1' Z5 / 1' Z1) + 10' Z1`; `'` min, `"` seg, m/km, Z1–Z5,
  ritmo `4:50-5:10`, `cal`/`vc`, material de natación. Series también SIN
  paréntesis: `8x100m 1:45 rec 20"`, `6x3' Z4 r2'`, `100m x 8 a 1:45` (el
  descanso `rec`/`r`/`descanso` es el 2º paso). En natación un número suelto son
  metros (`400 cal`). Bloques separados por `+`, `;` o `, `. Nunca interpretar
  en silencio: si queda un `Nx` en el nombre del paso, da error. Con 3+ bloques el primero
  y el último sueltos pasan a calentamiento / vuelta a la calma. Tests: `test/parser.test.js`.
- **Fuerza / Hyrox "tal cual"** (2026-10-22, migración 014): en fuerza el coach
  puede pegar el entreno como texto y/o subir capturas (también Ctrl+V). Va en
  `workout_steps.adjunto = { texto, imagenes }`; las capturas, reducidas a JPEG
  de 1800 px, en el bucket PRIVADO `entrenos-adjuntos/<athlete_id>/<uuid>.jpg`
  (sube/borra solo un coach vinculado; leen atleta o coach; URL firmada 1 h).
  Al reloj solo llegan nombre y duración (`moving_time` en el evento si no hay
  pasos; el texto NUNCA va a la descripción). Duración manual si no hay
  bloques. Helpers en `src/lib/adjuntos.js` (`adjuntoDe`, `tieneEntreno`), UI en
  `AdjuntoEntreno.jsx` (editor + vista). Quitar una captura no la borra del
  bucket (la sesión guardada podría seguir usándola).
- **Duplicar** sesión (SessionsList): copia sin id ni envío, solo falta el día.
- **Plantillas**: tabla `coach_plantillas` (migración 008, RLS `coach_id = auth.uid()`).
  Si la tabla no existe, la sección no se muestra.
- Estado Hecha/Pendiente: `src/lib/estadoSesion.js` (fuente única coach + atleta;
  una actividad completa como mucho una sesión). Tests: `test/estado-sesion.test.js`.

### Plan → hecho → cómo fue (2026-10-22)
- **Feedback del atleta** (migración 015, aplicada): tabla `sesion_feedback`, una
  fila por sesión (PK `session_id`): RPE 1–10, sensaciones 1–5, comentario,
  molestias (+ dónde). RLS: lee atleta o coach vinculado; escribe solo el atleta
  y solo sobre sesiones SUYAS (verificado simulando usuarios). Lógica pura
  `src/lib/feedback.js`, datos `feedbackApi.js`, UI `FeedbackSesion.jsx`
  (editor en /home: historial siempre desplegable + "¿Cómo te fue?" hoy; Jon lo
  ve en la tarjeta, molestias en rojo). NO se usa como carga (sRPE) a propósito:
  solo cambiaría actividades sin pulso y el TSS se calcula en dos sitios.
- **Cumplimiento** (`src/lib/cumplimiento.js`, `Cumplimiento.jsx`): "62 de 75
  min" junto a Completada, ámbar/rojo con % fuera de 80–120 % (bandas de
  TrainingPeaks). Por duración o, si todos los pasos van por distancia, por
  metros (los descansos no cuentan). **Natación NUNCA por duración**: Strava no
  cuenta los descansos (70' bien hechos salían ~55 %).
- **TSS previsto** (`src/lib/tssPrevisto.js`): hrTSS por paso con la intensidad
  del objetivo (punto medio de la zona de `zonaFc`; sin objetivo Z1 en
  bici/carrera; natación/fuerza sin FC por `TSS_POR_HORA_SIN_FC`, copia con test
  de igualdad). **Calibrado por atleta y disciplina** (`lib/proyeccion.js`
  `calibrar`): mediana real/previsto de sus sesiones hechas con hrTSS real (≥3).
  Sin calibrar se quedaba corto 1,5–2,5×; calibrado, error mediano 9 % (Lucas,
  leave-one-out, 2026-10).
- **Proyección** de CTL/ATL en `FormaChart` (discontinua) con las sesiones
  pendientes, SOLO hasta la última planificada: más allá la CTL caería sola y
  sería engañoso. Si la próxima prueba A confirmada/inscrito cae dentro: "Llega
  a X con CTL · TSB" (forma de la víspera). Cabecera de cada semana en Sesiones:
  "TSS 210 de ~320". Datos en `lib/planCarga.js` (caché 5 min; se invalida con
  `invalidarDatosAtleta` y al editar la temporada). Tests: `test/feedback`,
  `cumplimiento`, `tss-previsto`, `proyeccion`.

### Nutrición por sesión (2026-10-28, migración 017, aplicada 2026-10-29)
- Tabla `sesion_nutricion` (PK `session_id`): carbohidratos g/h, líquido ml/h,
  sodio mg/h y notas ("gel en el min 40"). **La editan los dos**: el atleta de
  la sesión y su coach vinculado (RLS; `athlete_id` debe ser el de la sesión;
  `actualizado_por` = quien guarda → "Editado por …").
- Sugerencia automática por REGLAS (sin IA) en `src/lib/nutricion.js`
  (`sugerirNutricion`): duración prevista (`segundosPrevistos` en
  tssPrevisto.js, también pasos por distancia) + intensidad (IF desde el TSS
  previsto, alta ≥ 0,75). <60 min nada; 75–150 min 45/60 g/h; >150 min 70/90
  g/h (carrera tope 60); sodio desde 90 min; piscina sin hidratos; fuerza agua.
- UI `NutricionSesion.jsx` (plegable) en la tarjeta de SessionsList (coach) y en
  "Próximos" de /home (atleta). Si la tabla no existe, la sección no se pinta.
- **Lo tomado** (misma fila): `tomado_carbohidratos_g_h`, `tomado_liquido_ml_h`,
  `estomago` (1 mal · 2 regular · 3 bien), `tomado_notas`. Lo apunta el atleta
  desde el día de la sesión (Próximos si es hoy; Hechos y pendientes después);
  en pasadas el atleta ve el plan pero no lo edita. Jon lo ve con el plan al
  lado ("35 de 60 g/h") y aviso rojo si le sentó mal o comió < 70 % de lo
  previsto (`avisoTomado`).
- Guardados PARCIALES: `guardarNutricion` hace upsert solo de las columnas que
  manda (plan o tomado), así uno no pisa al otro. `quitarParte` pone a null una
  parte o borra la fila si no queda nada (la BD no admite filas vacías).
- **Creador de sesiones**: sección "Nutrición" plegable en `WorkoutBuilder`
  (`CamposPlanNutricion`, sugerencia en vivo con los bloques del formulario).
  Se guarda DESPUÉS de la sesión (necesita su id); si falla, la sesión queda
  guardada y se avisa. Duplicar copia también el plan (`_nutricionDe`). La
  sección solo aparece si la tabla existe (`nutricionDisponible`).
- RLS verificada en un Postgres local (2026-10-28): coach y atleta escriben;
  extraño ni ve ni escribe; no se puede colgar una fila de la sesión de otro ni
  falsificar `actualizado_por`; anon sin acceso.
- **NO va al reloj** a propósito: la descripción del evento es el texto del
  workout y un texto libre ahí puede romper el parseo / congelar el reloj
  (misma regla que las notas del entrenador).
- Tests: `test/nutricion.test.js`.

## Estructura

- `src/components/` — Login, Dashboard (panel del coach), AthleteView (atleta,
  vista coach), SessionsList, SemanaCalendario + HojaMover (agenda),
  WorkoutBuilder/WorkoutDetail (+ `workout/`: bloques, chips, parser, atajos),
  AdjuntoEntreno, FeedbackSesion, Cumplimiento, AgendaAtleta,
  DisponibilidadEditor, ActivityDetail, PolylineMap, PRsBlock, WeekCompare;
  `charts/` (ChartCard, FormaChart, PowerChart, TSSChart), `shared/`
  (StravaAnalysis, TransitionLine), `season/`, `ui/` (primitivas).
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
  season, my-connections, strava-auth, verify-intervals-key, accept-invitation;
  `lib/` (auth, http, supabase-rest, rate-limit, oauth-state, metrics, semanas,
  strava, strava-lista, actividades-store, tecnica, ttl-cache, server-timing,
  intervals-api, intervals-evento, intervals-text.cjs, mover-reglas.cjs,
  season-validate).
- `supabase/migrations/` — 001–017 (+ ficheros `PENDIENTE_*` que NO se aplican
  solos). 017 aplicada 2026-10-29 (desde el SQL Editor; verificadas sus 4 policies).
- `audit/` — `recompute.mjs` (recálculo independiente de métricas). `real-data.mjs`
  está gitignoreado (actividades reales con FC).
- `test/` — `npm test` (node --test, sin dependencias).

## Temporada (calendario de pruebas del año) — 2026-10

- Tablas `temporada_eventos` y `temporada_cambios` (migración 006, **aplicada**).
  RLS activado y SIN policies: solo la función `season` (service key) las toca.
- `netlify/functions/season.js` — acciones `list` / `upsert` / `delete` (propio
  atleta o su coach, vía `canAccessAthlete`) y `overview` (solo coaches, todos sus
  atletas). Validación pura en `lib/season-validate.js` (whitelist de campos:
  `athlete_id`/`created_by` NUNCA salen del body). Cada cambio se registra en
  `temporada_cambios` con un resumen legible (best-effort).
- Atleta y coach editan los dos. Estados: candidata, confirmada, inscrito,
  descartada, hecha. Prioridad A/B/C. `escenario` = etiqueta libre para comparar
  planes alternativos (p. ej. "Media" vs "Olímpico"). Multideporte: run, tri,
  bike, swim, other.
- UI: `src/components/season/` — `SeasonPanel` (pestaña "Temporada" en `/home` y
  en `/athlete/:id`, admite `?tab=temporada`), `EventEditor` (drawer),
  `SeasonOverview` (bloque "Temporadas" en el panel del coach). Helpers puros en
  `src/lib/season.js`; cliente en `src/lib/seasonApi.js`.
- Tests: `npm test` (node --test, sin dependencias) — `test/season.test.js`.
- Pendiente: avisos de inscripción por email (Resend).
- Este panel es un proyecto INDEPENDIENTE de TriCoach (la app de coaching con IA):
  comparten la instancia de Supabase, pero no hay que enlazar nada entre ambos.

## Disponibilidad y planificación semanal (2026-10)

- **Atleta** (pestaña "Horario" en `/home` —antes "Disponibilidad", no cabía en
  móvil—, `DisponibilidadEditor`): marca
  TRAMOS HORARIOS por día de la semana y disciplina en bloques de 30 min ("nado
  7:00–8:00, bici 18:00–20:00") y excepciones por fecha que sustituyen ese día:
  `no_disponible` o `limitada` (sus tramos). Solo el atleta escribe; su coach lee.
- Tablas `atleta_disponibilidad_semana` / `atleta_disponibilidad_fecha`
  (migración 011, aplicada 2026-10-18; RLS: lee atleta o coach vinculado vía
  `coach_athletes`, escribe solo `athlete_id = auth.uid()`). Cliente en
  `src/lib/disponibilidadApi.js`, hook `useDisponibilidad` (si falla → vacío).
- Lógica PURA en `src/lib/disponibilidad.js` (`disponibilidadDelDia`,
  `evaluarDisponibilidad`, `resumenSemana`, `textoAviso`; tests en
  `test/disponibilidad.test.js`). Sin datos del atleta → nunca hay avisos.
- **Coach**: `SemanaCalendario` encima de cada semana en Sesiones y aviso en
  `WorkoutBuilder`. Es un CALENDARIO, no una lista: los días son columnas y las
  HORAS van en el eje vertical, que es donde hay sitio para que una ventana de
  2h30 se vea. Decisiones que NO hay que deshacer sin motivo:
  - **Carriles fijos** natación · bici · carrera · fuerza: cada deporte cae
    siempre en la misma vertical aunque ese día falte, para poder escanear la
    semana en diagonal. Repartirlos según lo que haya ese día hace bailar los
    colores y lo rompe.
  - **La ventana horaria se calcula de los tramos reales del atleta**
    (`ventana()`, redondeo a la hora ± 30 min, mínimo 7 h) para que no haya
    espacio muerto; por defecto 6:00–22:00 si no hay datos.
  - En la cabecera, minutos ya prescritos PEGADOS al número del día (si se van
    al otro extremo parecen del día siguiente), en ámbar si alguna sesión no
    encaja. El detalle de cada sesión NO se repite aquí: está en la lista de
    abajo, que es la que tiene las acciones.
  - Intento previo descartado (2026-10): las mismas franjas como barras
    horizontales dentro de la celda del día. A 160 px de ancho el tiempo no se
    puede leer — si el eje de tiempo va en horizontal en 7 columnas, se pierde.
- **Agenda con horas (2026-10-22, migración 013)**: `coach_sessions` tiene
  `hora_inicio_min` (opcional, min desde 0:00, múltiplo de 5), `movida_por`
  ('atleta'|'coach') y `movida_at`. `SemanaCalendario` coloca cada sesión A SU
  HORA dentro de las franjas (fondo claro = horas libres + carriles fijos de
  3 px); sin hora → fila "sin hora". Solapes en cascada (no a partes iguales:
  en 150 px no se lee). Aviso ámbar si no encaja (`evaluarDisponibilidad` acepta
  la hora: motivo `fuera_de_horas`). Lógica pura en `src/lib/agenda.js`
  (`ventanaAgenda`, `colocarDia`, `horasPosibles`); tests `test/agenda.test.js`.
  - **Mover**: escritorio arrastrando (ajuste a 30 min, se iluminan las franjas
    de esa disciplina, totales en vivo; la tarjeta original NO se desmonta
    durante el arrastre o el navegador corta el drag — la vista previa es otro
    elemento). Móvil: un día cada vez + `HojaMover` al tocar una sesión.
  - **Reglas** (`netlify/functions/lib/mover-reglas.cjs`, fuente única
    cliente/servidor): lo pasado se pierde (ni desde ni hacia un día pasado);
    hoy solo a una hora que no ha llegado. Mover es libre (sin aprobación).
  - **`move-session`** (Netlify): atleta o coach con relación; solo toca fecha,
    hora y `movida_*` (el atleta sigue SIN permiso de escritura en
    `coach_sessions` por RLS). Si la sesión está en el reloj: crea el evento con
    la fecha nueva → confirma en BD → borra el viejo (mismo orden que
    send-to-intervals). Tests `test/mover-sesion.test.js`.
  - El evento de Intervals lleva la hora (`lib/intervals-evento.js`,
    `start_date_local`), compartido con send-to-intervals.
  - Atleta: "Mi semana" (`AgendaAtleta`) en la pestaña Entrenos de `/home`.
  - Builder: hora opcional (chips con las horas que encajan); la columna solo se
    envía si hay hora. Si el coach recoloca una sesión movida por el atleta, se
    quita la marca.
  - Builder abierto desde una hora: solo las disciplinas que el atleta tiene a
    esa hora (`disciplinasALaHora`); si hay una, se elige sola; "Otra
    disciplina" enseña el resto. Pulsar en la agenda coge la media hora pulsada
    (hacia abajo). `useDisponibilidad` cachea 5 min por atleta y revalida al
    montar (`useDisponibilidadConEstado` da `cargada`): sin eso el creador
    pintaba todas las disciplinas y luego quitaba unas.
  - Listas (coach y atleta) ordenadas por fecha y hora.
  - Ojo dev: Vite en modo dev no expone los named de un `.cjs` fuera de
    node_modules (el build sí). Para ver la agenda en local, build + preview.
- **No se ofrecen combinaciones imposibles** (2026-10): en el calendario, un día
  sin NINGUNA disciplina posible (`no_disponible` o con datos pero sin tramos) no
  es botón; en `WorkoutBuilder`, los chips de fecha y los botones de disciplina que
  no encajan con la otra selección salen apagados y `disabled` (helper `noEncaja`,
  sin duración: solo día + disciplina). La opción YA seleccionada nunca se
  bloquea (sesiones antiguas, cambios de disponibilidad) y "Otra fecha" permite
  forzar cualquier día; el aviso ámbar de `textoAviso` sigue ahí para esos casos
  y para `excede_minutos`, que NO bloquea. Sin datos del atleta no se bloquea nada.
- **Planificar**: Sesiones muestra siempre la semana actual y las 2 siguientes
  aunque estén vacías (`src/lib/planificacion.js`, `semanasFuturas`), sin huecos
  hasta la última con sesiones; "Planificar otra semana" añade más. Los días de
  hoy en adelante del calendario son botones → `WorkoutBuilder` con la fecha
  puesta. La actual y la siguiente se ven enteras; las posteriores salen
  PLEGADAS en una línea ("Semana del 9 Nov · 7 sesiones · ~6:30 · TSS ~320") y
  se abren al pulsar (2026-10-29: la lista medía ~8 pantallas en móvil).
- **Orden y limpieza (2026-10-29)**: `/athlete/:id` abre en **Sesiones**
  (pestañas Sesiones · Análisis · Temporada). En la tarjeta de sesión del coach,
  las PASADAS no muestran estado del reloj ni "Enviar al reloj"; Nutrición va en
  la fila de acciones (g/h del plan o aviso rojo) y abre el panel debajo
  (`NutricionSesion soloPanel`); en pasadas solo si hay datos. En `/home` del
  atleta: "Hoy" (o "Tu próximo entreno") arriba, luego Mi semana, Próximos y
  Hechos. "Sin enviar / Aún no está en tu reloj" en el ámbar de aviso `#E8B84A`,
  nunca en el de bici.
- Pendiente (decidido no hacer aún): copiar semana entera, avisar al coach
  cuando el atleta cambia su disponibilidad.

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

### Sistema de UI (2026-10)
- Marca única **GetRiCoach** (`Brand` en `src/components/ui/Layout.jsx`: tres trazos
  natación/bici/carrera + nombre). No usar "TriCoach" en este panel.
- **Sello visual: el filo de color por disciplina** a la izquierda de cada sesión,
  actividad o prueba (`railStyle(disciplina)` en theme.js, `SportRail` en season).
  Nada de pastillas rellenas de deporte: texto + filo o punto.
- Primitivas en `src/components/ui/`: `Icon` (SVG de trazo, NUNCA emojis en la UI),
  `PageHeader`, `Tabs` (fijas arriba, etiquetas cortas de una línea), `SectionTitle`,
  `Segmented`, `DisciplineTag`, `Metric`. Estilos en theme.js: `ghostButtonStyle`,
  `iconButtonStyle`, `sectionTitleStyle`, `RADIUS`.
- Títulos en frase normal (sin MAYÚSCULAS espaciadas). Chips de filtro neutros
  (seleccionado = blanco translúcido); el acento teal se reserva para la acción
  principal y los estados positivos.
- `WorkoutDetail` dibuja el **perfil de intensidad** del entreno (barras por paso,
  ancho = duración, alto/color = zona), como lo muestra el reloj.
- Listas largas paginadas ("Ver más"): actividades del análisis (12) e historial del
  atleta (10). Móvil primero: gutter 16 px, sin scroll horizontal.
- Harness de diseño (gitignoreado): `preview.html` + `vite.preview.config.mjs` +
  `src/preview/` con Supabase y functions simulados →
  `npx vite build --config vite.preview.config.mjs && npx vite preview --config vite.preview.config.mjs`,
  luego `/preview.html?as=coach|athlete|none&route=/dashboard`.
- **Repaso visual en el repo** (2026-10-29): `npm run repaso` (scripts/repaso-visual,
  ver su README) — 12 pantallas × móvil/escritorio con datos simulados; capturas
  e `informe.json` (errores de consola, scroll horizontal) en `repaso-visual-out/`.
  Pasarlo antes de mergear un lote grande.

### Gráficos (2026-10)
- **Nunca colores de disciplina para algo que no es una disciplina**: teal/ámbar/
  coral significan natación/bici/carrera. Carga y forma usan el violeta Load;
  series de contexto (ATL, medias móviles) en gris Mist.
- **Una escala por gráfico**: el TSS semanal (suma) y la CTL/ATL (media diaria)
  van en gráficos separados — `TSSChart` (barras, semana en curso tenue) y
  `FormaChart` (CTL/ATL diarios del rango del selector, calentados con la serie
  de 26 semanas; valores de hoy en la leyenda, TSB en el tooltip).
- Leyenda en cuanto hay ≥2 series; números de los ejes en JetBrains Mono;
  marcas del eje Y redondas y equiespaciadas.
- **TSS del panel del coach**: violeta de carga + "Por encima / En su línea / Por
  debajo" frente a la media de SUS 4 semanas completas anteriores (±20 %,
  `lib/cargaRelativa.js`). Nada de semáforo con cortes fijos ni colores de
  disciplina (decidido 2026-10-29).

### Línea de Transición
Barras apiladas por semana segmentadas por disciplina, con estados por relleno+borde
(completado/programado/descanso). `src/components/shared/TransitionLine.jsx`.
