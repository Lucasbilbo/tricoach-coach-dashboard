# Auditoría GetRiCoach (tricoach-coach-dashboard) — 2026-07-02

Alcance: código completo del repo, políticas RLS reales en Supabase (proyecto `luqpjgzpydquqturgjmt`), env vars reales del sitio Netlify `tricoach-coach-dashboard`, y advisors de Supabase. Sin cambios aplicados.

---

## 1. Seguridad

### 🔴 CRÍTICO

**S1. `athlete_invitations` legible por cualquiera (tokens + emails expuestos)**
- Dónde: policy `"Invitación pública por token"` — `SELECT USING (true)` (definida en `supabase/migrations/003_intervals_integration.sql:47`, activa en producción).
- Cualquiera con la anon key (pública por definición) puede hacer `GET /rest/v1/athlete_invitations?select=*` y obtener **todos** los tokens no usados y los emails de los invitados. Con un token robado, un desconocido puede registrarse como atleta del coach vía `accept-invitation`.
- Recomendación: eliminar la policy `USING (true)`. Verificar el token desde una Netlify Function (con service key) o una RPC `SECURITY DEFINER` que reciba el token y devuelva solo `{coach_nombre, email}`. Ojo: `JoinPage.jsx:69-74` depende hoy de esta policy — hay que migrar esa verificación a la vez.

**S2. El "secreto" de las funciones viaja en el bundle público**
- Dónde: `VITE_COACH_SECRET` (usado en 7 fetch del frontend) es **idéntico** a `COACH_FUNCTION_SECRET` (verificado en Netlify). Todo lo que empieza por `VITE_` acaba en el JS servido a cualquier visitante, incluidos los atletas.
- Consecuencia: el header `x-coach-secret` no autentica nada — cualquiera que abra DevTools lo obtiene. Las funciones `coach-dashboard-data`, `coach-athlete-data`, `coach-activity-detail` y `send-to-intervals` confían además en el `coachId`/`athleteId` que envía el cliente sin verificar el JWT del usuario. Con el secreto (público) + un coachId, un tercero lee datos Strava de todos los atletas.
- Recomendación: pasar el `Authorization: Bearer <access_token>` de Supabase en los fetch y validar el JWT en la función (endpoint `/auth/v1/user` o verificación de firma), derivando `coachId = user.id` del token en vez del body. El secreto compartido puede quedarse como capa extra anti-bot, pero no como autenticación.

### 🟠 IMPORTANTE

**S3. `send-to-intervals` devuelve stack trace al cliente**
- `netlify/functions/send-to-intervals.js:289` — `body: JSON.stringify({ error: err.message, stack: err.stack })`. Filtra rutas internas y estructura del código.
- Recomendación: devolver mensaje genérico; loguear el stack solo con `console.error`.

**S4. OAuth de Strava sin protección CSRF (`state` sin firmar)**
- `netlify/functions/strava-auth.js:107-125` — `state` es el `userId` en claro y `action=redirect&userId=X` no requiere sesión. Un atacante puede completar el flujo con SU cuenta de Strava y el `userId` de una víctima, inyectando sus tokens en el perfil de la víctima (contamina datos y rompe la ingesta).
- Recomendación: firmar el `state` (HMAC con secreto de servidor + timestamp) o generar un nonce guardado en DB y verificarlo en el callback.

**S5. `accept-invitation` sin rate limit y con check-then-act no atómico**
- `netlify/functions/accept-invitation.js:146-181` — la comprobación `used=eq.false` y el PATCH final no son atómicos (dos peticiones concurrentes con el mismo token pueden pasar). Sin rate limiting ni validación de formato de email. Además crea el usuario Auth y luego ignora los resultados de los POST a `profiles` y `coach_athletes` (líneas 168-174): si fallan, queda un usuario huérfano sin perfil ni coach, silenciosamente.
- Recomendación: PATCH condicionado (`token=eq.X&used=eq.false` + comprobar filas afectadas ANTES de crear el usuario), comprobar status de cada insert y devolver error si fallan, validar email.

