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
- DB/Auth: Supabase (cliente solo en el frontend con la anon key). Desde
  2026-11-26 NO se usa `@supabase/supabase-js`: `src/lib/supabase.js` monta el
  cliente con `@supabase/auth-js` + `@supabase/postgrest-js` (misma config y
  misma clave de sesión `sb-<ref>-auth-token`) y `storageDe()` carga
  `@supabase/storage-js` bajo demanda (solo capturas de fuerza). API:
  `supabase.auth`, `supabase.from`, `supabase.rpc`. Los tres paquetes van
  fijados a la MISMA versión; súbelos juntos. Entrada 137,7 → 108,5 KB gzip.
  Todas las pantallas son `lazy` (también JoinPage e IntervalsSetup).
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
- Hecho 2026-11-26: verificación del JWT en local, cachés de auth y webhook de
  Strava (activo en producción, ver arriba).
- Pendiente: mover las functions a **`fra`** (Netlify → Cloud compute →
  Functions → Region; requiere plan Pro). Es la mejora grande: cada ida
  bajaría a ~10–30 ms. Strava (EE. UU.) iría algo más lento, pero casi nunca
  está en el camino crítico. Keep-alive en `https` NO ayuda aquí (el coste es
  Cloudflare Ohio → origen Frankfurt, no el TLS Lambda → Cloudflare).

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

## Métricas — fuente ÚNICA de verdad

- **`netlify/functions/lib/metrics.js`** (backend): `mapDisciplina`, `intensidadPct`
  (SIN redondear), `zonaFc` (recibe la intensidad sin redondear — 79.96 % es Z3, no
  Z4), `tssEstimado` (hrTSS), `cargaActividad`, `fechaMadrid`, `round`.
- **TSS**: `cargaActividad(movingTimeSec, fcMedia, fcMax, disciplina, potencia, fcUmbral)`:
  - bici con medidor real + FTP → TSS por potencia = horas × (NP/FTP)² × 100.
  - con FC → hrTSS = horas × (FC media / **FC umbral**)² × 100. FC umbral =
    `atleta_potencia.fc_umbral` o, si no hay, **90 % de la FC máx** (`fcUmbralDe`,
    `FC_UMBRAL_PCT`). Desde 2026-11-20 (antes contra la FC máx: una hora a umbral
    daba ~81 y la bici "subía" ~23 % al activar el potenciómetro). Cambió la
    escala de TODO el TSS por pulso (≈ ×1,23) de golpe y para todos los atletas;
    CTL/ATL y "relativo a lo habitual" se recalculan solos (nada se guarda).
    `tssPrevisto` usa la misma base (IF = % FC máx / 90; potencia = % FTP / 100).
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
- **Bici y carrera por PULSO** (por defecto): la zona se envía como `Zn HR` (también en bici) y
  el objetivo por defecto es `Z1 HR`. Bici por POTENCIA solo si el atleta tiene
  el interruptor de potenciómetro (ver «Potenciómetro por atleta»).
  **Natación sin objetivo por defecto** (el coach sí puede elegir ritmo /100m, zona de ritmo —`Zn Pace`, requiere ritmo umbral de natación en Intervals— o FC %) (antes `Z1 Pace` → avisos falsos).
- Ritmo exacto o rango (`4:50-5:10/km Pace`), validado en el builder.
- **Pasos de serie sin nombre (carrera/bici)** (2026-11-19): el reloj solo enseñaba
  `1m Z5 HR` / `1m Z1 HR`. Se etiquetan por zona (`etiquetaPorZona`): Z1-2 Suave,
  Z3 Medio, Z4 Fuerte, Z5 Muy fuerte. Solo dentro de series, solo con objetivo por
  zona y nunca si el coach puso nombre; natación y pasos sueltos no se tocan.
  `conPrefijo` no repite el prefijo si el nombre ya empieza por «calent…» /
  «vuelta a la calma» (antes: «Calentamiento · Calentar»).
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
  Dice qué viene (≤60 caracteres, Garmin corta). **Siempre hay pausa tras un
  bloque, también si acaba en descanso** (2026-11-13: pasados los 20" hay que
  poder beber o cambiar de material antes de arrancar); va DESPUÉS del descanso.
  Un descanso suelto entre bloques no lleva pausa propia. El cambio de material
  se compara entre pasos que se nadan (los descansos no cuentan: con aletas
  puestas el descanso no las quita). Dentro de una serie solo si cambia el
  material (la pausa va justo tras el paso con material, antes de su descanso). Se
  calcula al generar (no se guarda); `WorkoutDetail` la pinta como "Pulsa
  vuelta · …". Intervals no tiene campo de equipo ni de técnica (drill) en
  natación (petición abierta 2026-08): el material solo llega como texto.
