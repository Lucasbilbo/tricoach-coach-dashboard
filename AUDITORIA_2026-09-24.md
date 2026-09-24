# Auditoría técnica — TriCoach Coach Dashboard

**Fecha:** 2026-09-24
**Rama:** `main`
**Alcance:** seguridad, correctitud, entrega a Intervals.icu, frontend, deuda técnica y *drift* respecto a `coach-dashboard-spec-v2.md`.
**Método:** revisión estática del código + comparación de `supabase/migrations/*.sql` contra el estado **real** de producción (proyecto Supabase `luqpjgzpydquqturgjmt`, consultas de solo lectura sobre `pg_policies`, `pg_proc` y los advisors). No se modificó ningún archivo de código ni la base de datos.

> Referencia previa: `AUDITORIA_2026-07-02.md` (lotes S1–S7 / F1–F6). Varias de sus mitigaciones se verifican aquí como aplicadas en código pero **no** en la base de datos real (ver §Drift y CRÍTICO-1).

---

## Resumen por severidad

| Sev | # | Titular |
|-----|---|---------|
| 🔴 Crítico | C1 | RPCs `SECURITY DEFINER` (`accept_invitation`, `check_rate_limit`) ejecutables por `anon`/`authenticated` en producción — contradice la migración 005 |
| 🟠 Alto | A1 | Rate limiting no aplicado a los endpoints de datos ni a `send-to-intervals` / `strava-auth` |
| 🟠 Alto | A2 | El frontend lee credenciales de terceros (`strava_token`, `intervals_api_key`) al navegador |
| 🟠 Alto | A3 | `increment_messages_today`: `SECURITY DEFINER` con `search_path` mutable y ejecutable por `anon` |
| 🟡 Medio | M1 | Agrupación semanal usa la TZ local de la actividad (Strava), no Europe/Madrid |
| 🟡 Medio | M2 | ATL/CTL/TSB: CTL a 28 días (canónico 42), media simple y anclada a la última actividad |
| 🟡 Medio | M3 | Lógica de carga (ATL/CTL) duplicada y divergente entre `TSSChart` y `athleteStats` |
| 🟡 Medio | M4 | Estado "Completada" por coincidencia laxa disciplina+fecha (falsos positivos + TZ) |
| 🟡 Medio | M5 | `AthleteHome` reimplementa el render de sesiones y el envío a Garmin de `SessionsList` |
| 🟡 Medio | M6 | `Access-Control-Allow-Origin: *` en todas las functions |
| 🟢 Bajo | B1–B10 | 7 problemas de lint, código muerto, drift de spec, bundle sin *code-splitting*, memoización, accesibilidad, políticas duplicadas, etc. |

---

## 1. Seguridad

### 🔴 C1 — RPCs `SECURITY DEFINER` expuestas a `anon`/`authenticated` (drift migración → producción)
**Dónde:** `supabase/migrations/005_hardening_backend.sql:...` (bloques `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO service_role`) vs. estado real.

La migración 005 declara explícitamente que `accept_invitation` y `check_rate_limit` solo debe poder ejecutarlas `service_role`:

```sql
REVOKE ALL ON FUNCTION public.check_rate_limit(...) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(...) TO service_role;
```

Pero en producción (`pg_proc.proacl`) las tres RPC son ejecutables por `authenticated, anon, service_role, postgres`. Confirmado además por los advisors `0028_anon_security_definer_function_executable` y `0029_authenticated_security_definer_function_executable`:

- `public.accept_invitation(...)` — invocable por `anon` vía `POST /rest/v1/rpc/accept_invitation`.
- `public.check_rate_limit(...)` — invocable por `anon` vía `POST /rest/v1/rpc/check_rate_limit`.
- `public.verify_invitation_token(...)` — intencionalmente `anon` (correcto, es para `/join`).

