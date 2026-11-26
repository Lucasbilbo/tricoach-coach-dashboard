<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Temporada, disponibilidad del atleta, agenda con horas y planificación semanal. Índice: CLAUDE.md. -->

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
