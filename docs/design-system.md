<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Design system «Pulso», sistema de UI, gráficos y pestaña Análisis. Índice: CLAUDE.md. -->

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
- **Mínimos (2026-11-26)**: ningún texto de la app baja de 12 px (la agenda ya no usa 9,5–11,5; su columna de horas pasó de 32 a 36 px para que «sin hora» quepa) y las pestañas de escritorio y el interruptor del potenciómetro tienen 44 px de zona táctil (el interruptor dibuja 46×28 dentro de un botón de 52×44). Los chips de la agenda (142×16 px) son solo de la rejilla de escritorio (ratón y arrastre); en móvil la agenda es una lista del día con tarjetas de 48 px y la hoja `HojaMover`. Solo faltaría revisar una tablet táctil ≥ 700 px, que usa la rejilla.
  **2026-11-27 (creador de entrenos)**: `miniBtn` (36→44 px), los botones de subir/bajar/quitar bloque (32→44 px, con «quitar» separado 10 px porque no tiene deshacer), los enlaces de texto de la escritura rápida y «Otra fecha» (alto mínimo 44 px). La escritura rápida es un `textarea` que crece con lo escrito (Enter sigue generando). Deshacer/confirmar al quitar un bloque: ver más abajo.
  **Filas que se desplazan (W6)**: `ui/FilaDesplazable` pone un degradado en el borde derecho mientras hay más contenido (desaparece al llegar al final, no recibe toques). Usada en las filas de fecha y hora del creador y en Temporada (C7: tira de meses, filtros y escenarios); `fondo` = color de lo que hay detrás. «Otra hora» también mide 44 px.
  **Textos que explican (C4–C6)**: el ritmo de carrera dice «min/km» y que la barra más alta es más rápida (altura relativa a esas semanas); la carga del panel dice con qué se compara («Por encima de su media · 308», «En su línea · media N», puede ocupar 2 líneas); el estado «Inscrito» es la píldora de contorno teal con check (escalera candidata → confirmada → inscrito, sin color nuevo).
- Inputs a 16 px y regla global en `index.css`: en pantallas táctiles ningún
  campo baja de 16 px (Safari en iPhone hacía zoom). `:active`/hover también
  en `index.css` (los inline styles no pueden).
- **Quitar bloque con Deshacer (2026-11-27)**: quitar es inmediato y sale un aviso fijo sobre el pie del cajón, «Bloque N quitado · Deshacer» (6 s, solo para la misma disciplina). Deshacer lo devuelve a su posición y recupera si estaba abierto; si la lista cambió, lo inserta como mucho al final. Sin diálogo de confirmación: es reversible y se usa mucho. Repaso: `creador-quitar-bloque` y `creador-deshacer-bloque` (este falla si el bloque no vuelve a su sitio). **Pasos de una serie**: el mismo aviso, «Paso N quitado · Deshacer»; solo hay uno a la vez (el último gesto gana) y se descarta al reordenar bloques, porque cambian los índices. Repaso: `creador-quitar-paso` y `creador-deshacer-paso`.
- **Pestañas** (`Tabs`): en el móvil barra flotante ABAJO; en tablet y
  escritorio grupo de píldoras fijo arriba. `pageStyle` deja sitio abajo.
- Marca **GetRiCoach** (`Brand`/`BrandMark` en `ui/Layout.jsx`): ola (natación),
  línea (bici) y zancadas discontinuas (carrera). Mismo símbolo en
  `public/favicon.svg` y `public/apple-touch-icon.png`. No usar "TriCoach".
- **Sesiones: una sola píldora principal (2026-11-27, C1/C2)**: «Prescribir» es la única píldora rellena de la pantalla; «Enviar las N» del aviso ámbar es de contorno. «Enviar al reloj» de cada sesión ya no es un botón propio en la tarjeta (era una fila más por sesión): va como primera entrada del menú «⋯» (solo si no está enviada, no es pasada y tiene entreno), y el estado «Sin enviar» sigue visible en la tarjeta. El lápiz de editar se queda fuera del menú (es lo que más se pulsa). Repaso: `atleta-sesion-menu`.
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
- **Controles de Análisis en móvil del coach (2026-11-27, variante A de Claude Design)**: por debajo de 700 px, `SelectorPeriodo` con `compacto` pone los presets (4/8/12/24 sem) en una sola fila y un botón «⋯» que abre `ui/HojaAcciones` (Semana concreta, Rango de fechas, Comparar semanas, Actualizar datos). «Prescribir entreno» se muestra como «Prescribir» en la misma fila que el nombre (`PageHeader` acepta `anchoTitulo`). Escritorio, tablet y la vista del atleta no cambian. Repaso: pantalla `atleta-analisis-mas` (solo móvil).
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
