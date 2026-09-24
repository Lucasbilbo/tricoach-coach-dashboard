# Auditoría funcional — TriCoach Coach Dashboard

**Fecha:** 2026-09-24
**Objetivo:** comprobar que lo que muestra el panel coincide con los datos reales.
**Atleta de prueba:** Lucas Bilbao (`profiles.id = fcd0f6cb-…`, `fc_maxima = 199`), que además figura como coach. Vinculado a **2 coaches**: Jon García y él mismo.
**Datos reales usados:**
- 83 actividades de Strava reales (ventana 2026-06-25 → 2026-09-23) vía el conector de Strava.
- 46 sesiones prescritas reales (`coach_sessions`) — **43 en el pasado**, todas creadas por el coach Jon García.
- Muestra de FC/vatios por actividad (consultada actividad-a-actividad).

**Cómo se verificó (script independiente, fuera de `src/`):**
- `audit/real-data.mjs` — los datos reales embebidos.
- `audit/recompute.mjs` — reimplementa la MISMA lógica de las Netlify Functions (citando `archivo:línea`) y una referencia "correcta", y las compara. Ejecutar: `node audit/recompute.mjs`.

> **Límite honesto de método.** No puedo invocar las funciones desplegadas (exigen un JWT de coach/atleta que no tengo) ni el feed de resumen del conector incluye FC/vatios (las funciones sí los leen del summary REST de Strava). Por eso: (a) el **volumen** (km/horas/semanas) se recalcula al 100% y es idéntico al algoritmo de la función por construcción — sirve para validar el algoritmo sobre datos reales y cazar edge-cases; (b) **TSS/zonas/ATL/CTL** dependen de FC, así que se demuestran con una muestra real con FC y con análisis del algoritmo. Donde digo "el panel mostraría X" es el resultado del algoritmo de la función corrido sobre tus datos, no un scrape del UI en vivo.

---

## Resumen por severidad

| Sev | # | Titular |
|-----|---|---------|
| 🟠 Alto | F1 | "Completada/Pendiente" del coach depende de la ventana de semanas cargada → falsos "Pendiente" para sesiones antiguas |
| 🟠 Alto | F2 | Actividades sin FC (natación típica) se excluyen de TSS/zonas/ATL/CTL → carga infravalorada |
| 🟡 Medio | F3 | Zona FC mal clasificada en umbrales por redondeo de intensidad (real: bici Z3→Z4) |
| 🟡 Medio | F4 | Semana equivocada al viajar de zona horaria (start_local ≠ Europe/Madrid) — latente en tus datos (São Paulo) |
| 🟡 Medio | F5 | Cada coach solo ve SUS sesiones; el atleta las ve todas → pestaña vacía y sin explicación para el 2º coach |
| 🟡 Medio | F6 | "Completada" por coincidencia laxa disciplina+fecha (falsos positivos si hay 2 actividades de la disciplina el mismo día) |
| 🟢 Bajo | F7 | TSS difiere entre dashboard y vista de atleta por redondeos (~1 punto/actividad, sesgo acumulable) |
| 🟢 Bajo | F8 | El golf y actividades sin distancia entran en el volumen (horas) del panel |
| 🟢 Bajo | F9 | Sin tope de distancia ante glitches de GPS (500 km) — latente |
| 🟢 Bajo | F10 | El atleta solo ve 20 sesiones pasadas + 10 futuras; divergencias de UX de envío entre vistas |

---

## 1. Métricas — recálculo sobre tus actividades reales

### Volumen por semana (algoritmo de `coach-athlete-data`, sobre tus 83 actividades)
Estas son las cifras que el panel debe mostrar (VolumeChart / tabla de semanas / cards):

