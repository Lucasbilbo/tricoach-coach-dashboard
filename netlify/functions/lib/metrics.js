// lib/metrics.js — utilidades de cálculo compartidas por las funciones que
// transforman actividades de Strava (CommonJS). Extraído de copias idénticas
// en coach-athlete-data y coach-activity-detail (round también en dashboard).

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

function zonaFc(intensidadPct) {
  if (intensidadPct == null) return null
  if (intensidadPct < 60) return 'Z1'
  if (intensidadPct < 70) return 'Z2'
  if (intensidadPct < 80) return 'Z3'
  if (intensidadPct < 90) return 'Z4'
  return 'Z5'
}

module.exports = { round, mapDisciplina, zonaFc }