**Impacto:**
- `check_rate_limit` (sin token, sin sesión): cualquiera puede llamarla directamente. Cada llamada **inserta una fila** en `rate_limit_hits` → escritura no autenticada en la BD y crecimiento no acotado (DoS de almacenamiento). Además, un atacante puede **pre-agotar el bucket** de un `subject` legítimo (p. ej. `('accept_invitation', <IP-víctima>)` o `('verify_intervals', <uid-víctima>)`) y **bloquear el registro/verificación** de esa víctima. El limiter deja de ser una defensa y pasa a ser un vector.
- `accept_invitation` (con un token válido): permite **saltarse** la función Netlify (creación del usuario GoTrue + rate limit por IP) e invocar la lógica de alta directamente con `p_athlete_id` arbitrario. La FK a `profiles`/`auth.users` limita la creación de perfiles arbitrarios, pero sí permite **quemar tokens de invitación** válidos sin crear cuenta (DoS de invitaciones) y ejercitar rutas de inserción no previstas.

**Fix (una migración, no toca código):**
```sql
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;
```
Verificar después con `get_advisors(security)` que 0028/0029 dejan de listarlas. Esto confirma la sospecha ya escrita en la cabecera de la migración 004 ("las policies se crearon a mano en el dashboard y los `.sql` dejaron de ser la fuente de verdad"): las sentencias `REVOKE/GRANT` de la 005 nunca se aplicaron tal cual.

---

### 🟠 A1 — Rate limiting ausente en los endpoints de datos y de entrega
**Dónde:** `netlify/functions/coach-athlete-data.js`, `coach-activity-detail.js`, `coach-dashboard-data.js`, `send-to-intervals.js`, `strava-auth.js` (ninguno importa `lib/rate-limit`).

Solo `accept-invitation.js` y `verify-intervals-key.js` llaman a `allowRequest(...)`. Los endpoints que consumen la cuota de Strava del *app* (client_id compartido) no tienen límite:

- `coach-athlete-data.js:340-353` — por cada carga hace 1 llamada a `/athlete/activities` **más hasta 15 llamadas de detalle** (`PR_SPLITS_RUN_ACTIVIDADES=10` + `PR_SPLITS_SWIM_ACTIVIDADES=5`) para los PRs por splits. Un coach autenticado puede repetir esto sin freno → **agotar el rate limit global de Strava** de toda la aplicación (deja al resto de atletas sin datos) y disparar coste/latencia.
- `send-to-intervals.js` — sin límite: envío/borrado repetido de eventos a Intervals.icu/Garmin.
- `strava-auth?action=start` — firma un `state` por cada POST sin límite.

**Impacto:** abuso limitado a usuarios autenticados/autorizados, pero un solo coach (o una cuenta comprometida) puede degradar el servicio para todos por la cuota compartida de Strava.

**Fix:** reutilizar `allowRequest('coach_athlete_data', auth.uid, N, 60)` (y buckets equivalentes) al inicio de cada handler, tras `verifyAuth`. Presupuestar N según la cuota de Strava (p. ej. 30/min/usuario). **Depende de C1**: mientras `check_rate_limit` sea invocable por `anon`, el propio limiter es manipulable.

---

### 🟠 A2 — Credenciales de terceros llegan al frontend
**Dónde:** `src/pages/AthleteHome.jsx:116`, `src/pages/IntervalsSetup.jsx:140`, `src/components/IntervalsOnboarding.jsx:14`.

```js
// AthleteHome.jsx:116
.select('nombre, intervals_api_key, intervals_athlete_id, strava_token')
```

`CLAUDE.md` fija la regla *"Strava tokens NUNCA en frontend"*, pero el cliente hace `select` del `strava_token` (access token real) y del `intervals_api_key` (credencial que da acceso a la cuenta de Intervals.icu) solo para calcular booleanos de "conectado":

```js
const intervalsOk = !!(perfil?.intervals_api_key && perfil?.intervals_athlete_id)  // :261
const stravaOk = !!perfil?.strava_token                                            // :262
```

RLS (`profiles`: `auth.uid() = id`) limita la lectura al **propio** perfil, así que no hay fuga entre usuarios, pero:
1. Viola la regla explícita del proyecto.
2. Amplía el radio de un XSS: cualquier script inyectado puede exfiltrar el token de Strava y la API key de Intervals desde `perfil` en memoria.

**Fix:** no seleccionar los secretos en el cliente. Opciones: exponer columnas booleanas derivadas (`has_strava`, `has_intervals`) o una vista/RPC que devuelva solo flags; en `select` pedir únicamente `intervals_athlete_id` (no sensible) + flags. El `intervals_api_key` que el usuario introduce en `IntervalsSetup` es entrada (write), no hace falta releerlo.