```
semana(lunes) | km_run | km_bike | km_swim | horas | nº
2026-06-22 |   11.8 |   115.8 |    2.55 |   6.5 |  5
2026-06-29 |   24.2 |   167.4 |    4.10 |  10.1 |  8
2026-07-06 |   19.7 |     3.9 |    2.43 |   3.6 |  6
2026-07-13 |   17.6 |     0.0 |    0.00 |   2.8 |  3
2026-07-20 |   22.1 |    42.4 |    1.35 |   4.3 |  5
2026-07-27 |   12.1 |   260.2 |    2.00 |  11.2 |  7
2026-08-03 |   13.8 |   184.7 |    4.50 |   9.7 |  7
2026-08-10 |   10.0 |    44.0 |    2.20 |   3.5 |  3
2026-08-17 |   26.3 |   202.3 |    2.38 |  10.6 |  8
2026-08-24 |   30.3 |   118.3 |    3.70 |   8.2 |  8
2026-08-31 |   10.0 |   137.1 |    0.95 |   6.5 |  4
2026-09-07 |   37.4 |   162.6 |    0.00 |  11.8 |  8
2026-09-14 |   20.4 |   138.4 |    3.13 |   8.5 |  8
2026-09-21 |    7.4 |    38.7 |    1.50 |   2.8 |  3
```
**km por disciplina y horas por semana coinciden** con lo que produce la función (misma fórmula: `distance/1000`, `moving_time/3600`, agrupado por lunes). No hay discrepancia en volumen salvo los edge-cases F8.

### TSS / zonas / ATL / CTL / TSB — muestra con FC real
```
id           | sport | FCmed | durMin | int(ath→entero) | int(ref) | TSS ath | TSS dash | zona ath | zona ref
20229230755  | Swim  | SIN FC → TSS=null, zona=null en TODAS las vistas
20243272004  | Ride  | 159.1 | 106.6  | 80              | 79.96    | 114     | 114      | Z4 ✗     | Z3
20253415703  | Run   | 170.8 | 50.0   | 86              | 85.83    | 62      | 61       | Z4       | Z4
```
Discrepancias concretas detectadas → ver F2, F3, F7.

**Sobre ATL/CTL/TSB:** no puedo dar el número exacto del panel sin la FC de las 83 actividades (el conector no la expone en bloque). Pero la estructura del cálculo ya está auditada en `AUDITORIA_2026-09-24.md` (§M2): CTL a **28 días** (canónico 42), media aritmética simple, y anclada a la fecha de la **última actividad** (no a hoy). Con tu parón/afinamiento antes del 2026-09-24, el TSB que ves está calculado "a fecha 2026-09-23", no a hoy → sobreestima frescura.

---

### 🟠 F2 — Actividades sin FC desaparecen de TSS / zonas / ATL / CTL
- **Qué ve el usuario:** una sesión real (p. ej. tu natación del **2026-09-18**, 30 min) que **no aporta nada** al TSS acumulado, a la distribución de zonas FC ni a las líneas ATL/CTL. Una semana de solo nado sin pulsómetro se ve como TSS ≈ 0 y gráfico de zonas vacío, aunque hubo carga real.
- **Causa:** `coach-athlete-data.js:97-99` calcula `tss_estimado` solo `if (fcMedia && duracionMin)`; sin FC → `null`. `zona_fc` = `null`. La natación se registra a menudo sin FC (verificado: `has_heartrate:false` en la del 18-sep). `athleteStats.js:computeZonas/computeLoad` ignoran los `null`.
- **Fix:** para actividades sin FC, estimar TSS por duración×factor de disciplina (o por `relative_effort`/`suffer_score` de Strava, que sí viene), y marcar la estimación como "sin FC" en el UI. Como mínimo, avisar de que hay sesiones sin datos de FC excluidas del cómputo.

### 🟡 F3 — Zona FC mal clasificada por redondeo de intensidad
- **Qué ve el usuario:** tu bici del **2026-09-19** (FC media 159 → intensidad real **79.96 %**, que es **Z3**) se contabiliza como **Z4**. La distribución de zonas FC del panel mete minutos en la zona equivocada en cualquier actividad cuya intensidad caiga justo bajo un umbral (60/70/80/90).
- **Causa:** `coach-athlete-data.js:95` redondea `intensidad_pct` a entero (`round(...,0)`) **antes** de pasarla a `zonaFc()` (`metrics.js:20`). 79.96 → 80 → Z4, cuando `<80` es Z3.
- **Fix:** pasar la intensidad **sin redondear** a `zonaFc()` (redondear solo para mostrar), o usar `< 79.5` como corte. Idealmente calcular zonas desde los streams de FC reales, no desde la FC media.

