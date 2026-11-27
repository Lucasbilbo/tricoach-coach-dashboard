<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Plan → hecho → cómo fue (feedback, cumplimiento, TSS previsto) y nutrición por sesión. Índice: CLAUDE.md. -->

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
  **Editor «solo lo elegido» (2026-11-27, variante A de Claude Design)**: el plan
  enseña únicamente los productos con cantidad > 0 (con su +/− y un resumen de mezcla y minutos),
  el resumen (g/h y totales) va ARRIBA de la lista y el resto de la despensa se
  añade desde la hoja «Añadir producto» (`HojaProductos`, sobre `Hoja` de
  `ui/HojaAcciones.jsx`, z-index 300 para quedar por encima del cajón del creador).
  Antes se pintaba la despensa entera con contadores a 0 (~1.100 px en el creador).
  La etiqueta de las notas pasó a «Notas de nutrición». Cubre creador, tarjeta de
  la agenda y /home (mismo `PlanProductos`). Repaso: `atleta-nutricion-hoja` y
  `creador-nutricion-hoja`.
  **Ajustes por producto (N2)**: cada producto elegido enseña un resumen (chips «Min 30 · 60» y, en bidones con mezcla propia, «40 g · 600 mg») y un botón «Ajustar reparto [y bidón]» que abre `HojaAjustes` con `Mezcla` + `Momentos` (texto de 16 px, cajas ≥ 44 px). Los +/− de cantidad miden 44 px. Repaso: `atleta-nutricion-ajustes`.
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
- **Aviso y acciones (2026-11-27, N3/N4)**: el aviso de nutrición del coach (`avisoTomado`: «Le sentó mal» / «Comió bastante menos de lo previsto») ya no es rojo ni vive solo en un `title` (invisible en táctil): va en ámbar (`COLORS.warning`) y su motivo se escribe bajo la fila de acciones de la tarjeta y en la cabecera plegable. En `Botonera`, «Quitar plan»/«Quitar lo tomado» (rojo, izquierda) queda lejos de «Guardar» (derecha) y «Editado por …» pasa a línea de apoyo encima. No hay aviso de «sin plan»: sería ruido en todas las sesiones futuras.
