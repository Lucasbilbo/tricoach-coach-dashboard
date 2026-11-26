<!-- Movido tal cual desde CLAUDE.md (2026-11-27). Resumen: Métricas: TSS, ATL/CTL/TSB (fuente única de verdad). Índice: CLAUDE.md. -->

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