- **Natación: técnica / pies** (`esTecnica`: material `tabla` o nombre pies,
  patada, técnica, drill, kick, piernas, tabla; 2026-11-20 se añadieron piernas/tabla/patadas: «Piernas aletas con tabla» con el material solo en el nombre no sumaba): el reloj no cuenta largos sin brazada, así que
  el paso va con `press lap` ("pulsa vuelta al acabar") y no se queda esperando
  largos. **Marca explícita** (2026-11-26): el paso lleva `tecnica: true|false`
  (interruptor «No cuenta largos (técnica)» en el creador, `TecnicaToggle`); manda
  sobre la detección por nombre/material, en los dos sentidos (sin marca =
  automático). Aletas solas NO es técnica (el reloj cuenta largos con brazada);
  sí lo es lo que no tiene brazada normal (tabla, pies/piernas, un brazo). Si un
  bloque acaba en un paso de técnica (ya termina con vuelta) y el material no
  cambia, NO se añade la pausa «Siguiente» (eran 2 pulsaciones seguidas). El
  panel SUMA esos metros a la natación del día: `lib/tecnica.js`
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

### Creador simplificado (2026-10-29)
- Lo esencial a la vista: disciplina, día (+ hora), nombre y el entreno. Nada
  se ha quitado; lo demás se pliega:
  - **Bloques plegados** con su resumen (`workout/resumen.js`: `resumenBloque`
    «6 × (3′ Z4 / 2′ Z1)»); se abre solo el que se toca (`abiertos` en el
    builder; el añadido a mano sale abierto, generar/plantilla los pliega).
  - **Nombre opcional**: vacío → `nombrePorDefecto` («Carrera · 6×3′ Z4»),
    que también es el placeholder. Para guardar solo hace falta el día.
  - Escritura rápida con la chuleta plegada («Cómo se escribe»); selector de
    plantillas solo si hay; «Guardar como plantilla» solo con bloques.
  - **«Así llega al reloj»** = perfil de intensidad (`Perfil` de
    WorkoutDetail) + texto exacto a un clic.
  - **Notas y nutrición a la vista** (2026-11-24; antes «Más opciones» plegado).
  - **Pie fijo** con avisos y botones («Guardar sin enviar» · «Guardar y
    enviar al reloj»).

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
- **Sin sugerencias automáticas** (decidido 2026-11-19, se quitó `sugerirNutricion`
  y el botón "Usar sugerencia"): los campos salen en blanco y los rellena Jon. El
  atleta no ve la línea de Nutrición en sesiones futuras hasta que hay plan.