**S6. `verify-intervals-key` es un proxy abierto sin autenticación ni rate limit**
- `netlify/functions/verify-intervals-key.js:38-70` — comentado como intencional (onboarding sin sesión), pero permite a cualquiera validar API keys de Intervals.icu robadas usando tu infraestructura.
- Recomendación: exigir sesión Supabase (el atleta ya está logueado cuando llega al wizard — `IntervalsSetup` es ruta con sesión en la práctica) o al menos rate limit por IP.

**S7. Migraciones SQL desincronizadas de las policies reales**
- `001_coach_tables.sql` define policies granulares (`coach_sessions_select_own`…) pero en producción existen otras (`"Coach gestiona sus sesiones"` ALL, `"Atleta ve sus propias sesiones"`, `"Invitación pública por token"` con nombres distintos a la migración). Se han hecho cambios a mano en el dashboard.
- Recomendación: volcar el estado real (`pg_policies`) a una migración de reconciliación para que el repo sea la fuente de verdad.

### Revisión sistemática RLS (tabla a tabla, estado real en producción)

| Tabla | Estado | Problema |
|---|---|---|
| `coaches` | SELECT propio | ✅ correcto para coach. ❌ ni atleta ni anon pueden leer el nombre del coach → rompe `JoinPage` (ver F5) |
| `coach_athletes` | ALL solo coach | ❌ **el atleta no puede leer su propia relación** → rompe AthleteHome (ver F1). Falta `SELECT USING (athlete_id = auth.uid())` |
| `coach_sessions` | ALL coach + SELECT atleta | ✅ el patrón que ya arreglasteis. Nota: el atleta no tiene UPDATE — hoy no lo necesita, pero si algún día marca sesiones como completadas desde el cliente, fallará en silencio |
| `athlete_invitations` | ALL coach + SELECT `true` | 🔴 ver S1 |
| `profiles` | ALL/SELECT/INSERT/UPDATE propio | ✅ aislamiento correcto. Nota: el propio atleta puede leerse `strava_token` e `intervals_api_key` (ver M8) |
| `forja_*`, `training_cycles`, `plans`, `messages` | owner-based | ✅ correctas (mismo proyecto Supabase compartido con Forja/TriCoach) |

**Claves de Intervals.icu en respuestas de funciones**: verificado — ninguna función devuelve `intervals_api_key` al cliente (`send-to-intervals` la usa server-side; `coach-athlete-data` devuelve solo `{id, nombre}` del perfil). ✅

**Advisors de Supabase (seguridad)**: `increment_messages_today` (de tricoach-v2, misma DB) es `SECURITY DEFINER` ejecutable por `anon` y con `search_path` mutable; protección de contraseñas filtradas (HaveIBeenPwned) desactivada en Auth. Ambos WARN, misma base de datos.

---

## 2. Corrección funcional / bugs silenciosos

### 🔴 CRÍTICO

**F1. El tab "Análisis Strava" del atleta está roto para todos los atletas**
- `src/pages/AthleteHome.jsx:181-190` — consulta `coach_athletes` con `athlete_id = uid`, pero la RLS solo permite leer al coach (ver tabla arriba) → siempre 0 filas → `coachId = uid` (fallback) → `coach-athlete-data` comprueba la relación `coach_id=uid & athlete_id=uid`, no existe → **403 "El atleta no pertenece a este coach"** para cualquier atleta real. Solo funciona para el coach viéndose a sí mismo.
- Recomendación: añadir policy `SELECT USING (athlete_id = auth.uid())` en `coach_athletes` (o resolver el coach server-side).

### 🟠 IMPORTANTE

**F2. Login con Google expulsa a los atletas**
- `src/components/Login.jsx:62` redirige SIEMPRE a `/dashboard`; `Dashboard.jsx:128-131` hace `signOut()` + `navigate('/')` si el usuario no está en `coaches`. Un atleta que use "Continuar con Google" entra y es deslogueado al instante, sin mensaje.
- Recomendación: redirigir a una ruta neutra que decida coach→`/dashboard` / atleta→`/home` (la misma lógica que ya existe en el login con contraseña, `Login.jsx:33-48`).

