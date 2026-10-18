// disponibilidad.js — lógica PURA de la disponibilidad del atleta (sin React ni
// Supabase). El atleta marca TRAMOS HORARIOS por día de la semana y disciplina
// ("nado de 7:00 a 8:00, bici de 18:00 a 20:00"); aquí se casan con una fecha y
// una disciplina para decidir cuándo avisar al coach. Fechas YYYY-MM-DD en
// Europe/Madrid, semana que empieza en lunes. Las horas son minutos desde las
// 00:00 (7:30 = 450) y el calendario trabaja en tramos de 30 minutos.
//
// Modelo (tablas atleta_disponibilidad_semana / atleta_disponibilidad_fecha):
//  - plantilla: [{ dia_semana 1-7 (1 = lunes), disciplina, inicio_min, fin_min }]
//  - excepciones: [{ fecha, tipo 'no_disponible' | 'limitada', disciplina, inicio_min, fin_min, nota }]
//      sustituyen a la plantilla de ESA fecha entera.
//  - Si el atleta no ha configurado nada, no hay avisos ('sin_datos').
import { diaSemanaISO, sumarDias } from './chartUtils'

export const DISCIPLINAS_DISPONIBILIDAD = ['swim', 'bike', 'run', 'strength']
export const MIN_POR_SLOT = 30
export const SLOTS_POR_DIA = 48

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const lista = (x) => (Array.isArray(x) ? x : [])
const esFila = (f) => f !== null && typeof f === 'object'
const esDisciplina = (d) => DISCIPLINAS_DISPONIBILIDAD.includes(d)
const esMin = (v) => Number.isInteger(v) && v >= 0 && v <= 1440
const esTramo = (f) => esFila(f) && esMin(f.inicio_min) && esMin(f.fin_min) && f.fin_min > f.inicio_min