---

### 🟠 A3 — `increment_messages_today`: `SECURITY DEFINER` con `search_path` mutable, ejecutable por `anon`
**Dónde:** base de datos real (no está en `supabase/migrations/` de este repo — probablemente pertenece a la app TriCoach que comparte proyecto Supabase).

Advisors: `0011_function_search_path_mutable` y `0028/0029`. Una función `SECURITY DEFINER` sin `SET search_path = ''` es susceptible de *search-path hijacking* (un objeto malicioso en un esquema del `search_path` del llamante puede resolverse en lugar del previsto), ejecutándose con privilegios del *owner*. Que sea invocable por `anon` amplía la superficie.

**Fix:** `ALTER FUNCTION public.increment_messages_today(...) SET search_path = '';` y `REVOKE EXECUTE ... FROM anon, authenticated` si no debe ser pública. Coordinar con el equipo del proyecto TriCoach por ser BD compartida.

### 🟢 (Bajo) Auth: protección de contraseñas filtradas desactivada
Advisor `auth_leaked_password_protection`: activar el chequeo contra HaveIBeenPwned en Supabase Auth (Dashboard → Auth → Passwords).

### Notas de seguridad que **están bien** (verificado)
- `verifyAuth` (`lib/auth.js`) valida el JWT contra `/auth/v1/user` y comprueba `coaches` con service key; la identidad **nunca** sale del body. Falla cerrado. `athleteId` del body se autoriza contra `coach_athletes` (`canAccessAthlete`). Todos los IDs pasan `UUID_REGEX` antes de interpolarse en la URL REST (sin inyección).
- `oauth-state.js`: `state` firmado con HMAC-SHA256 + nonce + expiración 10 min + `timingSafeEqual`. Correcto contra CSRF de vinculación (S4).
- Errores al cliente son genéricos con `code`; el detalle va a `console.error` server-side (S3).
- La lectura pública de `athlete_invitations` (`public_read_invitation_by_token`) **sí** está eliminada en producción (S1 ✓); el acceso pasa por `verify_invitation_token` (respuesta uniforme anti-enumeración).
- RLS activado en las 10 tablas revisadas. Los `.env`/service key no aparecen en `src/` (solo `VITE_SUPABASE_URL`/`ANON_KEY`, que es lo esperado).

---

## 2. Correctitud

### 🟡 M1 — Zona horaria: se agrupa por la TZ local de la actividad, no por Europe/Madrid
**Dónde:** `coach-athlete-data.js:108` y `:214-252` (`agruparSemanas`), `coach-dashboard-data.js:41` (`semanasRecientes`), `src/lib/athleteStats.js`, `src/lib/chartUtils.js:42`.

La fecha de cada actividad se toma de `act.start_date_local.slice(0,10)` (hora **local de la actividad** según Strava), y sobre ella se calcula `lunesDeSemana`. Solo el *fallback* usa `fechaMadrid(new Date(act.start_date))` (`:108`). En cambio "hoy" sí es Madrid (`hoyMadrid()`), igual que los límites de `SessionsList` y las queries de `AthleteHome`.

**Impacto:** el spec afirma *"Semanas agrupadas por lunes en Europe/Madrid"*, pero en realidad se agrupa por la TZ donde se registró la actividad. Para un atleta que entrena fuera de España (o cerca de medianoche con offset), una actividad puede caer en un día/semana distinto al de Madrid, desalineando el volumen semanal, la Línea de Transición y el emparejamiento sesión↔actividad (ver M4). Comparaciones "hoy (Madrid)" vs "fecha (local actividad)" son inconsistentes.

**Fix:** normalizar toda fecha de actividad a Europe/Madrid con `fechaMadrid(new Date(act.start_date))` (UTC → Madrid) de forma uniforme, en vez de confiar en `start_date_local`. Centralizar en `lib/metrics` para functions y en `chartUtils` para frontend.

### 🟡 M2 — ATL/CTL/TSB simplificados y anclados a la última actividad
**Dónde:** `src/components/charts/TSSChart.jsx:16-50` y `src/lib/athleteStats.js:18-57`.