### 🟢 F7 — TSS distinto entre dashboard y vista de atleta
- **Qué ve el usuario:** el TSS de una misma actividad/semana difiere entre el semáforo del **Dashboard** (cards de 7 días) y el **TSS acumulado** de la vista de atleta. Ejemplo real (carrera 20-sep): vista de atleta **62**, dashboard **61**.
- **Causa:** `coach-athlete-data.js:95-99` redondea `intensidad_pct` (y `duracion_min` a 1 decimal) antes de elevar al cuadrado; `coach-dashboard-data.js:50-56` **no** redondea. El sesgo es pequeño por actividad (~1 punto) pero **sistemático** y se acumula al sumar la semana.
- **Fix:** unificar la fórmula de TSS en `lib/metrics.js` y usarla en ambas funciones sin redondeos intermedios.

---

## 2. Semanas — medianoche y domingo/lunes vs Europe/Madrid

Casos probados (`audit/recompute.mjs`, sección 2): se deriva `start_date_local` del instante UTC + offset para que sean consistentes, y se compara la semana que asigna la función (`lunesDeSemana(start_local)`) con la semana real en Europe/Madrid.

```
- España, domingo 23:30 (UTC+2):  func lunes 2026-06-22 | Madrid 2026-06-22 | OK
- España, lunes 00:15 (UTC+2):    func lunes 2026-06-29 | Madrid 2026-06-29 | OK
- Viaje São Paulo dom 22:00 (UTC-3): func lunes 2026-06-22 | Madrid 2026-06-29 | ✗ DIFIERE
- Viaje Tokio lun 07:00 (UTC+9):  func lunes 2026-06-29 | Madrid 2026-06-29 | OK
```

### 🟡 F4 — Semana equivocada al entrenar en otra zona horaria
- **Qué ve el usuario:** **estando en España no hay problema** — entrenamientos a las 23:30 del domingo o 00:15 del lunes caen en la semana correcta, porque `start_local` de Strava ya es hora de Madrid. El fallo aparece **al viajar**: una actividad hecha el domingo por la noche en São Paulo se contabiliza en la semana anterior (lunes 06-22) cuando en Madrid ya era lunes (semana 06-29). El volumen/serie de esa semana se desplaza.
- **Causa:** las funciones agrupan por `start_date_local` (hora local de la actividad), no por Europe/Madrid, pese a que el spec dice "por lunes en Europe/Madrid" (`coach-athlete-data.js:108`, `agruparSemanas`; `coach-dashboard-data.js:41`).
- **En tus datos reales:** todas las actividades salvo São Paulo (2026-09-02, por la mañana → mismo día en Madrid) son de España, así que **no se observa desalineación real** ahora mismo. Es un bug **latente** que morderá en tu próximo viaje transatlántico (o de un atleta que viaje).
- **Fix:** convertir el instante UTC (`start_date`) a Europe/Madrid con `Intl.DateTimeFormat` antes de `lunesDeSemana`, de forma uniforme.

---

## 3. Sesiones prescritas — Completada / Pendiente (tus 43 sesiones pasadas)

Recálculo con **todas** tus actividades reales (`audit/recompute.mjs`, sección 3): **37 Completadas, 6 Pendientes**. Las 6 pendientes son prescripciones sin ninguna actividad de esa disciplina ese día:

```
2026-07-05 swim · 2026-07-29 bike · 2026-07-30 run · 2026-07-30 swim · 2026-08-02 swim · 2026-08-08 bike
```
Revisadas contra tus actividades: son días **sin** actividad de esa disciplina (p. ej. el 2026-07-05 hiciste bici, no nadaste; el 2026-07-30 solo bici). El estado "Pendiente" es **correcto** para esos 6.

### 🟠 F1 — "Completada/Pendiente" del coach depende de la ventana de semanas cargada
- **Qué ve el usuario:** en la vista de **coach** (pestaña "Sesiones prescritas"), con el rango por defecto de **8 semanas**, las sesiones más antiguas que la ventana aparecen como **"Pendiente" aunque estén hechas**. Ejemplo: hoy 2026-09-24 con `weeks=8` solo se cargan actividades desde ~2026-07-30; tus sesiones **completadas** del 29-jun al 28-jul (unas 10) se mostrarían como "Pendiente" en el histórico. Sube el rango a 12/24 y "se completan" — lo que delata el bug.
- **Causa:** `SessionsList.jsx:39-46` (`estadoSesion`) compara contra el array `actividades` que recibe de `AthleteView`, y ese array proviene de `coach-athlete-data` con `weeks` (por defecto 8, `coach-athlete-data.js:284` + `AthleteView.jsx:18`). Las sesiones del "Ver histórico" caen fuera de la ventana de actividades → nunca casan.
- **Fix:** para calcular el estado, cargar las actividades que cubran el rango de fechas de las sesiones mostradas (o pedir un flag `completada` calculado en backend con la ventana adecuada), en vez de reutilizar la ventana del análisis.

