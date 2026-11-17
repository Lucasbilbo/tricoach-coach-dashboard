// lib/rango.js — rango de fechas opcional de coach-athlete-data (CommonJS, puro).
// POST { desde, hasta } (YYYY-MM-DD, Europe/Madrid) sustituye a `weeks`: las
// actividades, las semanas y las mejores marcas salen SOLO de ese tramo.
// Se valida aquí (no en la función) para probarlo sin red.

const FECHA = /^\d{4}-\d{2}-\d{2}$/

function fechaValida(f) {
  if (typeof f !== 'string' || !FECHA.test(f)) return false
  const [y, m, d] = f.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + dias * 86400000).toISOString().slice(0, 10)
}

// Devuelve:
//  { ok: true, rango: null }                       → sin rango (se usa `weeks`)
//  { ok: true, rango: { desde, hasta } }           → rango válido
//  { ok: false, error }                            → petición mal formada
// `hoy` = YYYY-MM-DD de Madrid; `semanasMax` = tope de historia que se sirve.
function leerRango(desde, hasta, hoy, semanasMax) {
  if (desde == null && hasta == null) return { ok: true, rango: null }
  if (!fechaValida(desde) || !fechaValida(hasta)) {
    return { ok: false, error: 'desde y hasta deben ser fechas YYYY-MM-DD' }
  }
  if (desde > hasta) return { ok: false, error: 'desde no puede ser posterior a hasta' }
  if (hasta > hoy) return { ok: false, error: 'hasta no puede estar en el futuro' }
  if (desde < sumarDias(hoy, -semanasMax * 7)) {
    return { ok: false, error: `Solo hay ${semanasMax} semanas de historial` }
  }
  return { ok: true, rango: { desde, hasta } }
}

// Instante (unix, s) desde el que pedir a Strava para cubrir `desde`: un día de
// margen, porque la fecha de la actividad se calcula en Madrid y el instante en UTC.
function afterUnixDesde(desde) {
  const [y, m, d] = desde.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / 1000) - 86400
}

module.exports = { leerRango, afterUnixDesde, sumarDias }
