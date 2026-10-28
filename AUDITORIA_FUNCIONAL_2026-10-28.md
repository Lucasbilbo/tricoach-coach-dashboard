# Auditoría funcional — 2026-10-28

Alcance: lo construido en octubre (agenda y mover sesiones, feedback, cumplimiento,
estado Hecha/Pendiente y el creador de sesiones). Lectura del código de `main`
(`70a5040`) más consultas de solo lectura a producción. **No se ha cambiado código**:
cada punto lleva el arreglo propuesto para decidir antes de tocar nada.

Estado de `main`: lint 0 · build OK · tests 191/194. Los 3 que fallan son de
fechas fijas en los fixtures y se arreglan en #42.

## Resumen

| # | Gravedad | Qué | Quién lo nota |
|---|---|---|---|
| M1 | Media | Los avisos del creador de sesiones se cierran antes de que se vean | Jon |
| M2 | Media | Si Intervals no deja borrar el evento viejo, el reloj se queda con el entreno duplicado y no se avisa a nadie | Atleta |
| B1 | Baja | Con 3/4 de las sesiones por distancia, la agenda y los avisos de disponibilidad trabajan con una duración inventada (60 min) | Jon |
| B2 | Baja | Hecha/Pendiente: dos sesiones de la misma disciplina el mismo día pueden emparejarse al revés | Jon y atleta |
| B3 | Baja | "Próximos" del atleta enseña 10 como mucho, sin "ver más" | Atleta |
| B4 | Baja | Los chips de fecha del creador no cambian de día si la pestaña sigue abierta pasada la medianoche | Jon |

---

## M1 · Los avisos del creador de sesiones se cierran antes de que se vean

**Dónde:** `WorkoutBuilder.handleGuardar` / `handleEnviarGarmin` +
`SessionsList.handleEditGuardado` y el `onSaved` de `AthleteView`.

El creador llama a `onSaved()` también cuando el guardado sale **a medias**:

- "Cambios guardados, pero no se pudo actualizar el reloj. Queda pendiente de enviar."
  (sesión ya enviada que se edita y el reenvío falla).
- En #43, "Sesión guardada, pero no se pudo guardar la nutrición".

Los dos padres cierran el creador en cuanto reciben `onSaved`
(`setSesionEditando(null)` / `setModalAbierto(false)`). El mensaje se pinta y
desaparece en el mismo instante, así que Jon nunca lo lee. Lo mismo pasa con el
"Enviado al reloj de …" del caso bueno, aunque ahí da igual.

**Mitigación actual:** en la reedición, la lista acaba mostrando "Sin enviar al
reloj" (se guarda `enviado_a_garmin=false`). Aun así, Jon no sabe que algo falló
ni por qué. Lo de la nutrición no deja ningún rastro.

**Arreglo propuesto (pequeño):** separar "refrescar la lista" de "cerrar".
`onSaved({ cerrar })`: el creador pasa `cerrar: false` cuando hay un aviso y los
padres solo cierran si `cerrar !== false`. Un commit, sin tocar backend.

## M2 · Reloj con el entreno duplicado sin aviso

**Dónde:** `move-session.js` y `send-to-intervals.js` devuelven
`anterior_retirado: false` cuando el DELETE del evento viejo falla. Ni
`SessionsList` ni `AgendaAtleta` ni `WorkoutBuilder` leen ese campo.

El orden "crear nuevo → confirmar → borrar viejo" es el correcto: nunca deja al
atleta sin entreno. El problema está solo en el último paso. Si el borrado falla
(Intervals caído, 5xx, timeout), el atleta tiene **los dos eventos en el reloj**:
el de la fecha vieja y el de la nueva. En el panel todo aparece bien. Solo queda
un `console.error` en Netlify, que retiene ~1 h.

**Arreglo propuesto:** cuando `anterior_retirado === false`, mostrar un aviso
ámbar del tipo "Movida, pero quedó el entreno antiguo en Intervals: bórralo a
mano del día X". Un paso más allá sería reintentar el borrado más tarde
(`intervals_event_id_pendiente_borrar`), pero eso ya pide migración. Empezaría
por el aviso.

## B1 · Duración inventada en las sesiones por distancia

**Datos (producción, solo lectura):** 45 de 62 sesiones (73 %) tienen
`duracion_min = null` porque sus pasos van por distancia: bici 11/14, carrera
22/33 y natación 12/15.