- `VENTANA_CTL_DIAS = 28`. El modelo canónico (TrainingPeaks) usa **CTL a 42 días** y medias móviles **exponenciales**; aquí es media **aritmética simple** dividiendo siempre por la ventana completa. Los primeros días (< ventana) se dividen igualmente por 7/28 → ATL/CTL **infravalorados** durante el *warm-up*.
- `computeLoad` calcula CTL/ATL "a fecha de la última actividad" (`hasta = fechas[fechas.length-1]`), no a **hoy**. Si el atleta lleva 10 días sin entrenar, la "forma actual" (TSB) y la fatiga se muestran como si fuera el día de la última sesión → **sobreestima** frescura/fitness en tapers o parones.
- El TSS en sí es un `hrTSS` estimado (documentado): `(min/60)·(FCmedia/FCmax)²·100`. En `coach-athlete-data.js:95-99` `intensidad_pct` se **redondea a entero antes de elevar al cuadrado**; en `coach-dashboard-data.js:50-56` no se redondea → el TSS del dashboard y el de la vista de atleta pueden diferir para la misma actividad.

**Impacto:** las métricas de carga son orientativas y pueden inducir a error en decisiones de entrenamiento (que es el propósito del producto). No hay bug de *crash*, pero sí desviación respecto a la semántica esperada de ATL/CTL/TSB.

**Fix:** documentar explícitamente que es un modelo simplificado, o migrar a EWMA con constantes 7/42; calcular ATL/CTL **a hoy** (rellenando con 0 los días sin actividad hasta `hoyMadrid()`); unificar el redondeo de `intensidad_pct` entre ambas functions.

### 🟡 M3 — Lógica de carga duplicada y divergente
**Dónde:** `TSSChart.jsx:30-50` (`calcularCargaDiaria`, itera día a día) vs `athleteStats.js:37-57` (`computeLoad`, suma sobre actividades en ventana). Dos implementaciones distintas del mismo cálculo ATL/CTL que pueden divergir con el tiempo (una usa array de días, otra recorre actividades; los redondeos y el "hasta" difieren).

**Fix:** extraer un único `computeLoadDiaria(actividades, hasta)` compartido y consumirlo desde ambos.

### 🟡 M4 — Estado "Completada" por coincidencia laxa
**Dónde:** `src/components/SessionsList.jsx:39-46`.

```js
const act = (actividades||[]).find(a => a.fecha === sesion.fecha && a.disciplina === sesion.disciplina)
if (act) return { texto: '✓ Completada', ... }
if (sesion.fecha > hoyMadrid()) return { texto: 'Programada', ... }
return { texto: 'Pendiente', ... }
```

Problemas:
1. Marca **Completada** con *cualquier* actividad de esa disciplina ese día, aunque no tenga relación con lo prescrito (p. ej. un rodaje suave marca como hecha una serie de calidad). Falso positivo.
2. `sesion.fecha` es fecha elegida por el coach (semántica Madrid) mientras `act.fecha` viene de `start_date_local` (TZ de la actividad, ver M1) → una actividad a las 00:30 puede no casar con la fecha prescrita.
3. Zonas terminadas en disciplinas no mapeadas nunca casan (ver mapeo abajo).

**Fix:** definir "completada" con una ventana/tolerancia y, si es posible, por volumen/duración aproximada; alinear ambas fechas a Madrid.

### Mapeo de disciplinas — correcto con matices
`lib/metrics.js:11-18` (`mapDisciplina`) cubre run/bike/swim/strength/other razonablemente (`velomobile`→bike, `weight|crossfit|workout`→strength). Posibles huecos: `VirtualRun`/`VirtualRide` sí contienen "run"/"ride" (ok), pero `EBikeRide`, `Hike`, `Walk`, `Elliptical`, `Rowing` caen en `other` y no suman a ningún deporte del tri. `DISCIPLINE_TYPE` en `send-to-intervals.js:26-32` mapea a los tipos de Intervals correctamente. No es un bug, pero conviene revisar la cobertura.

