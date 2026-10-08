// lib/semanas.js — agrupación semanal (lunes→domingo, Europe/Madrid) de las
// actividades ya transformadas (CommonJS). Extraído de coach-athlete-data.
//
// Devuelve TODAS las semanas del rango [desde, hasta], también las vacías (a
// cero): antes solo salían las semanas con actividad, así que una lesión o
// unas vacaciones desaparecían del gráfico de carga y de la Línea de
// Transición y el eje se comprimía (parecía que el atleta no había parado).
const { round } = require('./metrics')

// Lunes (YYYY-MM-DD) de la semana de una fecha local YYYY-MM-DD
function lunesDeSemana(fechaLocal) {
  const [y, m, d] = fechaLocal.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() // 0=domingo
  const offset = dow === 0 ? 6 : dow - 1
  return new Date(date.getTime() - offset * 86400000).toISOString().slice(0, 10)
}

function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + dias * 86400000).toISOString().slice(0, 10)
}

function semanaVacia(lunes) {
  return { semana: lunes, km_run: 0, km_bike: 0, km_swim: 0, horas_totales: 0, tss_total: 0, n_sesiones: 0 }
}

// actividades: [{ fecha, disciplina, distancia_km, duracion_min, tss_estimado }]
// opciones: { desde, hasta } (YYYY-MM-DD, opcionales). Sin ellas, el rango va
// de la primera a la última semana con actividad (y rellena los huecos).
function agruparSemanas(actividades, { desde, hasta } = {}) {
  const porLunes = {}
  for (const act of actividades || []) {
    if (!act || !act.fecha) continue
    // B1: 'other' (golf, paseos) no cuenta en el volumen.
    if (act.disciplina === 'other') continue
    const lunes = lunesDeSemana(act.fecha)
    const s = porLunes[lunes] || (porLunes[lunes] = semanaVacia(lunes))
    s.km_run += act.disciplina === 'run' ? act.distancia_km || 0 : 0
    s.km_bike += act.disciplina === 'bike' ? act.distancia_km || 0 : 0
    s.km_swim += act.disciplina === 'swim' ? act.distancia_km || 0 : 0
    s.horas_totales += (act.duracion_min || 0) / 60
    s.tss_total += act.tss_estimado || 0
    s.n_sesiones += 1
  }

  const conDatos = Object.keys(porLunes).sort()
  const inicio = desde ? lunesDeSemana(desde) : conDatos[0]
  const fin = hasta ? lunesDeSemana(hasta) : conDatos[conDatos.length - 1]
  if (!inicio || !fin || inicio > fin) return []

  const semanas = []
  for (let lunes = inicio; lunes <= fin; lunes = sumarDias(lunes, 7)) {
    const s = porLunes[lunes] || semanaVacia(lunes)
    semanas.push({
      ...s,
      km_run: round(s.km_run, 1),
      km_bike: round(s.km_bike, 1),
      km_swim: round(s.km_swim, 2),
      horas_totales: round(s.horas_totales, 1),
      tss_total: round(s.tss_total, 0),
    })
  }
  return semanas
}

module.exports = { agruparSemanas, lunesDeSemana }
