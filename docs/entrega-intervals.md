<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Entrega a Intervals.icu → Garmin, creador de sesiones y escritura rápida. Índice: CLAUDE.md. -->

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