### Zonas FC — correcto
`zonaFc` (`metrics.js:20-27`) usa cortes 60/70/80/90 % de FCmax (fallback 185). Coherente. `intensidad_pct = FCmedia/FCmax·100`. La distribución de zonas (`computeZonas`) reparte minutos por la zona **media** de la actividad (no por streams reales de FC), lo cual es una aproximación esperada dado que no se descargan streams.

---

## 3. Entrega a Intervals.icu — sólida, con matices

**Dónde:** `netlify/functions/send-to-intervals.js`.

Lo que está **bien**:
- **Idempotencia:** si la sesión ya tenía `intervals_event_id`, borra el evento anterior (`intervalsDelete`) antes de recrear → no duplica en el reloj (`:236-240`).
- **Compensación (saga):** si el `POST` a Intervals devuelve 2xx pero el `PATCH` a Supabase **no** se confirma tras 3 reintentos con backoff (`patchConReintentos`), se **revierte** el evento recién creado y se devuelve `PERSIST_FAILED` (`:259-278`). Evita el evento huérfano que el usuario reenviaría y duplicaría (F4c).
- Notas del entrenador nunca se envían al reloj (`incluirNotas:false`, regla de negocio para no congelar el Garmin) — fuente única `lib/intervals-text.cjs`.
- Autorización por sesión: `auth.uid === session.coach_id || session.athlete_id` (`:195`), derivada del JWT.

Matices / riesgos residuales:
- **Ventana no atómica en el borrado idempotente** (`:238-240`): entre `intervalsDelete(evento_previo)` y `intervalsPost(nuevo)`, si el `POST` falla, la sesión queda con `intervals_event_id` **viejo ya borrado** y `enviado_a_garmin=true` sin evento vivo. El siguiente reenvío intentará borrar un id inexistente (404, tolerado) y recreará — se auto-cura, pero durante ese intervalo el estado en BD miente. Aceptable, conviene documentarlo.
- **Sin rate limit** (ver A1): reintentos + reenvíos manuales sin freno.
- Lint: `send-to-intervals.js:79` `parsed` se asigna y no se usa (ver B1).

---

## 4. Frontend

### Variables sin definir / efectos
- **No** se detectan variables sin definir (build y lint pasan salvo los 7 ítems de §5).
- `AthleteHome.jsx:173-205` — efecto de carga de Strava con guard manual `datos._weeks === weeks && datos._userId === userId` y `datos` **omitido** de las deps (warning `exhaustive-deps`, B-lint). Es una decisión deliberada para evitar el bucle, pero frágil: mezcla estado de datos con metadatos de caché (`_weeks`, `_userId`) dentro del propio objeto `datos`. Preferible un estado separado `{key, data}` o `useRef` para la clave de caché.
- `SessionsList.jsx:131-133` y `JoinPage.jsx:62-66` y `WorkoutBuilder.jsx:25-30` — `setState` síncrono dentro de `useEffect` (lint). Funciona, pero dispara renders en cascada; ver §5.

### Rendimiento
- 🟢 **B-bundle: sin code-splitting.** `App.jsx` importa todas las rutas de forma estática → un único chunk de **936.94 kB (270.89 kB gzip)**; Vite avisa (>500 kB). `JoinPage`/`IntervalsSetup`/`AthleteHome`/`Dashboard`/`AthleteView` deberían cargarse con `React.lazy` + `Suspense`. Recharts (recharts) es el peso dominante y solo se usa en la pestaña de análisis → candidato claro a lazy.
- 🟢 **Memoización.** En `StravaAnalysis.jsx:67-70` se recalculan `computeResumenStats`, `computeZonas`, `computePaceTrend` y `buildTransitionColumns` **en cada render** (p. ej. al pulsar un filtro de disciplina o abrir el detalle de actividad, que cambian `filtroDisciplina`/`selectedActivityId` pero no las actividades). `TSSChart` (`calcularCargaDiaria`, O(días·28)) y `PowerChart` se re-renderizan por lo mismo al no estar memoizados. Envolver los cómputos en `useMemo([actividades, semanas])` y los charts en `React.memo`.