### 🟡 F6 — "Completada" por coincidencia laxa disciplina + fecha
- **Qué ve el usuario:** una sesión se marca "✓ Completada" si existe **cualquier** actividad de la misma disciplina ese día, aunque no sea la prescrita. Si un día haces un rodaje suave por tu cuenta pero el coach había prescrito series, la serie figura como completada. En tus datos el 2026-09-20 y el 2026-09-12 hay bici+carrera; cada sesión casa con su disciplina (bien), pero el criterio no valida que sea *esa* sesión.
- **Causa:** `SessionsList.jsx:40-43` — `find(a => a.fecha === sesion.fecha && a.disciplina === sesion.disciplina)`. Sin comparar volumen/tipo.
- **Fix:** exigir además una tolerancia de duración/distancia respecto a lo prescrito, o marcar "actividad ese día" en vez de "completada".

---

## 4. Flujos — crear → editar → eliminar → enviar a Garmin, y coach vs atleta

**Crear/editar/eliminar (`WorkoutBuilder` + `SessionsList`):**
- Crear valida fecha+nombre (`WorkoutBuilder.jsx:159`), inserta y refresca. Editar hace `update` por `sessionId` (`:139-155`). Eliminar pide `window.confirm` y borra (`SessionsList.jsx:135-151`). Todo correcto y con manejo de error visible.
- **Envío a Garmin desde el builder** distingue bien `NO_INTERVALS` (mensaje amable "el atleta no tiene Intervals configurado") de error genérico (`:197-204`). Bien.

**Divergencias coach ↔ atleta:**

### 🟡 F5 — Cada coach solo ve SUS sesiones; el atleta las ve todas
- **Qué ve el usuario:** tú tienes 43 sesiones creadas por **Jon**. Como **atleta** (`AthleteHome`) las ves todas (query solo por `athlete_id`, `AthleteHome.jsx:141-152`). Como **coach** abriendo tu ficha (`AthleteView` → `SessionsList`), la query filtra `coach_id = <coach actual> AND athlete_id` (`SessionsList.jsx:112-116`); si el coach que mira no es Jon, la pestaña "Sesiones prescritas" sale **vacía y sin explicación** (y RLS lo refuerza). Con un atleta de 2 coaches, cada coach ve un subconjunto distinto.
- **Causa:** filtro por `coach_id` en la lista (aislamiento correcto entre coaches) pero **sin estado vacío informativo** cuando otro coach ya prescribió. El atleta y el coach no ven lo mismo.
- **Fix:** en `SessionsList`, mostrar un vacío explicativo ("Este atleta tiene sesiones de otro entrenador" / o permitir ver de solo lectura según política) y decidir el modelo de multi-coach a propósito.

### Otras diferencias coach vs atleta (🟢 F10)
- **Estado Completada/Pendiente:** solo existe en la vista de coach (`SessionsList`). En `AthleteHome`, la tabla de "Entrenamientos pasados" (`:558-641`) solo muestra estado **Garmin** (✅/⏳), nunca si lo completaste. Dos relatos distintos del mismo dato.
- **Límite de histórico del atleta:** `AthleteHome` solo trae **10 próximas + 20 pasadas** (`:144`, `:151`); con 43 sesiones pasadas, el atleta **no ve** las más antiguas. El coach (`SessionsList`) las agrupa todas.
- **UX de envío:** builder → mensaje `NO_INTERVALS` amable; `SessionsList.handleReenviarGarmin` (`:159-179`) muestra el texto crudo del error arriba; `AthleteHome.enviarAGarmin` (`:236-257`) muestra error por-sesión y hace update **optimista** (no recarga) mientras `SessionsList` recarga todo. Botón "Enviar" del coach requiere `tieneWorkout` (`SessionsList.jsx:259`), así que una sesión sin bloques no se puede (re)enviar desde la lista aunque sí desde el builder.
- **Errores silenciosos:** ninguno grave detectado; los fetch tienen `.catch`. El único punto ciego es F1 (estado calculado sobre datos incompletos), que no es un error visible sino un dato engañoso.