- **Despensa por atleta** (2026-11-19, migración 018): tabla
  `atleta_productos_nutricion` (nombre, tipo gel/sólido/bidón, hidratos g,
  cafeína mg, sodio mg, volumen ml; **desde 2026-11-24 (migración 023) solo la
  escribe el atleta** — el coach la LEE y elige de ella; semilla con los de
  Lucas). Bidones de natación/rodillo renombrados «Isotónico pequeño» /
  «Isotónico grande» (migración 024). Los bidones SIN receta (Bidón 500 y 800; el 750 se quitó, 027) son los «a medida»: Jon
  escribe los hidratos y el sodio POR BIDÓN en cada sesión (así sube los g/bote).
  Se probó renombrarlos «Agua N ml» (025) y se revirtió (026), que además quitó los
  tres hipertónicos de la semilla (menos opciones). El plan de la sesión es `sesion_nutricion.productos`
  (jsonb, items COPIADOS del producto con valores por unidad + cantidad: editar la
  despensa no cambia planes hechos). Los g/h, ml/h y sodio/h se CALCULAN al pintar
  con la duración prevista (`planEfectivo` en `lib/productosNutricion.js`); las
  columnas `*_g_h` solo quedan para planes antiguos y se anulan al guardar con
  productos. Bidones: hidratos y sodio de la mezcla se escriben POR BIDÓN en la
  sesión (maltodextrina + fructosa + sales). Lo tomado sigue siendo en g/h.
  **Minuto de cada unidad** (2026-11-19, sin migración: va dentro del jsonb):
  cada item lleva `minutos: [30, 60]` (uno por unidad, `null` = sin hora, máx.
  720; se recorta a `cantidad`). Jon los escribe bajo cada producto ("Tomar en el
  minuto"; en bidones "Empezar en el minuto"); «Repartir» propone un reparto
  parejo (`repartirMinutos`: geles entre inicio y final, bidones desde el 0) que
  él cambia — nunca se aplica solo. `LineaTiempo` (PlanProductos.jsx) ordena
  todo por minuto ("Min 40 · Gel 45 g · 0:40" a partir de 60), apunta aparte lo
  "sin hora" y marca en ámbar lo que cae después del final. Se ve en el editor
  (Jon y atleta) y en la vista de solo lectura. NO va al reloj (misma regla).
  UI en `PlanProductos.jsx` (+/− por producto, totales, gestor de productos);
  datos en `productosApi.js` (caché 5 min) y `hooks/useProductosNutricion.js`.
  **Bidones con receta propia** (2026-11-20, migración 020 `receta` jsonb en
  `atleta_productos_nutricion`; aplicada en producción; `productosApi` selecciona
  la columna y sin ella la despensa no carga): un bidón puede llevar sus GRAMOS
  a pesar `{maltodextrina_g, fructosa_g, sales_g}` (un decimal). Es una OPCIÓN
  con nombre ("Bidón rodillo", "Bidón natación"…) que Jon elige con el +, sin
  escribir cifras; de la receta salen sus hidratos y su sodio
  (`aportesReceta`: 0,95·malto + fructosa; sales × 142,3 mg/g) y se da al atleta
  tal cual (gramos exactos, sin redondear). Sin receta, el bidón es "a medida"
  (hidratos y sodio por sesión, receta 2:1 calculada, como antes). El item copia
  la receta del producto. Semilla de Lucas: natación 500 ml (13,5 malto + 6,5
  fructosa, sin sales), rodillo 800 (32+16+2,5 g Evolytes), bici 800 (40+20+2,5)
  y bici larga 800 (50+25+2,5). Se ignora a propósito la "dosis diaria" de
  Evolytes (decisión de Lucas, 2026-11-19).
  **Tonicidad** (`tonicidadBidon`, se calcula, no se guarda): por g de hidratos
  /100 ml — isotónico hasta 8 %, hipertónico > 8 % (sin "hipotónico", decidido
  2026-11-20; aproximación
  solo por hidratos; con receta propia usa sus gramos exactos). Sale en el
  detalle del producto, en la línea de receta del plan y en la vista del atleta
  ("7,3 % · isotónico"). Natación 500 ml (3,9 %) sale isotónico. La semilla de
  Lucas añadió tres bidones HIPERTÓNICOS (80 / 90 / 100 g) que se QUITARON el
  2026-11-24 (026): para más hidratos, un bidón a medida.
  **Receta del bidón** (`recetaBidon`/`textoReceta`): de los hidratos y el sodio
  del bidón salen los GRAMOS a pesar: maltodextrina + fructosa en 2:1 (la que
  usa Lucas; constante `RATIO_MALTO_FRUCTOSA`), con maltodextrina HSN 95 g
  hidratos/100 g, fructosa HSN 100 g/100 g y sales Evolytes 355,7 mg de sodio
  por 2,5 g (valores de las etiquetas, 2026-11-19). En gramos y no en
  dosificadores (la etiqueta de la maltodextrina es ambigua). Se ve en el
  editor (Jon y atleta) y en la vista de solo lectura. Guayaba = 22 g (950 g /
  36 unidades × 85 %). Tests: `test/productos-nutricion.test.js`.
- UI `NutricionSesion.jsx` (plegable) en la tarjeta de SessionsList (coach) y en
  "Próximos" de /home (atleta). Si la tabla no existe, la sección no se pinta.
- **Lo tomado, unidad a unidad** (2026-11-20, migración 019 `tomado_items` jsonb;
  aplicada en producción; `cargarNutricion` selecciona la columna y
  sin ella la sección de nutrición desaparecería): si el plan lleva productos, el
  atleta ve la lista de unidades en orden (`unidadesOrdenadas`, claves
  "<producto>#<n>") y TOCA cada una al tomársela; un toque guarda al momento
  (cola de guardados, sin botón). Bidón = al terminarlo. El día de la sesión
  esa lista va ARRIBA y el plan debajo. Los g/h y ml/h tomados se calculan de
  lo marcado con la misma duración que el plan (`tomadoEfectivo` /
  `nutricionEfectiva` en `lib/nutricion.js`), así "45 de 88 g/h" y el aviso de
  < 70 % siguen funcionando; "3/5" en el resumen y Jon ve "Sin tomar: …".
  UI (rediseño 2026-11): fila plegada con gota y barra de avance; lista con
  «Siguiente» y `PistaTiempo` (PlanProductos): la sesión de 0′ al final con
  cada toma en su minuto (teal = tomada).
  Sin productos (planes antiguos) se siguen escribiendo g/h a mano. Claves que
  ya no existen en el plan se ignoran.
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
  (`CamposPlanNutricion`, campos en blanco).
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

## Potenciómetro por atleta (2026-11-20, migración 021)

- Tabla `atleta_potencia` (PK `athlete_id`): `potenciometro` bool, `ftp_w` (50–700),
  `ftp_fecha`. La editan atleta y coach vinculado (RLS, `actualizado_por`).
  **Migración 021 aplicada 2026-11-20** (aditiva; deshacer: `DROP TABLE public.atleta_potencia;`).
  Sin tabla: todo sigue por pulso. UI: `PotenciaAjustes.jsx` (Sesiones del coach y
  /home del atleta, plegable), `usePotencia`, `potenciaApi.js` (caché 5 min).
- Con interruptor ON: el creador ofrece en bici «Zona potencia» (`zona_potencia`,
  texto `Zn`) y «Potencia % FTP» (`potencia`, ` 95-105%`); la escritura rápida
  convierte Zn → potencia (`zonasAPotencia`); sin objetivo por defecto `Z1`.
  `bikePotencia` pasa por `construirEvento` (send-to-intervals y move-session).
  Sesiones antiguas por `zona`/FC no cambian.
- **FTP también en Intervals.icu**: al guardar un FTP nuevo, `PotenciaAjustes`
  llama a `sync-ftp` (Netlify), que lee el FTP de la BD y hace
  `PUT /api/v1/athlete/{id}/sport-settings/Ride {ftp}` con la key del atleta
  (2026-11-20). Si falla o no hay Intervals, se avisa en la tarjeta (el FTP sí
  queda guardado en la app). Tests: `test/sync-ftp.test.js`.
- **FC umbral** (migración 022, `atleta_potencia.fc_umbral`, 100–220, opcional):
  base del hrTSS. Se edita en la misma tarjeta.
- **Por potencia = interruptor Y FTP** (`bikePotencia` de `lib/potencia`; igual en el creador): con el interruptor pero sin FTP la bici sigue por pulso (sin FTP el reloj no puede pasar las zonas a vatios).
- **Sin potenciómetro** (apagado después de prescribir): los objetivos de
  potencia de bici ya prescritos van al reloj por PULSO con la misma zona
  (`zona_potencia` Zn → `Zn HR`; `% FTP` → su zona de Coggan → `Zn HR`).
- Lectura ÚNICA de estos ajustes en el backend: `lib/potencia.js`
  (`leerAjustes`/`leerPotencia` → `{ potenciometro, ftp, fcUmbral }`), usada por
  send-to-intervals, move-session y las tres de métricas.
- **UI**: `PotenciaAjustes.jsx` («Bici y pulso»): en /home del atleta, tarjeta
  abierta en «Ajustes y conexiones» y con el botón de ajustes (deslizadores) de
  la cabecera, que la pone arriba; en Sesiones del coach, plegable. Interruptor,
  FTP (fecha del test; aviso si > 8 semanas — la fecha solo cambia si cambia el
  FTP) y FC umbral. El creador avisa si hay potenciómetro sin FTP.
- Detalle de actividad: con TSS por potencia enseña también el TSS por pulso
  (para comprobar que cuadran) y la eficiencia aeróbica NP/FC (W/ppm).
- TSS de bici: si la actividad tiene `device_watts` real, NP y el atleta tiene
  interruptor + FTP → TSS = horas × (NP/FTP)² × 100 (`tssPotencia`, `fuente:'potencia'`,
  `tss_por_potencia`); si no, hrTSS. TSS previsto: zonas Coggan (Z1 45…Z5 113 %).
- Assioma Uno = medidor de un pedal (×2): sin balance L/R; hay que calibrar (offset).
- **Pendiente (potenciómetro, desde 2026-11-20)**:
  - Hablar con Jon: test de FTP. Hasta que haya FTP en `atleta_potencia`, el TSS de bici sigue por pulso.
  - Con el FTP: ponerlo en la app («Bici y pulso»); se sube solo a Intervals (comprobar el aviso verde la primera vez).
  - Activar el interruptor del atleta; reenviar con «Guardar y actualizar reloj» las sesiones de bici ya enviadas.
  - Opcional: poner la FC umbral real (test de 30 min o la de Intervals/Garmin); sin ella se usa el 90 % de la FC máx.
  - Calibrar (offset a cero) y emparejar el Assioma Uno con el Garmin; es de un solo pedal (×2, sin balance L/R).
  - Revisar tras las primeras salidas: que `device_watts`/NP lleguen de Strava y que el TSS por potencia y el de pulso (detalle de la actividad) estén cerca; si no, FTP o FC umbral mal puestos.
  - Ideas sin hacer: bienestar de Intervals (sueño/FC reposo/HRV), alerta de molestias al coach.

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
- **Descanso (2026-11-24)**: dos sitios. (1) Bloque «+ Descanso» en el creador:
  paso `Descanso` de 30 s (1 min si la disciplina no admite segundos), que ya se
  reconoce como descanso (en natación, nativo del reloj). (2) Disciplina
  `rest` («Descanso», `src/lib/descanso.js`): día sin entreno, solo marca el día
  y admite notas. Sin hora, bloques, nutrición, feedback ni envío al reloj;
  `estadoDeSesion` devuelve `ESTADO.descanso` (nunca «Sin hacer»); color neutro
  `DISCIPLINE_COLORS.rest`. No hay CHECK de disciplina en `coach_sessions`, así
  que sin migración. No se puede convertir en descanso una sesión que ya está en
  el reloj (chip deshabilitado). Tests: `test/descanso.test.js`.
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
- **/home más corto (2026-10-29)**: "Próximos" es una lista de una línea por
  entreno (como "Hechos y pendientes"); al pulsar se abre con notas, reloj,
  entreno y nutrición. El aviso de reloj (icono ámbar) solo si toca hoy o
  mañana. "¿Cómo te fue?" de hoy es un botón (teal) hasta que hay feedback.
  Títulos de sección (`sectionTitleStyle`) en frase normal, Ink (20 px desde el rediseño 2026-11).
- **Panel más corto en móvil (2026-11-19)**:
  - `SemanaCalendario` en móvil: la rejilla horaria va PLEGADA; el día sale como
    lista corta de sesiones y un botón «Ver horas y planificar» la abre (medía
    ~550 px y empujaba «Próximos»). Escritorio no cambia.
  - `SessionsList`: duplicar y eliminar van en un menú «⋯» (editar queda
    visible; borrar sin querer con el pulgar). Con 2+ sesiones con entreno sin
    enviar (hoy en adelante) sale un aviso «N sesiones sin enviar al reloj ·
    Enviar todas» (envía en serie a `send-to-intervals`); la tarjeta solo pone
    «Sin enviar». Estado de sesión pasada sin actividad: «Sin hacer» (igual que
    el atleta), ya no «Pendiente».
  - `PlanProductos`: (2026-11-24) la despensa entera a la vista con +/−, en dos
    grupos — «Geles y guayaba» y luego «Bidones» (`gruposProductos`, respeta el
    `orden` del atleta dentro de cada grupo). Sin botón «Añadir producto». «Editar
    despensa» (gestor) solo lo ve el ATLETA (`puedeEditarDespensa`); Jon solo elige.
- **Atleta: esfuerzo en un toque y copiar para Strava (2026-11-20)**:
  - «Hechos y pendientes»: las sesiones Hechas sin feedback muestran debajo una
    fila RPE 1–10 (`FeedbackRapido` en `FeedbackSesion.jsx`); un toque guarda ya
    el feedback solo con el esfuerzo (sensaciones, molestias y comentario se
    completan abriendo la fila, `FeedbackEditor`). Quitado el «Cuenta cómo fue».
  - `CopiarStrava.jsx` (botón dentro de `WorkoutDetail copiarStrava`, solo vistas
    del atleta): copia el entreno en texto para la descripción de Strava
    (`lib/textoStrava.js`: «Calentamiento: 15 min Z1», «8 × (1 min Z5 / 1 min
    Z1)», material entre paréntesis, texto libre de fuerza). NO es el texto de
    Intervals y NO incluye las notas del entrenador. Tests: `test/texto-strava.test.js`.
- Pendiente (decidido no hacer aún): copiar semana entera, avisar al coach
  cuando el atleta cambia su disponibilidad.

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

## Design system (rediseño 2026-11, dirección A «Pulso»)

Evolución de la dirección de 2026-07: mismo ADN (fondo oscuro, color por
disciplina) con más profundidad, titulares anchos y objetivos táctiles de
iPhone. Se eligió entre dos direcciones (A «Pulso» y B «Boya», lienzo de
diseño en Claude); de la B se trajeron la cuenta atrás de las pruebas y la
fecha en bloque. Constantes en `src/lib/theme.js` — no hardcodear.

| Token | Hex | Uso |
|---|---|---|
| Void (background) | `#0A0C11` | Fondo |
| Slate (card) | `#12151C` | Superficies |
| raised | `#1A1E27` | Botón secundario, controles, menús |
| sunken | `#0E1117` | Inputs y bloques dentro de una tarjeta |
| highlight | `rgba(255,255,255,0.06)` | Luz del borde superior (`inset 0 1px 0`) |
| Border | `#1B202C` | Separadores |
| Ink / textSoft / Mist / terciario | `#EDEEF2` / `#C9CCD6` / `#8A90A0` / `#7A808F` | Texto |
| Swim · Neritic Teal | `#2FBFAF` | Natación · acción principal (texto encima `onAccent` `#06231F`) |
| Bike · Asphalt Amber | `#E8934A` | Ciclismo |
| Run · Exertion Coral | `#E85D5D` | Running · `error` |
| Load · Dusk Violet | `#8B7FD1` (`loadText` `#A79DE6` para números) | TSS/carga (`strength` también) |
| Aviso (warning) | `#E8B84A` (texto sobre su tinte `#F1D79A`) | Avisos; NO es el ámbar de bici |

**Tipografía** (alojada en la app con `@fontsource`, sin Google Fonts):
**Archivo variable** con eje de anchura para todo, incluidos los números
(cifras tabulares globales en `index.css`). `FONTS.mono` es hoy Archivo (se
mantuvo el nombre por sus ~120 usos); **JetBrains Mono** (`FONTS.code`) solo
para lo que se escribe tal cual: escritura rápida y texto exacto del reloj.
Titulares con `displayStyle` (800, `fontStretch: 118%`). Números protagonistas
de dorsal (cuenta atrás, fecha en bloque): 900 con `fontStretch: 70%`.

### Sistema de UI (2026-11)
- Superficies sin borde gris: `cardStyle` lleva luz arriba y radio 20. Botón
  principal = píldora teal rellena (una por pantalla); secundario = píldora
  `raised`; botones de icono = círculo de 44 px. Nada táctil por debajo de 44 px.
- **Mínimos (2026-11-26)**: ningún texto de la app baja de 12 px (la agenda ya no usa 9,5–11,5; su columna de horas pasó de 32 a 36 px para que «sin hora» quepa) y las pestañas de escritorio y el interruptor del potenciómetro tienen 44 px de zona táctil (el interruptor dibuja 46×28 dentro de un botón de 52×44). Pendiente: los chips de la agenda (142×16 px) necesitan hoja de acción al tocar, cambio visual que pasa por Claude Design.
- Inputs a 16 px y regla global en `index.css`: en pantallas táctiles ningún
  campo baja de 16 px (Safari en iPhone hacía zoom). `:active`/hover también
  en `index.css` (los inline styles no pueden).
- **Pestañas** (`Tabs`): en el móvil barra flotante ABAJO; en tablet y
  escritorio grupo de píldoras fijo arriba. `pageStyle` deja sitio abajo.
- Marca **GetRiCoach** (`Brand`/`BrandMark` en `ui/Layout.jsx`): ola (natación),
  línea (bici) y zancadas discontinuas (carrera). Mismo símbolo en
  `public/favicon.svg` y `public/apple-touch-icon.png`. No usar "TriCoach".
- **Filo por disciplina** (`railStyle`): marca vertical DENTRO de la tarjeta
  (background-image); si un componente cambia el fondo al pasar el ratón,
  que use `backgroundColor`. Nada de pastillas rellenas de deporte.
- **/home**: la sesión de hoy es la protagonista (titular, duración, perfil de
  intensidad a lo ancho con `Perfil tinte`, plan en una línea, «¿Cómo te fue?»).
  Próximos y Hechos con `BloqueFecha` (número de dorsal sobre el tinte de la
  disciplina). Cabecera = fecha de hoy.
- **Panel de Jon**: cada atleta con su sesión de HOY (consulta directa a
  `coach_sessions` desde el navegador). Próximas pruebas con `CuentaAtras`
  (SeasonBits) también en Temporada.
- **Agenda** (`SemanaCalendario`): sesiones como bloques teñidos con su
  disciplina (discontinuo = estimada); días del móvil en píldora.
- Análisis: escala de forma (`EscalaForma`) bajo el TSB con los cortes de
  `estadoForma`.
- Revisar en iPhone e iPad: `REPASO_VISTAS=iphone,ipad npm run repaso`.
- Primitivas en `src/components/ui/`: `Icon` (SVG de trazo, NUNCA emojis en la UI),
  `PageHeader`, `Tabs` (abajo en el móvil, arriba en tablet; etiquetas cortas de una línea), `SectionTitle`,
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
  ver su README) — 19 pantallas × móvil/escritorio con datos simulados (incluye
  análisis a 24 semanas, detalle de actividad, atleta sin Strava, creador nuevo
  y con una carrera escrita, feedback de hoy); `expandir: true` despliega el
  cajón del creador entero en la captura; capturas e
  `informe.json` (errores de consola, scroll horizontal) en `repaso-visual-out/`.
  `OK` = sin errores NI scroll. Pasarlo antes de mergear un lote grande.
  Playwright: usar el global (`NODE_PATH=$(npm root -g) npm run repaso`); un
  `npm i playwright` local trae otra versión que no encuentra el navegador.