**F3. El preview de Intervals muestra las notas, pero el backend nunca las envía (divergencia frontend/backend)**
- Requisito verificado ✅: `send-to-intervals.js` NO envía notas a Garmin (la variable `notas` de la línea 120 está muerta — nunca se concatena).
- Pero `src/lib/intervalsText.js:72-74` (el preview del `WorkoutBuilder`) añade `'\n\n---\n' + notas` al final. El coach ve en el preview algo distinto de lo que llega al reloj. Son dos copias casi idénticas del mismo generador que ya han divergido.
- Recomendación: quitar las notas del preview (o marcarlas visualmente como "no se envía al reloj") y unificar el generador (ver C1).

**F4. Errores silenciados en flujos clave**
- `src/pages/IntervalsSetup.jsx:196-211` — `guardarEnPerfil` traga cualquier error ("no bloquear el wizard"): el wizard avanza al paso 4 diciendo "Conectado" aunque la key no se haya guardado → el coach luego recibe "atleta sin Intervals configurado" sin explicación.
- `src/pages/AthleteHome.jsx:206-226` — las dos queries de sesiones ignoran `error`; si RLS o red fallan, el atleta ve "No hay entrenamientos programados" (falso vacío).
- `send-to-intervals.js:273-277` — si el PATCH final falla, el evento SÍ se creó en Intervals pero la sesión queda `enviado_a_garmin=false` → reenvíos duplican el workout en el reloj.
- Recomendación: comprobar `error`/status en los tres puntos y distinguir "vacío" de "error".

**F5. El nombre del coach nunca aparece en la página de invitación**
- `src/pages/JoinPage.jsx:69-86` — el embed `coaches(nombre, email)` se ejecuta como `anon`, la RLS de `coaches` (SELECT propio) lo filtra → siempre "Te ha invitado tu entrenador". Fallo silencioso de RLS.
- Recomendación: resolverlo en la misma función/RPC de verificación de token de S1.

**F6. Matching de error por string exacto**
- `src/components/WorkoutBuilder.jsx:675` — `if (json.error === 'El atleta no tiene Intervals.icu configurado')`. Cualquier cambio de copy en el backend rompe el flujo de error especial.
- Recomendación: código de error estructurado (`{ error, code: 'NO_INTERVALS' }`).

### Verificaciones solicitadas (OK)