### Estados de carga y error
- Correctos en general: `AthleteView` (cargando/error/vacío por pestaña), `AthleteHome` distingue error de "sin entrenamientos" (F4b, `:156-164`), `StravaAnalysis` tiene estados vacíos ("Sin actividades en este rango", `:243-249`, `:307-313`) y deshabilita "Exportar CSV" sin datos.
- `SessionsList.jsx:181` solo muestra "Cargando…"; el error se pinta arriba (`:318`) pero no hay estado vacío explícito fuera de la semana actual (aceptable).

### Accesibilidad (básica) — 🟢 varias carencias
- **Filas/tarjetas clicables como `<div onClick>`** sin `role="button"`, `tabIndex={0}` ni handler de teclado: `StravaAnalysis.jsx:253` y `:318` (filas de actividad), `SessionsList.jsx:192`, `AthleteHome.jsx:394`. No accesibles por teclado ni lector de pantalla.
- La "tabla" de actividades de escritorio (`StravaAnalysis.jsx:292-366`) es un **grid de `<div>`**, no una `<table>` semántica; las cabeceras son `<span>` (`:304`). Sin estructura para lectores de pantalla. (La de `AthleteHome` sí usa `<table>` real.)
- **Estado solo por emoji** sin alternativa textual: columna "Garmin" en `AthleteHome.jsx:596` (✅/⏳) no tiene `aria-label`/`title` (en `SessionsList.jsx:254` sí hay `title`).
- La cabecera de columna dice **"ESTADO"** (`StravaAnalysis.jsx:304`) pero la celda muestra la **disciplina** (`:349-362`), no un estado — etiqueta engañosa.
- Sin `outline`/estilos de foco visibles en botones con `border:none`.

**Fix:** convertir filas clicables en `<button>`/`role="button"`+`tabIndex`+`onKeyDown`; usar `<table>` semántica o `role="table/row/cell"`; añadir texto alternativo a los estados por emoji; corregir la etiqueta "ESTADO".

---

## 5. Deuda técnica

### 🟢 B1 — Los 7 problemas de lint (`npm run lint`)
```
netlify/functions/send-to-intervals.js
  79:13  error  The value assigned to 'parsed' is not used in subsequent statements  no-useless-assignment
src/components/SessionsList.jsx
  132:5  error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
src/components/WorkoutBuilder.jsx
  27:7   error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
src/components/WorkoutDetail.jsx
  48:26  error  'esPrimero' is defined but never used   no-unused-vars
  79:31  error  'disciplina' is defined but never used  no-unused-vars
src/pages/AthleteHome.jsx
  205:6  warning  React Hook useEffect has a missing dependency: 'datos'  react-hooks/exhaustive-deps
src/pages/JoinPage.jsx
  64:7   error  Calling setState synchronously within an effect can trigger cascading renders  react-hooks/set-state-in-effect
✖ 7 problems (6 errors, 1 warning)
```
Propuestas:
- **`send-to-intervals.js:79`**: en `supabasePatch`, `let parsed = null; try { parsed = JSON.parse(data) } catch { parsed = null }` — la rama `catch` reasigna al mismo valor. Simplificar a `let parsed; try { parsed = JSON.parse(data) } catch { parsed = null }`.
- **`WorkoutDetail.jsx:48` (`esPrimero`) y `:79` (`disciplina`)**: parámetros/props que no se usan. `PasoRow` recibe `esPrimero` (pasado en `:109`) y nunca lo lee; `BloqueCard` recibe `disciplina` (pasado en `:177`) y no lo usa. Eliminar ambos de la firma y de las llamadas.
- **`SessionsList.jsx:132` / `WorkoutBuilder.jsx:27` / `JoinPage.jsx:64`**: `setState` síncrono en efecto. Para `SessionsList` (llama a `cargarSesiones()` que hace `setCargando(true)`) y `JoinPage` (`setTokenValido(false)` en el guard de token ausente) el patrón es benigno; se silencia derivando el estado o inicializándolo fuera del efecto. Revisar caso a caso; no romper la lógica.
- **`AthleteHome.jsx:205`** (warning): ver §4 (caché ad-hoc en `datos`).

### 🟢 B2 — Código muerto
- **`src/components/PrescribeModal.jsx`** — 0 referencias. Sustituido por `WorkoutBuilder`. Eliminar.
- **`src/components/IntervalsOnboarding.jsx`** — 0 referencias. Eliminar (o cablear si se pretendía usar; el onboarding real vive en `IntervalsSetup`).

