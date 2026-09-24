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

// TSS estimado por FC (hrTSS): horas × IF² × 100, con IF = intensidad/100.
// Fuente ÚNICA de verdad del TSS: dashboard y vista de atleta deben llamar
// aquí con los MISMOS argumentos crudos (segundos de movimiento y FC media sin
// redondear) para devolver exactamente el mismo valor. Devuelve null si falta
// FC o duración; el llamante redondea para mostrar.
function tssEstimado(movingTimeSec, fcMedia, fcMax) {
  const intensidad = intensidadPct(fcMedia, fcMax)
  if (intensidad == null || !movingTimeSec) return null
  const horas = movingTimeSec / 3600
  return horas * (intensidad / 100) ** 2 * 100
}

module.exports = { round, mapDisciplina, intensidadPct, zonaFc, tssEstimado, fechaMadrid, FC_MAX_DEFAULT }