---

## 5. Datos vacíos o parciales

- **Sin FC (F2):** natación sin pulsómetro → sin TSS ni zonas ni carga. **Real y frecuente en tus nados.**
- **Sin potencia:** `StravaAnalysis.jsx:72-73` solo pinta `PowerChart` si hay **≥3** bici con `potencia_media`. En el feed de resumen tus bicis casi no traen vatios (solo 1 de la muestra los tenía) → **el gráfico de potencia no se muestra** para ti. Qué ve el usuario: la sección de potencia simplemente no aparece (comportamiento aceptable, pero silencioso). Fix: mostrar un aviso "sin datos de potencia suficientes" en vez de omitir sin más.
- **Sin actividades:** `coach-athlete-data` devuelve arrays vacíos → cards con "—", "Sin actividades en este rango" y sin Línea de Transición. Degradación correcta.
- **Solo natación:** km_run/bike = 0, sin progresión de ritmo (no hay carreras), sin potencia; zonas solo si los nados llevan FC (a menudo no) → análisis casi vacío y TSS ≈ 0. Combinación de F2 + charts condicionales.
- **Semana sin sesiones:** `SessionsList` muestra "Sin sesiones esta semana" **solo** para la semana actual (`:296`); semanas pasadas/futuras vacías se omiten. Correcto.

### 🟢 F8 — Golf y actividades sin distancia entran en el volumen
- **Qué ve el usuario:** el **golf del 2026-09-13** (2.7 h) suma a las "horas" de esa semana del panel; los rodillos sin GPS (2026-07-14, 2026-09-15) suman horas pero 0 km. El volumen semanal incluye actividades no-entrenamiento.
- **Causa:** `agruparSemanas` suma `moving_time` de todas las actividades; `mapDisciplina('Golf')` → `'other'` (`metrics.js:17`), que cuenta en horas/nº pero no en km de disciplina.
- **Fix:** excluir disciplinas `other` (o una lista negra: Golf, Walk, Workout…) del cómputo de volumen de entrenamiento, o mostrarlas en una fila "otros" aparte.

### 🟢 F9 — Sin tope de distancia ante glitches de GPS
- **Qué ve el usuario:** hoy nada (tu ride "el garmin marcó 500km" ya llegó corregido a 59 km). Pero no hay red de seguridad: si Strava devolviera una distancia disparatada, inflaría km_bike/km_swim y el TSS. Solo el **ritmo** tiene tope de plausibilidad (2–20 min/km), no la distancia.
- **Causa:** `coach-athlete-data.js` sanea ritmo (`RITMO_MIN/MAX_PLAUSIBLE`) pero no distancia/duración.
- **Fix:** añadir topes de plausibilidad por disciplina a distancia y velocidad media.

---

## Top 5 hallazgos funcionales

1. **🟠 F1 — Adherencia engañosa para el coach.** Con el rango por defecto (8 sem), ~10 de tus sesiones completadas de jun–jul se muestran como "Pendiente". El coach puede pensar que faltaste a entrenamientos que sí hiciste.
2. **🟠 F2 — La natación sin FC no cuenta.** TSS, zonas y ATL/CTL ignoran tus nados sin pulsómetro; la carga y el balance de disciplinas quedan infravalorados.
3. **🟡 F3 — Zonas FC mal clasificadas en los umbrales.** Tu bici del 19-sep (79.96 %) se cuenta como Z4 en vez de Z3 por redondear la intensidad antes de asignar zona.
4. **🟡 F4 — Semanas desplazadas al viajar.** Estando en España es correcto; fuera de tu zona horaria (São Paulo/Asia) el volumen se asigna a la semana equivocada.
5. **🟡 F5 — Coach y atleta no ven lo mismo.** Cada coach solo ve sus propias prescripciones y el atleta las ve todas; con 2 coaches, el segundo ve la pestaña vacía sin explicación, y el estado Completada/Pendiente ni existe en la vista del atleta.

**Reproducible:** `node audit/recompute.mjs` (datos en `audit/real-data.mjs`).
