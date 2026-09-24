// athleteStats.js — cálculos en cliente para la vista de análisis del atleta.
// Deriva las stats del handoff (volumen, ritmo, TSS, CTL/ATL, TSB), la
// distribución de zonas FC, la progresión de ritmo y las columnas de la Línea
// de Transición, a partir de las `actividades`/`semanas` que ya devuelve
// coach-athlete-data. No toca endpoints ni añade datos nuevos.
import { decimalToRitmo, formatHorasMin, formatFechaCorta, lunesDeSemana, hoyMadrid } from './chartUtils'
import { computeCargaHoy } from './carga'
import { DISCIPLINE_COLORS } from './theme'

// Colores de zona FC (frío→caliente): teal → ámbar → coral, como el spec.
const ZONA_COLORS = {
  Z1: '#2FBFAF',
  Z2: '#5FA69C',
  Z3: '#E8934A',
  Z4: '#DE7548',
  Z5: '#E85D5D',
}
const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']
// B1: 'other' (golf, paseos…) queda fuera del volumen y de la Línea de Transición.
const DISCIPLINAS_ORDEN = ['swim', 'bike', 'run', 'strength']

function horasTotales(actividades) {
  return actividades.reduce(
    (acc, a) => acc + (a.disciplina !== 'other' ? (a.duracion_min || 0) / 60 : 0),
    0
  )
}

// Las 5 stats del handoff.
export function computeResumenStats(actividades) {
  const runs = actividades
    .filter((a) => a.disciplina === 'run' && a.ritmo_min_km != null)
    .sort((a, b) => (a.fecha > b.fecha ? -1 : 1))
  const ritmoUltima = runs.length > 0 ? decimalToRitmo(runs[0].ritmo_min_km) : '—'
  const tssAcum = actividades.reduce((acc, a) => acc + (a.tss_estimado || 0), 0)
  // EWMA 7/42 anclado a hoy (Europe/Madrid), no a la última actividad.
  const { ctl, atl, tsb } = computeCargaHoy(actividades, hoyMadrid())
  return {
    volumen: formatHorasMin(horasTotales(actividades)),
    ritmoUltima,
    tssAcum: Math.round(tssAcum),
    ctl: ctl != null ? ctl : '—',
    atl: atl != null ? atl : '—',
    tsb: tsb != null ? (tsb > 0 ? `+${tsb}` : `${tsb}`) : '—',
  }
}

// Distribución de minutos por zona FC (Z1-Z5) con color y pct relativo al máx.
export function computeZonas(actividades) {
  const minutos = actividades.reduce((acc, a) => {
    if (!a.zona_fc || !a.duracion_min || !ZONAS.includes(a.zona_fc)) return acc
    acc[a.zona_fc] = (acc[a.zona_fc] || 0) + a.duracion_min
    return acc
  }, {})
  const max = Math.max(...ZONAS.map((z) => minutos[z] || 0), 0)
  if (max === 0) return []
  return ZONAS.map((z) => {
    const min = Math.round(minutos[z] || 0)
    return {
      label: z,
      minutos: min,
      minutesLabel: `${min}'`,
      pct: Math.round((min / max) * 100),
      color: ZONA_COLORS[z],
    }
  })
}

// Progresión de ritmo running: media de ritmo run por semana, últimas N semanas
// con datos. Altura ∝ mejora (ritmo más rápido = barra más alta), opacity creciente.
export function computePaceTrend(actividades, nSemanas = 6) {
  const porSemana = {}
  for (const a of actividades) {
    if (a.disciplina !== 'run' || a.ritmo_min_km == null || !a.fecha) continue
    const lunes = lunesDeSemana(a.fecha)
    if (!porSemana[lunes]) porSemana[lunes] = { suma: 0, n: 0 }
    porSemana[lunes].suma += a.ritmo_min_km
    porSemana[lunes].n += 1
  }
  const semanas = Object.keys(porSemana)
    .sort()
    .slice(-nSemanas)
    .map((lunes) => ({ lunes, ritmo: porSemana[lunes].suma / porSemana[lunes].n }))
  if (semanas.length === 0) return []

  const ritmos = semanas.map((s) => s.ritmo)
  const min = Math.min(...ritmos)
  const max = Math.max(...ritmos)
  const rango = max - min || 1
  return semanas.map((s, i) => {
    // ritmo más rápido (menor) → altura mayor; suelo 40% para que se vea la barra
    const heightPct = Math.round(40 + ((max - s.ritmo) / rango) * 60)
    const opacity = semanas.length > 1 ? 0.55 + (i / (semanas.length - 1)) * 0.45 : 1
    return {
      label: formatFechaCorta(s.lunes),
      pace: decimalToRitmo(s.ritmo),
      heightPct,
      opacity: Math.round(opacity * 100) / 100,
    }
  })
}

// Columnas de la Línea de Transición: una por semana del rango, altura ∝ horas
// totales, segmentada por disciplina (horas por disciplina desde actividades).
// Todas "completadas" (Strava) — los estados programado/descanso quedan fuera.
export function buildTransitionColumns(actividades, semanas) {
  if (!semanas || semanas.length === 0) return []

  // horas por disciplina por semana (lunes → { disc: horas })
  const horas = {}
  for (const a of actividades) {
    if (!a.fecha || !a.duracion_min) continue
    if (!DISCIPLINAS_ORDEN.includes(a.disciplina)) continue // B1: excluir 'other'
    const lunes = lunesDeSemana(a.fecha)
    if (!horas[lunes]) horas[lunes] = {}
    horas[lunes][a.disciplina] = (horas[lunes][a.disciplina] || 0) + a.duracion_min / 60
  }

  const totalPorSemana = semanas.map((s) => {
    const h = horas[s.semana] || {}
    return DISCIPLINAS_ORDEN.reduce((acc, d) => acc + (h[d] || 0), 0)
  })
  const maxHoras = Math.max(...totalPorSemana, 0.0001)
  const ultima = semanas.length - 1

  return semanas.map((s, i) => {
    const h = horas[s.semana] || {}
    const total = totalPorSemana[i]
    const segments = DISCIPLINAS_ORDEN.filter((d) => (h[d] || 0) > 0).map((d) => ({
      color: DISCIPLINE_COLORS[d],
      pct: total > 0 ? Math.round(((h[d] || 0) / total) * 100) : 0,
    }))
    return {
      label: formatFechaCorta(s.semana),
      isToday: i === ultima,
      statusLabel: total > 0 ? formatHorasMin(total) : '—',
      heightPct: Math.max(Math.round((total / maxHoras) * 100), total > 0 ? 6 : 2),
      borderStyle: 'solid',
      borderWidth: '0px',
      borderColor: 'transparent',
      segments: segments.length > 0 ? segments : [{ color: DISCIPLINE_COLORS.other, pct: 100 }],
    }
  })
}