### Gráficos (2026-10)
- **Nunca colores de disciplina para algo que no es una disciplina**: teal/ámbar/
  coral significan natación/bici/carrera. Carga y forma usan el violeta Load;
  series de contexto (ATL, medias móviles) en gris Mist.
- **Una escala por gráfico**: el TSS semanal (suma) y la CTL/ATL (media diaria)
  van en gráficos separados — `TSSChart` (barras, semana en curso tenue) y
  `FormaChart` (CTL/ATL diarios del rango del selector, calentados con la serie
  de 26 semanas; valores de hoy en la leyenda, TSB en el tooltip).
- Leyenda en cuanto hay ≥2 series; números de los ejes con cifras tabulares (Archivo);
  marcas del eje Y redondas y equiespaciadas.
- **TSS del panel del coach**: violeta de carga + "Por encima / En su línea / Por
  debajo" frente a la media de SUS 4 semanas completas anteriores (±20 %,
  `lib/cargaRelativa.js`). Nada de semáforo con cortes fijos ni colores de
  disciplina (decidido 2026-10-29).

### Pestaña Análisis (2026-10-29)
- **Orden**: 4 tarjetas (Volumen · TSS acumulado · CTL · ATL · TSB) → Forma +
  Carga semanal → Volumen por semana → zonas + ritmo de carrera → potencia →
  mejores marcas → actividades. Forma/carga arriba: es lo que más se mira.