### 🟢 B3 — Duplicación `AthleteHome` ↔ `SessionsList` (M5)
El análisis Strava **sí** está bien compartido (`StravaAnalysis` lo usan `AthleteView` y `AthleteHome`). Pero el **render de sesiones prescritas** está duplicado: `AthleteHome.jsx` reimplementa a mano las tarjetas de "próximas" + tabla de "pasadas" y su propio `enviarAGarmin` (`:236-257`), replicando lo que `SessionsList` ya hace (`renderSesion`, `handleReenviarGarmin` `:159-179`). Además se repiten helpers casi idénticos:
- `tituloSesion` (definido en `SessionsList.jsx:48` y `AthleteHome.jsx:28`).
- `DISC_LABELS`/`DISC_LABELS_HOME` (idénticos, `SessionsList.jsx:13` y `AthleteHome.jsx:53`).
- `formatFechaSesion` vs `formatFechaLarga` (misma lógica, distinto nombre).
- `hoyMadrid` redefinido localmente en `SessionsList.jsx:30` cuando ya se exporta desde `chartUtils.js:26`.

**Fix:** extraer un componente `SesionCard` + helpers a `lib/` y consumirlo desde ambas vistas; importar `hoyMadrid` de `chartUtils`.

### 🟢 B4 — Dependencias
`package.json`: todas las dependencias declaradas se usan (`recharts` en 2 archivos, `react-router-dom` en 7, `@supabase/supabase-js` en el cliente). No se detectan dependencias huérfanas. (Nota: las functions usan solo `https`/`crypto` nativos y `netlify/functions/package.json` fija `{"type":"commonjs"}` — correcto.)

---

## 6. Drift `coach-dashboard-spec-v2.md` ↔ código real

### Drift de base de datos (migraciones vs producción)
Verificado contra `pg_policies`/`pg_proc` el 2026-09-24. La cabecera de `004_...sql` ya documenta gran parte; sigue vigente:

| # | Divergencia | ¿Intencionada? |
|---|-------------|----------------|
| D1 | **RPCs ejecutables por `anon`/`authenticated`** pese al `REVOKE/GRANT` de la 005 | ❌ **No** — ver C1, hay que corregir |
| D2 | `athlete_invitations.coach_id/token/used` **NULLABLE** en prod; 003 los declara `NOT NULL` | ⚠️ Documentada, no corregida (bajo riesgo, pero conviene alinear) |
| D3 | Falta la policy `coaches_update_own` (001): un coach **no puede** actualizar su fila | ⚠️ Intencionada por ahora ("nada lo usa todavía") |
| D4 | `coach_athletes`: prod tiene 1 policy `ALL` "Coach ve sus atletas" + "Atleta ve su propia relación"; 001 define 3 granulares que no existen | ✅ Aparentemente intencionada (consolidada a mano) |
| D5 | `coach_sessions`: prod tiene `ALL` "Coach gestiona sus sesiones" + "Atleta ve sus propias sesiones" (esta última **no está en ningún `.sql`**) | ⚠️ Funciona, pero la policy del atleta no está versionada |
| D6 | `profiles`: policies permisivas **duplicadas** (`ALL` "Usuario ve su perfil" + granulares) → advisor `multiple_permissive_policies` | ❌ Ruido/perf, limpiar |
| D7 | Policies con rol `public` y `auth.uid()` sin envolver en `(select auth.uid())` → advisor `auth_rls_initplan` (perf en tablas grandes) | ⚠️ Optimización pendiente |
| D8 | Existe `increment_messages_today` (no versionada aquí) con `search_path` mutable y expuesta a `anon` | ❌ Ver A3 |

Los `.sql` del repo **no** son la fuente de verdad del esquema. Recomendación: reconciliar con `supabase db pull` y versionar el estado real, o al menos añadir migraciones que dejen prod == repo.

### Drift de arquitectura de ficheros (spec vs `src/`)
El spec `coach-dashboard-spec-v2.md` (fechado 2026-06-10) quedó **desactualizado** frente al código actual. Diferencias que parecen **evolución intencionada** pero no reflejada en el doc:

