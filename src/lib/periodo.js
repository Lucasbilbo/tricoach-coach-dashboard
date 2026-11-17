// periodo.js — periodo que se muestra en Análisis (puro, sin React; con tests).
//
// Tres formas, todas en fechas YYYY-MM-DD de Europe/Madrid:
//  - { tipo: 'semanas', semanas: 8 }       preset: las últimas N semanas hasta hoy
//  - { tipo: 'semana',  desde, hasta }     una semana lunes→domingo (la actual
//                                          se corta en hoy)
//  - { tipo: 'rango',   desde, hasta }     rango libre entre dos fechas
//
// El backend solo guarda 52 semanas atrás (WEEKS_MAX de coach-athlete-data), así
// que ninguna fecha puede ser anterior a `limiteMinimo(hoy)` ni posterior a hoy.
import { hoyMadrid, sumarDias, lunesDeSemana, formatDiaMes } from './chartUtils'

export const SEMANAS_PRESET = [4, 8, 12, 24]
export const SEMANAS_BASE = 8 // datos de Sesiones y valor por defecto
export const SEMANAS_MAX = 52 // tope del backend
export const SEMANAS_CARGA = 26 // calentamiento de ATL/CTL
export const DIAS_VISTA_DIARIA = 14 // hasta estos días el volumen se ve por día

export const periodoSemanas = (semanas) => ({ tipo: 'semanas', semanas })
export const periodoInicial = () => periodoSemanas(SEMANAS_BASE)

export function esPreset(periodo) {
  return periodo?.tipo === 'semanas'
}

// Días entre dos fechas YYYY-MM-DD (b − a)
export function diasEntre(a, b) {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

// Primera fecha que el backend puede servir
export function limiteMinimo(hoy = hoyMadrid()) {
  return sumarDias(hoy, -SEMANAS_MAX * 7)
}

function fechaValida(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)) return false
  const [y, m, d] = f.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

// Ajusta un rango a lo que se puede mostrar: ordena, recorta a [límite, hoy].
// null si no queda nada (fechas incompletas o fuera de ventana).
export function normalizarRango(desde, hasta, hoy = hoyMadrid()) {
  if (!fechaValida(desde) || !fechaValida(hasta)) return null
  let d = desde
  let h = hasta
  if (d > h) [d, h] = [h, d]
  if (h > hoy) h = hoy
  const min = limiteMinimo(hoy)
  if (d < min) d = min
  if (d > h) return null
  return { desde: d, hasta: h }
}

export function periodoRango(desde, hasta, hoy = hoyMadrid()) {
  const r = normalizarRango(desde, hasta, hoy)
  return r ? { tipo: 'rango', ...r } : null
}

// Semana lunes→domingo que contiene `fecha`; la semana en curso acaba hoy.
export function periodoSemana(fecha, hoy = hoyMadrid()) {
  const lunes = lunesDeSemana(fecha)
  const r = normalizarRango(lunes, sumarDias(lunes, 6), hoy)
  return r ? { tipo: 'semana', ...r } : null
}

// Semana anterior a la actual (por defecto al pulsar "Semana": siempre completa).
export function periodoSemanaPasada(hoy = hoyMadrid()) {
  return periodoSemana(sumarDias(lunesDeSemana(hoy), -7), hoy)
}

// Rango por defecto al pulsar "Rango": los últimos 28 días.
export function periodoRangoPorDefecto(hoy = hoyMadrid()) {
  return periodoRango(sumarDias(hoy, -27), hoy, hoy)
}

// Semana anterior (delta −1) o siguiente (+1) a la mostrada; null si cae fuera
// de la ventana (futuro, o más allá de 52 semanas).
export function moverSemana(periodo, delta, hoy = hoyMadrid()) {
  if (periodo?.tipo !== 'semana') return null
  const lunes = sumarDias(lunesDeSemana(periodo.desde), 7 * delta)
  if (lunes > hoy) return null
  if (sumarDias(lunes, 6) < limiteMinimo(hoy)) return null
  return periodoSemana(lunes, hoy)
}

// { desde, hasta } que cubre el periodo
export function rangoDe(periodo, hoy = hoyMadrid()) {
  if (esPreset(periodo)) return { desde: sumarDias(hoy, -periodo.semanas * 7), hasta: hoy }
  return { desde: periodo.desde, hasta: periodo.hasta }
}

// ¿Acaba hoy? (solo entonces tiene sentido la proyección con lo planificado)
export function terminaHoy(periodo, hoy = hoyMadrid()) {
  return rangoDe(periodo, hoy).hasta === hoy
}

// Rango corto: el volumen se dibuja por día (una barra semanal no dice nada)
export function esVistaDiaria(periodo, hoy = hoyMadrid()) {
  if (esPreset(periodo)) return false
  const { desde, hasta } = rangoDe(periodo, hoy)
  return diasEntre(desde, hasta) + 1 <= DIAS_VISTA_DIARIA
}

// Semanas de actividades que hay que traer para calentar ATL/CTL a fecha `hasta`
// del periodo: 26 semanas de calentamiento antes del inicio, con el tope del backend.
export function semanasCarga(periodo, hoy = hoyMadrid()) {
  if (esPreset(periodo)) return SEMANAS_CARGA
  const atras = Math.ceil(diasEntre(periodo.desde, hoy) / 7)
  return Math.min(SEMANAS_MAX, atras + SEMANAS_CARGA)
}

function conAnio(fecha, hoy) {
  const anio = fecha.slice(0, 4)
  return anio === hoy.slice(0, 4) ? formatDiaMes(fecha) : `${formatDiaMes(fecha)} ${anio}`
}

// "últimas 8 semanas" · "12 Oct – 18 Oct" · "14 Oct" (rango de un día)
export function etiquetaPeriodo(periodo, hoy = hoyMadrid()) {
  if (esPreset(periodo)) return `últimas ${periodo.semanas} semanas`
  const { desde, hasta } = periodo
  return desde === hasta ? conAnio(desde, hoy) : `${conAnio(desde, hoy)} – ${conAnio(hasta, hoy)}`
}

// Trozo para el nombre del CSV: "8sem" · "2026-10-12_2026-10-18"
export function claveArchivo(periodo) {
  return esPreset(periodo) ? `${periodo.semanas}sem` : `${periodo.desde}_${periodo.hasta}`
}
