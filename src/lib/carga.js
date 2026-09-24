// carga.js — modelo de carga de entrenamiento (ATL/CTL/TSB) por medias móviles
// EXPONENCIALES (EWMA), constantes de tiempo 7 (ATL) y 42 (CTL), como el modelo
// clásico de TrainingPeaks. Fuente ÚNICA compartida por TSSChart y athleteStats
// (antes había dos implementaciones divergentes con media aritmética a 28 días).
//
// La serie se calcula día a día desde la primera actividad hasta `hasta`
// (normalmente hoy en Europe/Madrid): los días sin TSS cuentan 0, así que la
// carga DECAE hasta hoy aunque no haya actividad reciente ("anclado a hoy").
import { sumarDias } from './chartUtils'

const N_ATL = 7
const N_CTL = 42

// TSS por día (YYYY-MM-DD → suma)
function tssPorDia(actividades) {
  return (actividades || []).reduce((acc, a) => {
    if (!a.fecha || a.tss_estimado == null) return acc
    acc[a.fecha] = (acc[a.fecha] || 0) + a.tss_estimado
    return acc
  }, {})
}

// Serie diaria [{ fecha, atl, ctl }] por EWMA hasta `hasta` (YYYY-MM-DD).
export function computeCargaDiaria(actividades, hasta) {
  const porDia = tssPorDia(actividades)
  const fechas = Object.keys(porDia).sort()
  if (fechas.length === 0 || !hasta) return []
  const desde = fechas[0]
  if (hasta < desde) return []

  const kAtl = 1 - Math.exp(-1 / N_ATL)
  const kCtl = 1 - Math.exp(-1 / N_CTL)
  const dias = []
  let atl = 0
  let ctl = 0
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const tss = porDia[f] || 0
    atl += kAtl * (tss - atl)
    ctl += kCtl * (tss - ctl)
    dias.push({ fecha: f, atl, ctl })
  }
  return dias
}

// CTL/ATL/TSB a fecha `hasta` (último día de la serie). TSB = CTL − ATL de hoy.
export function computeCargaHoy(actividades, hasta) {
  const dias = computeCargaDiaria(actividades, hasta)
  if (dias.length === 0) return { ctl: null, atl: null, tsb: null }
  const ult = dias[dias.length - 1]
  const ctl = Math.round(ult.ctl)
  const atl = Math.round(ult.atl)
  return { ctl, atl, tsb: ctl - atl }
}