- **Charts renombrados/eliminados.** El spec lista `VolumeChart.jsx`, `ZonesChart.jsx`, `PaceChart.jsx` bajo `charts/`. En realidad `charts/` solo contiene `ChartCard`, `PowerChart`, `TSSChart`. Volumen/Zonas/Ritmo ahora se calculan en `lib/athleteStats.js` y se pintan como barras propias dentro de `StravaAnalysis` (no como componentes Recharts). → Actualizar spec.
- **`PrescribeModal` → `WorkoutBuilder`.** El spec describe `PrescribeModal.jsx` como el alta de sesiones; el código usa `WorkoutBuilder` (+ `workout/`). `PrescribeModal` es código muerto (B2).
- **Superficie no documentada en el spec:** `StravaAnalysis`, `WorkoutBuilder`/`WorkoutDetail`/`workout/*`, `TransitionLine`, `PRsBlock`, `ActivityDetail`, `PolylineMap`, `WeekCompare`, páginas `AthleteHome`/`IntervalsSetup`/`JoinPage`, y funciones `accept-invitation`, `send-to-intervals`, `strava-auth`, `verify-intervals-key`, `lib/{auth,rate-limit,oauth-state,strava,http,supabase-rest,metrics,intervals-text}`. El spec solo cubre las 3 funciones `coach-*` y las migraciones 001–002.
- El spec menciona `SUPABASE_SERVICE_ROLE_KEY`, columnas reales de `profiles` (`strava_token`, `fc_maxima`, etc.) y el pin de Vite — todo eso **sigue vigente** en el código (✓). `CLAUDE.md` está más al día que el spec (documenta la auth por JWT y que `VITE_COACH_SECRET`/`COACH_FUNCTION_SECRET` están obsoletos; se confirma que el código ya no los usa, solo quedan en los headers CORS por compatibilidad de preflight).

**Recomendación:** regenerar `coach-dashboard-spec-v2.md` (o marcarlo como histórico) para reflejar la arquitectura real; hoy induce a error (p. ej. apunta a `PrescribeModal` y a charts inexistentes).

---

## Anexos — salida de comandos

### `npm run lint`
```
✖ 7 problems (6 errors, 1 warning)
```
(detalle completo en §5-B1).

### `npm run build`
```
vite v7.3.5 building client environment for production...
✓ 765 modules transformed.
dist/index.html                   0.74 kB │ gzip:   0.41 kB
dist/assets/index-*.css           0.12 kB │ gzip:   0.13 kB
dist/assets/index-*.js          936.94 kB │ gzip: 270.89 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 2.65s
```
Build **verde**. Aviso de chunk >500 kB (ver B-bundle en §4). El pin `vite@^7` + `@vitejs/plugin-react@^5` se respeta (regla del proyecto).

---

## Top 5 riesgos

1. **🔴 RPCs `SECURITY DEFINER` abiertas a `anon` (C1/D1).** `check_rate_limit` permite escrituras no autenticadas en la BD y bloquear el registro de terceros; `accept_invitation` deja saltarse la función Netlify. Contradice directamente la migración 005. **Corregir ya** con `REVOKE ... FROM anon, authenticated`.
2. **🟠 Sin rate limiting en los endpoints de datos (A1).** Un coach autenticado puede agotar la cuota de Strava compartida por toda la app (hasta 16 llamadas Strava por carga en `coach-athlete-data`), degradando el servicio para todos.
3. **🟠 Credenciales de terceros en el frontend (A2).** `strava_token` e `intervals_api_key` se descargan al navegador solo para checks booleanos, violando la regla del proyecto y ampliando el impacto de un XSS.
4. **🟡 Zona horaria y modelo de carga (M1/M2).** El producto vende decisiones de entrenamiento: agrupar por TZ de la actividad (no Madrid) y un ATL/CTL/TSB simplificado y anclado a la última actividad pueden mostrar carga/frescura engañosas.
5. **🟢/🟡 Drift spec↔código y BD↔migraciones (§6).** Los `.sql` y el spec ya no son fuente de verdad (charts y `PrescribeModal` inexistentes, policies/RPCs creadas a mano, código muerto). Riesgo de decisiones basadas en documentación obsoleta y de reintroducir regresiones.
```