Consecuencias:
- `SemanaCalendario` las dibuja de **60 min** (`DURACION_POR_DEFECTO`). Una tirada
  de 25 km o una bici de 80 km ocupan lo mismo que un rodaje de una hora.
- `evaluarDisponibilidad` no puede saber si una sesión **cabe** en la franja del
  atleta ni si **excede** sus minutos. El aviso ámbar no salta justo en las
  sesiones largas, que es donde más importa.

**Arreglo propuesto:** #43 añade `segundosPrevistos` (tssPrevisto.js), que estima
la duración con el ritmo de cada paso o uno de referencia. Usarlo como fallback
en la agenda y en los avisos, marcando la duración como estimada (borde
discontinuo o "~"). Es lógica pura, se puede cubrir con tests.

## B2 · Hecha/Pendiente puede cruzar dos sesiones del mismo día

**Dónde:** `estadoSesion.asignarActividades`.

Dentro de cada (día, disciplina), cada sesión se queda con la actividad de
duración más parecida. **Las sesiones sin `duracion_min` (el 73 %) se quedan con
la primera actividad libre**, sin comparar nada. En un doble (por ejemplo series
por la mañana y rodaje por la tarde, ambos por distancia), el cumplimiento de
cada sesión puede calcularse contra la actividad equivocada: "4,2 km de 12 km"
en una y "12 km de 4 km" en la otra.

Es poco frecuente hoy, pero escala con los dobles.

**Arreglo propuesto:** comparar por metros prescritos (`metrosPrescritos`) o por
`segundosPrevistos` cuando no hay `duracion_min`. Es lógica pura y ya tiene tests
(`estado-sesion.test.js`).

## B3 · "Próximos" del atleta, máximo 10

**Dónde:** `AthleteHome`, consulta de próximas con `.limit(10)` y sin paginar.

Con la planificación a 2–3 semanas (actual + 2 siguientes, ~5–7 sesiones por
semana) caben 15–20 sesiones futuras. Las que pasan de la décima **no salen en
Próximos**, ni tampoco su botón "Enviar a mi reloj" ni su plan de nutrición.
"Mi semana" sí las enseña semana a semana, por eso no es grave.

**Arreglo propuesto:** "Ver más" como en el historial, o limitar Próximos a "esta
semana y la que viene" con un enlace a la agenda.

## B4 · Chips de fecha caducados pasada la medianoche

**Dónde:** `WorkoutBuilder.jsx`, `const DIAS_CHIPS = proximosDias(14)` a nivel de
módulo, con la fecha **local del navegador** (`new Date()`, `getDate()`).

Se calcula una vez al cargar la página. Si Jon deja la pestaña abierta de un día
para otro, el primer chip ("hoy") es ayer. Además no usa Europe/Madrid, aunque
la regla del proyecto es Madrid para todo. Para Jon en España da igual; para un
atleta de viaje no.

**Arreglo propuesto:** calcular los chips dentro del componente al abrir el
creador, a partir de `ahoraMadrid()` (ya está en el estado `ahora`).

---

## Revisado y correcto

- **Reglas de mover** (`mover-reglas.cjs`): misma fuente para cliente y servidor.
  Lo pasado no se mueve; hoy solo a una hora que no ha llegado; validación de
  fecha estricta (rechaza 2026-02-30).
- **`move-session`**: identidad sacada del JWT y la sesión; el atleta solo toca
  fecha, hora y `movida_*`; orden crear → confirmar → borrar con compensación;
  `sessionId` validado como UUID antes de construir la ruta REST.
- **Hora en el evento** (`intervals-evento.js`): `start_date_local` sin zona, así
  que Intervals la interpreta en la zona del atleta y aguanta el cambio de hora.
- **Feedback**: RLS solo para el atleta y solo sobre sesiones suyas; las filas
  vacías se rechazan en la BD; se borra en cascada con la sesión.
- **Cumplimiento**: natación nunca por duración (justificado con datos), los
  descansos no cuentan, metros de técnica sumados en backend.
- **Caché**: mover, editar y borrar invalidan `invalidarDatosAtleta`, que vacía
  también `planCarga`, así que la proyección y el "TSS de ~X" se recalculan.

## Orden sugerido

1. **M1**: un commit pequeño; además hace visible el aviso nuevo de nutrición.
2. **M2**: el aviso.
3. **B1 + B2** juntos: los dos se resuelven con la duración estimada.
4. B3 y B4 cuando toque.