- **Tarjetas**: las mismas 4 en móvil (2×2) y escritorio; etiquetas en frase
  normal. El TSB lleva su lectura (`estadoForma` en `lib/carga.js`: > +5
  Fresco · −10…+5 En equilibrio · −30…−10 Cargando · < −30 Fatiga alta, solo
  esta en `COLORS.warning`). Número en Ink, nunca verde/coral.
- **Zonas de pulso**: rampa del violeta de carga Z1→Z5, horas (`40h 9m`) y % del
  total. Ojo: cada actividad cuenta ENTERA en la zona de su FC media (no es
  tiempo en zona segundo a segundo); la nota bajo el título lo dice.
- **Ritmo medio de carrera**: altura con rango mínimo de 30 s/km
  (`RANGO_MIN_RITMO`), para que 5 s no parezcan una caída.
- **Volumen por semana** (`TransitionLine`): leyenda solo con las disciplinas
  presentes (fuerza incluida, "Carrera" no "Running"), también en móvil;
  `maxLabels` (5 móvil, 12 escritorio) pinta una etiqueta de cada N desde la
  semana en curso — con 24 semanas en móvil la página se salía a 637 px.
- **Actividades**: filo de disciplina también en la tabla de escritorio, deporte
  en texto (sin pastillas); filas abribles con teclado. **Detalle**
  (`ActivityDetail`): pantalla completa en móvil, métricas de 3 en 3, valores
  con cifras tabulares, splits de Ink (rápido) a gris (lento), columnas vacías de vueltas
  ocultas, Escape cierra. **Orden (2026-11-22)**: en bici van primero las
  Vueltas (el entreno hecho) y debajo los Splits por km; en carrera y natación
  siguen Splits → Vueltas.
- **Sin Strava**: `coach-athlete-data` responde 409 `code:'SIN_STRAVA'` con el
  nombre del atleta (nada más); la UI muestra `SinStrava` (neutro; en /home con
  "Conectar Strava") en vez de un error rojo. Cargando: `AnalisisCargando`.
- Fechas de ejes en orden día-mes (`formatFechaCorta` = `formatDiaMes`).
- Comparar semanas: diferencias con flecha y sin color (subir km no es "bueno").

### Línea de Transición
Barras apiladas por semana segmentadas por disciplina, con estados por relleno+borde
(completado/programado/descanso). `src/components/shared/TransitionLine.jsx`.
