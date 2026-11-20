// lib/metrics.js — utilidades de cálculo compartidas por las funciones que
// transforman actividades de Strava (CommonJS). Extraído de copias idénticas
// en coach-athlete-data y coach-activity-detail (round también en dashboard).

const FC_MAX_DEFAULT = 185
const TIMEZONE = 'Europe/Madrid'

// Fecha local (YYYY-MM-DD) en Europe/Madrid para un instante dado. Toda fecha de
// actividad y toda agrupación semanal debe pasar por aquí: Strava entrega
// start_date_local en la TZ DE LA ACTIVIDAD (no la del entrenador), así que
// agrupar por start_date_local desplaza la semana cuando el atleta viaja.
function fechaMadrid(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function round(value, decimals) {
  if (value == null || Number.isNaN(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function mapDisciplina(tipo) {
  const t = (tipo || '').toLowerCase()
  if (t.includes('run')) return 'run'
  if (t.includes('ride') || t.includes('bike') || t === 'velomobile') return 'bike'
  if (t.includes('swim')) return 'swim'
  if (t.includes('weight') || t.includes('crossfit') || t === 'workout') return 'strength'
  return 'other'
}

// Intensidad relativa como % de la FC máxima, SIN redondear.
// Devuelve null si falta la FC media. El fallback de FC máx evita dividir por 0.
function intensidadPct(fcMedia, fcMax) {
  if (!fcMedia) return null
  const max = fcMax || FC_MAX_DEFAULT
  if (!max) return null
  return (fcMedia / max) * 100
}

// Zona FC a partir de la intensidad relativa (%). IMPORTANTE: recibe la
// intensidad SIN redondear — redondear antes de clasificar desplaza casos
// justo bajo un umbral a la zona superior (79.96 % debe ser Z3, no Z4).
function zonaFc(intensidadPct) {
  if (intensidadPct == null) return null
  if (intensidadPct < 60) return 'Z1'
  if (intensidadPct < 70) return 'Z2'
  if (intensidadPct < 80) return 'Z3'
  if (intensidadPct < 90) return 'Z4'
  return 'Z5'
}

// FC de umbral por defecto: 90 % de la FC máxima (si el atleta no la tiene
// puesta en atleta_potencia.fc_umbral). El hrTSS se calcula contra el UMBRAL,
// no contra la FC máxima, para estar en la misma escala que el TSS por potencia
// (NP / FTP): una hora a umbral = 100 por pulso y por potencia (2026-11-20;
// antes, contra la FC máx, salía ~81 y la bici "subía" sola al activar el medidor).
const FC_UMBRAL_PCT = 90

// FC de umbral efectiva: la del atleta si es válida; si no, 90 % de la FC máx.
function fcUmbralDe(fcMax, fcUmbral) {
  if (fcUmbral > 0) return fcUmbral
  const max = fcMax || FC_MAX_DEFAULT
  return max ? (max * FC_UMBRAL_PCT) / 100 : null
}

// TSS estimado por FC (hrTSS): horas × IF² × 100, con IF = FC media / FC umbral.
// Fuente ÚNICA de verdad del TSS: dashboard y vista de atleta deben llamar
// aquí con los MISMOS argumentos crudos (segundos de movimiento y FC media sin
// redondear) para devolver exactamente el mismo valor. Devuelve null si falta
// FC o duración; el llamante redondea para mostrar.
function tssEstimado(movingTimeSec, fcMedia, fcMax, fcUmbral = null) {
  if (!fcMedia || !movingTimeSec) return null
  const umbral = fcUmbralDe(fcMax, fcUmbral)
  if (!umbral) return null
  const horas = movingTimeSec / 3600
  return horas * (fcMedia / umbral) ** 2 * 100
}

// TSS/hora aproximado por disciplina cuando NO hay FC (B2). Valores orientativos
// de una sesión típica de resistencia; ajustables. 'other' no entrena → sin carga.
const TSS_POR_HORA_SIN_FC = { swim: 55, bike: 50, run: 65, strength: 40 }

// Carga (TSS) de una actividad con su procedencia:
//  - con FC        → hrTSS (estimado:false)
//  - sin FC + disciplina de entrenamiento → duración × TSS/hora (estimado:true)
//  - 'other' o sin datos → { tss:null }
// El llamante redondea. `estimado` permite marcarlo en el UI.
// TSS por POTENCIA (bici con medidor): horas × IF² × 100, con IF = NP / FTP.
// Solo si la actividad trae potencia real de un medidor (`device_watts`, no la
// estimada de Strava), potencia normalizada y el atleta tiene FTP.
function tssPotencia(movingTimeSec, potNormalizada, ftp) {
  if (!movingTimeSec || !(potNormalizada > 0) || !(ftp > 0)) return null
  const IF = potNormalizada / ftp
  return (movingTimeSec / 3600) * IF * IF * 100
}

// potencia = { np, ftp, medidor } (opcional): solo aplica a la bici.
// fcUmbral (opcional): la del atleta; sin ella, 90 % de fcMax.
function cargaActividad(movingTimeSec, fcMedia, fcMax, disciplina, potencia, fcUmbral = null) {
  if (disciplina === 'other') return { tss: null, estimado: false }
  if (disciplina === 'bike' && potencia && potencia.medidor) {
    const pw = tssPotencia(movingTimeSec, potencia.np, potencia.ftp)
    if (pw != null) return { tss: pw, estimado: false, fuente: 'potencia' }
  }
  const hr = tssEstimado(movingTimeSec, fcMedia, fcMax, fcUmbral)
  if (hr != null) return { tss: hr, estimado: false }
  const factor = TSS_POR_HORA_SIN_FC[disciplina]
  if (factor && movingTimeSec) return { tss: (movingTimeSec / 3600) * factor, estimado: true }
  return { tss: null, estimado: false }
}

// Datos de potencia de una actividad de Strava para cargaActividad (ftp del atleta).
function potenciaDe(act, ftp) {
  return { np: act.weighted_average_watts, ftp, medidor: !!act.device_watts }
}

module.exports = {
  round, mapDisciplina, intensidadPct, zonaFc, tssEstimado, tssPotencia, potenciaDe, cargaActividad,
  fechaMadrid, TSS_POR_HORA_SIN_FC, FC_MAX_DEFAULT, FC_UMBRAL_PCT, fcUmbralDe,
}