// "7:30", "18:00"
export function formatHora(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}:${String(m).padStart(2, '0')}`
}
// Tramo completo "7:00–8:00" y versión compacta "7–8" / "7:30–9"
export const formatTramo = (t) => `${formatHora(t.inicio_min)}–${formatHora(t.fin_min)}`
const corto = (min) => (min % 60 === 0 ? String(min / 60) : formatHora(min))
export const formatTramoCorto = (t) => `${corto(t.inicio_min)}–${corto(t.fin_min)}`

// Une tramos que se tocan o se solapan y los ordena.
function fusionar(tramos) {
  const orden = tramos.map((t) => ({ inicio_min: t.inicio_min, fin_min: t.fin_min })).sort((a, b) => a.inicio_min - b.inicio_min)
  const res = []
  for (const t of orden) {
    const ult = res[res.length - 1]
    if (ult && t.inicio_min <= ult.fin_min) ult.fin_min = Math.max(ult.fin_min, t.fin_min)
    else res.push({ ...t })
  }
  return res
}

function aMapa(filas) {
  const porDisc = {}
  for (const f of filas) (porDisc[f.disciplina] ||= []).push(f)
  const mapa = {}
  for (const [d, ts] of Object.entries(porDisc)) mapa[d] = fusionar(ts)
  return mapa
}

// Disponibilidad de UN día:
//   { origen: 'sin_datos' | 'plantilla' | 'excepcion' | 'dia_libre',
//     disciplinas: { swim?: [{inicio_min, fin_min}], … }, nota? }
// Una clave presente = ese día hay al menos un tramo para esa disciplina.
export function disponibilidadDelDia(datos, fecha) {
  if (typeof fecha !== 'string' || !FECHA_RE.test(fecha)) return { origen: 'sin_datos', disciplinas: {} }

  const plantilla = lista(datos?.plantilla).filter((f) => esTramo(f) && esDisciplina(f.disciplina))
  const delDia = lista(datos?.excepciones).filter((e) => esFila(e) && e.fecha === fecha)

  const libre = delDia.find((e) => e.tipo === 'no_disponible')
  if (libre) return { origen: 'dia_libre', disciplinas: {}, ...(libre.nota ? { nota: libre.nota } : {}) }

  const limitadas = delDia.filter((e) => e.tipo === 'limitada' && esDisciplina(e.disciplina) && esTramo(e))
  if (limitadas.length > 0) {
    const nota = limitadas.find((e) => e.nota)?.nota
    return { origen: 'excepcion', disciplinas: aMapa(limitadas), ...(nota ? { nota } : {}) }
  }

  if (plantilla.length === 0) return { origen: 'sin_datos', disciplinas: {} }

  const dia = diaSemanaISO(fecha)
  return { origen: 'plantilla', disciplinas: aMapa(plantilla.filter((p) => p.dia_semana === dia)) }
}

// ¿Encaja una sesión (fecha + disciplina + duración opcional)?
//   { nivel: 'ok' | 'aviso' | 'sin_datos',
//     motivo: null | 'dia_libre' | 'disciplina_no_disponible' | 'excede_minutos',
//     limite: number | null, nota? }
// `limite` = minutos del tramo más largo de esa disciplina ese día. Duración
// null/undefined (sesiones por distancia) → solo se comprueba la disciplina.
export function evaluarDisponibilidad(datos, fecha, disciplina, duracionMin) {
  const dia = disponibilidadDelDia(datos, fecha)
  const nota = dia.nota ? { nota: dia.nota } : {}

  if (dia.origen === 'sin_datos' || !esDisciplina(disciplina)) {
    return { nivel: 'sin_datos', motivo: null, limite: null }
  }
  if (dia.origen === 'dia_libre') return { nivel: 'aviso', motivo: 'dia_libre', limite: null, ...nota }

  const tramos = dia.disciplinas[disciplina]
  if (!tramos) return { nivel: 'aviso', motivo: 'disciplina_no_disponible', limite: null, ...nota }

  const limite = Math.max(...tramos.map((t) => t.fin_min - t.inicio_min))
  if (typeof duracionMin === 'number' && Number.isFinite(duracionMin) && duracionMin > limite) {
    return { nivel: 'aviso', motivo: 'excede_minutos', limite, ...nota }
  }
  return { nivel: 'ok', motivo: null, limite, ...nota }
}

// Los 7 días de la semana que empieza en `lunes`: [{ fecha, origen, disciplinas, nota? }]
export function resumenSemana(datos, lunes) {
  if (typeof lunes !== 'string' || !FECHA_RE.test(lunes)) return []
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = sumarDias(lunes, i)
    return { fecha, ...disponibilidadDelDia(datos, fecha) }
  })
}

// ── Calendario del atleta (editor) ──────────────────────────────────────────
// Estado = Set de claves 'dia|slot|disciplina' (slot 0..47, de 30 min). Varias
// disciplinas pueden compartir franja ("a esa hora puedo correr o ir en bici").
const claveSlot = (dia, slot, disciplina) => `${dia}|${slot}|${disciplina}`
export { claveSlot }

export function ventanasASlots(filas) {
  const set = new Set()
  for (const f of lista(filas)) {
    if (!esTramo(f) || !esDisciplina(f.disciplina)) continue
    if (!Number.isInteger(f.dia_semana) || f.dia_semana < 1 || f.dia_semana > 7) continue
    for (let s = Math.floor(f.inicio_min / MIN_POR_SLOT); s < Math.ceil(f.fin_min / MIN_POR_SLOT); s += 1) {
      set.add(claveSlot(f.dia_semana, s, f.disciplina))
    }
  }
  return set
}

// Tramos contiguos por (día, disciplina), ordenados.
export function slotsAVentanas(set) {
  const porClave = {}
  for (const k of set || []) {
    const [dia, slot, disciplina] = k.split('|')
    ;(porClave[`${dia}|${disciplina}`] ||= []).push(Number(slot))
  }
  const filas = []
  for (const [k, slots] of Object.entries(porClave)) {
    const [dia, disciplina] = k.split('|')
    slots.sort((a, b) => a - b)
    let ini = slots[0]
    let prev = slots[0]
    for (const s of [...slots.slice(1), null]) {
      if (s === prev + 1) { prev = s; continue }
      filas.push({ dia_semana: Number(dia), disciplina, inicio_min: ini * MIN_POR_SLOT, fin_min: (prev + 1) * MIN_POR_SLOT })
      ini = s
      prev = s
    }
  }
  return filas.sort((a, b) => a.dia_semana - b.dia_semana || a.inicio_min - b.inicio_min || (a.disciplina < b.disciplina ? -1 : 1))
}

// Pinta (o borra) el rango [a, b] de franjas de un día. disciplina null + borrar
// = limpia todas las disciplinas del rango. No modifica el Set original.
export function pintarRango(set, dia, a, b, disciplina, borrar = false) {
  const res = new Set(set || [])
  const desde = Math.max(0, Math.min(a, b))
  const hasta = Math.min(SLOTS_POR_DIA - 1, Math.max(a, b))
  for (let s = desde; s <= hasta; s += 1) {
    if (borrar && !disciplina) for (const d of DISCIPLINAS_DISPONIBILIDAD) res.delete(claveSlot(dia, s, d))
    else if (borrar) res.delete(claveSlot(dia, s, disciplina))
    else if (esDisciplina(disciplina)) res.add(claveSlot(dia, s, disciplina))
  }
  return res
}

// ¿Lo editado es igual a lo guardado?
export function mismaPlantilla(filasGuardadas, set) {
  const norm = (filas) => filas.map((f) => `${f.dia_semana}|${f.disciplina}|${f.inicio_min}|${f.fin_min}`).join(',')
  return norm(slotsAVentanas(ventanasASlots(filasGuardadas))) === norm(slotsAVentanas(set))
}

// Filas a insertar para una excepción de una fecha.
//   'no_disponible' → 1 fila sin disciplina; 'limitada' → 1 fila por tramo válido.
export function filasExcepcion({ fecha, tipo, tramos, nota }) {
  if (typeof fecha !== 'string' || !FECHA_RE.test(fecha)) return []
  const notaLimpia = typeof nota === 'string' && nota.trim() ? nota.trim().slice(0, 200) : null
  if (tipo === 'no_disponible') {
    return [{ fecha, tipo, disciplina: null, inicio_min: null, fin_min: null, nota: notaLimpia }]
  }
  if (tipo !== 'limitada') return []
  return lista(tramos)
    .filter((t) => esTramo(t) && esDisciplina(t.disciplina))
    .map((t) => ({ fecha, tipo, disciplina: t.disciplina, inicio_min: t.inicio_min, fin_min: t.fin_min, nota: notaLimpia }))
}

// ── Presentación para el coach ──────────────────────────────────────────────

// Minutos prescritos en una lista de sesiones. Las sesiones por distancia no
// traen duración (duracion_min null): se cuentan aparte, no se estiman.
export function minutosPlanificados(sesiones) {
  let minutos = 0
  let sinDuracion = 0
  for (const s of lista(sesiones)) {
    if (!esFila(s)) continue
    if (typeof s.duracion_min === 'number' && Number.isFinite(s.duracion_min) && s.duracion_min > 0) minutos += s.duracion_min
    else sinDuracion += 1
  }
  return { minutos, sinDuracion }
}

const NOMBRES = { swim: 'natación', bike: 'ciclismo', run: 'carrera', strength: 'fuerza' }

// Frase del aviso informativo para el coach, o null si no hay nada que decir.
export function textoAviso(evaluacion, disciplina) {
  if (!evaluacion || evaluacion.nivel !== 'aviso') return null
  const nota = evaluacion.nota ? ` («${evaluacion.nota}»)` : ''
  const nombre = NOMBRES[disciplina] || 'esta disciplina'
  if (evaluacion.motivo === 'dia_libre') return `El atleta marcó este día como no disponible${nota}.`
  if (evaluacion.motivo === 'disciplina_no_disponible') return `El atleta no indicó horas para ${nombre} este día${nota}.`
  if (evaluacion.motivo === 'excede_minutos') return `Supera el tramo más largo que el atleta tiene libre para ${nombre} este día (${evaluacion.limite} min)${nota}.`
  return null
}
