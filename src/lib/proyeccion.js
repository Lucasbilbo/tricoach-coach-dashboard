// proyeccion.js — carga PLANIFICADA y proyección de CTL/ATL/TSB con lo que el
// coach ya tiene prescrito. Lógica pura (para node --test).
//
// 1. Calibración por atleta y disciplina: el TSS previsto teórico (tssPrevisto)
//    se queda corto 1,5–2,5× con datos reales (las zonas que sigue el atleta en
//    el reloj no son las bandas de % FC máx del panel, y cada uno tiene su
//    pulso; medido 2026-10). Factor = mediana de real/previsto de sus sesiones
//    YA HECHAS con hrTSS real (no estimado sin FC), con ≥ MIN_MUESTRAS; si no, 1.
// 2. Proyección: la EWMA de carga.js sigue desde hoy con el TSS previsto de
//    las sesiones pendientes, SOLO hasta la última sesión planificada (más allá
//    no hay plan y la CTL caería sola: sería engañoso).
import { asignarActividades } from './estadoSesion'
import { computeCargaDiaria } from './carga'
import { sumarDias } from './chartUtils'
import { tssPrevisto } from './tssPrevisto'

export const MIN_MUESTRAS = 3
const FACTOR_MIN = 0.5
const FACTOR_MAX = 3

function mediana(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// → { run: { factor, muestras }, ... } solo de disciplinas con muestras suficientes
export function calibrar(sesiones, actividades, hoy) {
  const pasadas = (sesiones || []).filter((s) => s.fecha && s.fecha < hoy)
  const asignadas = asignarActividades(pasadas, actividades)
  const ratios = {}
  for (const s of pasadas) {
    const a = asignadas.get(s.id)
    if (!a || a.tss_estimado == null || a.tss_estimado_sin_fc) continue
    const plan = tssPrevisto(s)
    if (!plan || plan <= 0) continue
    ;(ratios[s.disciplina] ||= []).push(a.tss_estimado / plan)
  }
  const out = {}
  for (const [d, xs] of Object.entries(ratios)) {
    if (xs.length < MIN_MUESTRAS) continue
    out[d] = { factor: Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, mediana(xs))), muestras: xs.length }
  }
  return out
}

// TSS previsto de una sesión ya calibrado (entero) o null
export function tssPlan(sesion, calibracion) {
  const base = tssPrevisto(sesion)
  if (base == null) return null
  return Math.round(base * (calibracion?.[sesion.disciplina]?.factor ?? 1))
}

// Carga de una semana (lunes YYYY-MM-DD): prevista (suma de tssPlan de sus
// sesiones) y real (TSS de TODAS sus actividades, no solo las emparejadas).
// real = null si la semana es futura o las actividades no la cubren entera.
export function cargaSemana({ lunes, sesiones, actividades, calibracion, coberturaDesde, hoy }) {
  const planes = (sesiones || []).map((s) => tssPlan(s, calibracion)).filter((x) => x != null)
  const prevista = planes.length ? planes.reduce((a, b) => a + b, 0) : null
  let real = null
  if (lunes <= hoy && coberturaDesde && coberturaDesde <= lunes) {
    const fin = sumarDias(lunes, 6)
    real = Math.round(
      (actividades || [])
        .filter((a) => a.fecha >= lunes && a.fecha <= fin && a.tss_estimado != null)
        .reduce((acc, a) => acc + a.tss_estimado, 0)
    )
  }
  return { prevista, real }
}

// Sesiones que aún suman carga: futuras, y las de hoy que no tienen actividad.
export function sesionesPendientes(sesiones, actividades, hoy) {
  const deHoy = (sesiones || []).filter((s) => s.fecha === hoy)
  const hechasHoy = asignarActividades(deHoy, actividades)
  return (sesiones || []).filter((s) => s.fecha > hoy || (s.fecha === hoy && !hechasHoy.has(s.id)))
}

// Próxima prueba objetivo: prioridad A, confirmada o inscrito, de hoy en adelante.
export function pruebaObjetivo(eventos, hoy) {
  return (eventos || [])
    .filter((e) => e.prioridad === 'A' && ['confirmada', 'inscrito'].includes(e.estado) && e.fecha && e.fecha >= hoy)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))[0] || null
}

// Serie diaria proyectada desde hoy hasta la última sesión planificada.
// → { dias: [{ fecha, atl, ctl }], hasta, prueba: { evento, ctl, atl, tsb } | null }
//   o null si no hay nada pendiente planificado.
export function proyectar({ actividades, sesiones, eventos, hoy }) {
  const calibracion = calibrar(sesiones, actividades, hoy)
  const pendientes = sesionesPendientes(sesiones, actividades, hoy)
    .map((s) => ({ fecha: s.fecha, tss_estimado: tssPlan(s, calibracion) }))
    .filter((x) => x.tss_estimado != null)
  if (pendientes.length === 0) return null

  const hasta = pendientes.reduce((m, x) => (x.fecha > m ? x.fecha : m), hoy)

  const serie = computeCargaDiaria([...(actividades || []), ...pendientes], hasta)
  const dias = serie.filter((d) => d.fecha >= hoy)

  const evento = pruebaObjetivo(eventos, hoy)
  let prueba = null
  if (evento && evento.fecha <= hasta) {
    // La forma que cuenta es la de la MAÑANA de la prueba: la víspera
    const vispera = serie.filter((d) => d.fecha < evento.fecha).pop()
    if (vispera) {
      const ctl = Math.round(vispera.ctl)
      const atl = Math.round(vispera.atl)
      prueba = { evento, ctl, atl, tsb: ctl - atl }
    }
  }
  const ult = dias[dias.length - 1]
  return {
    dias,
    hasta,
    final: ult ? { ctl: Math.round(ult.ctl), atl: Math.round(ult.atl), tsb: Math.round(ult.ctl) - Math.round(ult.atl) } : null,
    prueba,
    evento,
    calibracion,
  }
}