- **Env vars Netlify**: verificadas contra el sitio real. Código usa `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `COACH_FUNCTION_SECRET`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `URL` (builtin) y `VITE_SUPABASE_URL/ANON_KEY/COACH_SECRET`. **Todas existen con esos nombres exactos. Sin mismatches.** ⚠️ Ojo: este proyecto usa `SUPABASE_SERVICE_ROLE_KEY` mientras tricoach-v2/Forja usan `SUPABASE_SERVICE_KEY` — documentar para no cruzarlos. ⚠️ La CLI de Netlify sin `NETLIFY_SITE_ID` en este repo devuelve el sitio de **Forja** (no hay `.netlify/state.json`); conviene linkear el repo (`netlify link`).
- **Pin de Vite**: ✅ `package.json` — `vite@^7.3.5` + `@vitejs/plugin-react@^5.2.0`. Correcto.
- **Bloques con `\n\n`**: ✅ `send-to-intervals.js:147` y `intervalsText.js:71` usan `partes.join('\n\n')`; los pasos internos de un repeat con `\n` simple (correcto).
- **Sufijos de zona**: ✅ consistentes en ambos generadores — swim `Zx Pace`, run `Zx HR`, bike `Zx` (`send-to-intervals.js:100-105` = `intervalsText.js:24-29`). Nota menor: `objetivo_tipo='ritmo'` en bike devuelve `''` (se pierde el objetivo en silencio), pero el builder no ofrece "ritmo" para bike, así que hoy es inalcanzable.
- **Filtro de plausibilidad 2.0–20.0 min/km**: aplicado en `coach-athlete-data.js:20-21,176`, `coach-activity-detail.js:18-19` (también swim 0.8–6.0) y como red de seguridad en `PaceChart.jsx:24-29`. ⚠️ Incompleto en: `AthleteView.jsx:61-74` y `AthleteHome.jsx:54-67` (`formatRitmoActividad`) calculan velocidad bike y ritmo swim inline **sin bounding**; y en PRs, `calcularRecords` (`coach-athlete-data.js:277-294`) no acota velocidades de bike ni ritmos de swim (una actividad mal etiquetada contamina esos récords). El bounding de distancia por rangos existe para run y swim; bike solo tiene mínimo (semántica "mejor velocidad ≥ distancia", aceptable pero distinta).
- **`workout_steps.nombre` nunca se escribe**: `WorkoutBuilder.buildRegistro` (línea 598-610) guarda el nombre solo en `descripcion`; `send-to-intervals.js:250` y `tituloSesion` leen `workout_steps?.nombre` y caen al fallback. Funciona por el fallback, pero el campo primario está siempre vacío. (mejora)

---

## 3. Calidad de código

### 🟠 IMPORTANTE

**C1. Generador de sintaxis Intervals duplicado frontend/backend (y ya divergió)**
- `src/lib/intervalsText.js` (76 líneas) ≈ `netlify/functions/send-to-intervals.js:81-148`. Misma lógica copiada; la divergencia de las notas (F3) es la prueba del riesgo.
- Recomendación: un solo módulo compartido (las functions son CommonJS y el front ESM — opción pragmática: fichero único en `src/lib/` con export dual, o generar el texto solo en backend y exponer un endpoint de preview... lo más simple: mover la verdad al backend y que el preview llame a una función pura duplicada por build, testeada contra los mismos fixtures).

**C2. Helpers de Netlify Functions cuadruplicados**
- `httpsRequest`, `supabaseGet`, `supabasePatch`, `refreshStravaToken`, `withTimeout`, `round`, `mapDisciplina`, `zonaFc`, `lunesDeSemana`, UUID_REGEX, CORS: copiados en `coach-dashboard-data.js`, `coach-athlete-data.js`, `coach-activity-detail.js` (y variantes en `send-to-intervals.js`, `accept-invitation.js`, `strava-auth.js`). El refresh de token de Strava está implementado 3 veces.
- Recomendación: `netlify/functions/lib/` con módulos CommonJS compartidos (`_supabase.js`, `_strava.js`, `_http.js`) — Netlify empaqueta los require locales sin problema.

**C3. `AthleteHome.jsx` (1094 líneas) duplica ~400 líneas de `AthleteView.jsx`**
- Métricas resumen, PRs, los 5 charts, filtros, tabla de actividades y export CSV son el mismo bloque en ambos (`AthleteView.jsx:361-527` vs `AthleteHome.jsx:855-1072`), más utilidades copiadas (`formatRitmoActividad`, `formatDuracion`, `campoCsv`, `CSV_CABECERAS`, `tituloSesion`, `thStyle/tdStyle`). `SessionsList.jsx:35-42` redefine `hoyMadrid` que ya exporta `chartUtils.js:26`.
- Recomendación: extraer `<StravaAnalysis actividades semanas records weeks .../>` y mover formatters a `chartUtils`. Dejaría ambas páginas por debajo de las 400 líneas (regla del proyecto: 800 máx — `WorkoutBuilder.jsx` con 1056 también la incumple; separar sub-bloques a ficheros).

### 🟡 MEJORA

**C4. Código muerto**
- `src/components/PrescribeModal.jsx` (229 líneas): no lo importa nadie — sustituido por `WorkoutBuilder`.
- `src/components/IntervalsOnboarding.jsx`: importado en `AthleteView.jsx:14` pero nunca renderizado. Además, si se re-activara, está roto: consulta el perfil de OTRO usuario desde el cliente del coach (`IntervalsOnboarding.jsx:12-20`) y la RLS de `profiles` devuelve null siempre. El mensaje de error del `WorkoutBuilder` (línea 1003) aún referencia esta "sección Configuración Garmin" que no existe.
- `notas` sin usar en `send-to-intervals.js:120`.

**C5. `console.log` con datos del workout en producción**
- `send-to-intervals.js:236,244,261` — regla del proyecto: solo `console.error`.

**C6. Patrón de merge JSONB**
- No hay ningún merge `||` en este repo: `WorkoutBuilder.saveToSupabase` (línea 612-631) hace UPDATE del registro completo, **sobrescribiendo `workout_steps` entero**. Hoy no hay pérdida real porque nadie más escribe en ese JSONB, pero en cuanto el atleta escriba feedback ahí (plan conocido), cada edición del coach lo borrará.
- Recomendación: cuando haya un segundo escritor, pasar los updates de `workout_steps` por una RPC con `workout_steps = workout_steps || $1` o separar el feedback en columna/tabla propia.

---

## 4. Rendimiento

**P1. 🟡 N+1 en `coach-dashboard-data`** — `procesarAtleta` (`coach-dashboard-data.js:148-219`) hace 1 query a `profiles` por atleta; con N atletas son N+2 queries a Supabase (las llamadas a Strava sí son inevitables por atleta). Con `id=in.(...)` sería 1. Con pocos atletas es irrelevante; importa al crecer. Riesgo mayor: la función completa contra el timeout de 10 s de Netlify con >15-20 atletas (Strava en paralelo mitiga).

**P2. 🟡 ATL/CTL sin memoizar y O(n²)** — `TSSChart.jsx` recalcula `calcularCargaDiaria` en cada render del padre (cada click de filtro/tab re-renderiza los 5 charts), y los reduce con spread (`{...acc, [k]: v}`) son O(n²) sobre ~170 días. No hay `useMemo` en ningún chart ni en los `resumen`/`metricas` de AthleteView/AthleteHome. Perceptible en móvil con rangos de 24 semanas.

**P3. 🟡 Sin code-splitting** — Todas las rutas se importan estáticamente en `App.jsx`; Recharts (~100 KB gz, la dependencia más pesada) se descarga también en `/`, `/join/:token` y `/setup/intervals`, que no lo usan. `React.lazy` por ruta reduciría el bundle inicial de las páginas públicas ~60-70%.

**P4. 🟡 Advisors de Supabase (performance)** — FKs sin índice: `coach_sessions.coach_id` (el índice de 001 es `(coach_id)`... verificado: existe `idx_coach_sessions_coach`; los advisors señalan `athlete_invitations.athlete_id/coach_id` y `coach_athletes.athlete_id` — este último además lo consulta AthleteHome). 36 policies con `auth.uid()` sin envolver en `(select auth.uid())` (re-evaluación por fila) y policies permisivas múltiples en `profiles`/`coach_sessions`/`athlete_invitations` (duplicadas entre migración y dashboard — se arregla con S7).

---

## 5. UX / robustez en producción

**U1. 🟠 Atleta sin Intervals.icu (flujo "opcional")** — mayormente bien resuelto: `AthleteHome` oculta el botón Garmin sin key (línea 585), el wizard permite omitir cada paso, `send-to-intervals` devuelve 400 controlado y `WorkoutBuilder` lo muestra con aviso específico. Roturas: el mensaje del coach referencia una sección que ya no existe (C4), y el error se detecta por string (F6). El coach no tiene NINGUNA visibilidad del estado Intervals/Strava de sus atletas hasta que un envío falla — señalizarlo en la card del atleta.

**U2. 🟠 Estados de carga/error** — Dashboard (skeleton ✅), AthleteView/ActivityDetail (loading + error ✅). Gaps: los errores silenciados de F4; `Dashboard.eliminarInvitacion` (línea 212-215) ignora el error del DELETE y quita la fila del estado igualmente; en AthleteHome, un fallo de red en sesiones se presenta como "no hay entrenamientos".

**U3. 🟡 Mobile** — razonable: `flexWrap` + grids `auto-fill`, tablas con `overflowX: auto`, drawer del builder a `maxWidth: 100vw`, `useIsMobile` en SessionsList. Mejorables: tablas de 11 columnas en `/home` y `/athlete/:id` exigen mucho scroll horizontal en móvil (una vista de cards en `isMobile` ayudaría); los targets de los mini-botones del builder (`miniBtn`, ~24px) están por debajo de los 44px recomendados; el drawer no bloquea el scroll del body.

**U4. 🟡 Fechas del builder congeladas al cargar** — `DIAS_CHIPS = proximosDias(14)` se evalúa a module-load (`WorkoutBuilder.jsx:487`) y usa `new Date()` local del coach, no Europe/Madrid: una pestaña abierta de un día para otro ofrece "hoy" desfasado.

---

## 6. Preparación multi-tenant (diagnóstico, sin implementar)

Lo que ya está bien diseñado para multi-coach: tablas `coaches`, `coach_athletes`, `athlete_invitations` con `coach_id`; RLS por `coach_id = auth.uid()` (no hay ningún coach_id hardcodeado en SQL); las funciones verifican la relación coach-atleta por parámetro.

Hardcodes y decisiones single-tenant, por esfuerzo real:

| # | Punto | Dónde | Esfuerzo |
|---|---|---|---|
| MT1 | Dominio en OAuth Google | `Login.jsx:62` (`redirectTo: 'https://jongarcia.getricoach.com/dashboard'`) | Trivial: `window.location.origin` |
| MT2 | Dominio fallback Strava | `strava-auth.js:16` | Trivial: ya usa `process.env.URL` primero |
| MT3 | Branding "TriCoach Coach" / nombre del coach | `Login.jsx:83`, `index.html` | Pequeño: leer de `coaches` |
| MT4 | Secreto único compartido | `COACH_FUNCTION_SECRET`/`VITE_COACH_SECRET` | Desaparece solo si haces S2 (auth por JWT): la identidad del coach saldría del token, no de un secreto por-tenant. **S2 ES el trabajo multi-tenant principal** |
| MT5 | Un sitio Netlify = un coach (subdominio jongarcia.*) | Infra | Medio: o wildcard `*.getricoach.com` en un solo sitio resolviendo el coach por hostname (tabla `coaches.slug`), o path `/c/:slug`. Decisión de producto |
| MT6 | Un atleta ↔ un coach | `maybeSingle()` en `AthleteHome.jsx:181-190`, `Dashboard.jsx:137-141`; `unique(coach_id, athlete_id)` permite N-N en schema pero la UI asume 1 | Medio si algún día hace falta; hoy basta documentarlo |
| MT7 | Alta de coaches | No existe: se insertan a mano en `coaches` | Medio: página de registro + (decisión) aprobación manual |
| MT8 | Strava app compartida | Un solo `STRAVA_CLIENT_ID` para todos los tenants | OK así (límites de rate de Strava por app: 200 req/15min, 2000/día — vigilar al crecer) |

**Veredicto**: el modelo de datos ya es multi-tenant; el bloqueo real es la autenticación de funciones (S2) y la estrategia de dominio (MT5). MT1-MT3 son cosméticos. Recomendación: hacer S2 ahora porque es un fix de seguridad que además desbloquea multi-tenant gratis; posponer MT5-MT7 hasta que haya un segundo coach real.

---

## Resumen por severidad

| Sev | ID | Hallazgo |
|---|---|---|
| 🔴 | S1 | `athlete_invitations` con `SELECT USING (true)` — tokens y emails públicos |
| 🔴 | S2 | `VITE_COACH_SECRET` = secreto backend, en el bundle público; funciones sin verificar JWT |
| 🔴 | F1 | Tab Análisis del atleta roto (falta policy SELECT del atleta en `coach_athletes`) |
| 🟠 | F2 | Google login expulsa a atletas |
| 🟠 | S3 | Stack trace al cliente en send-to-intervals |
| 🟠 | S4 | OAuth Strava sin state firmado (CSRF) |
| 🟠 | S5 | accept-invitation: no atómico, inserts sin comprobar, sin rate limit |
| 🟠 | S6 | verify-intervals-key: proxy abierto |
| 🟠 | S7 | Migraciones ≠ policies reales |
| 🟠 | F3 | Preview muestra notas que nunca se envían (generador duplicado divergente) |
| 🟠 | F4 | Errores silenciados (wizard Intervals, sesiones atleta, PATCH post-envío) |
| 🟠 | F5 | Nombre del coach nunca visible en JoinPage (RLS) |
| 🟠 | F6 | Error matching por string exacto |
| 🟠 | C1-C3 | Duplicación: generador Intervals, helpers functions ×4, AthleteHome/AthleteView |
| 🟠 | U1/U2 | Visibilidad estado Intervals para el coach; gaps de error |
| 🟡 | C4-C6 | Dead code (PrescribeModal, IntervalsOnboarding), console.log, sin merge JSONB (futuro) |
| 🟡 | P1-P4 | N+1 profiles, ATL/CTL sin memoizar, sin code-splitting, índices FK |
| 🟡 | U3/U4 | Tablas en móvil, targets táctiles, chips de fecha congelados |
| 🟡 | MT1-MT8 | Ver sección 6 |
