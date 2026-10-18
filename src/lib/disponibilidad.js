// disponibilidad.js — lógica PURA de la disponibilidad del atleta (sin React ni
// Supabase). Casa la plantilla semanal y las excepciones por fecha con una fecha
// y una disciplina para decidir qué cabe y cuándo avisar. Fechas como cadenas
// YYYY-MM-DD en Europe/Madrid; semana que empieza en lunes.
//
// Modelo (tablas atleta_disponibilidad_semana / atleta_disponibilidad_fecha):
//  - plantilla: [{ dia_semana 1-7 (1 = lunes), disciplina, max_minutos }]
//      una fila = ese día puedo esa disciplina; max_minutos null = SIN LÍMITE;
//      sin fila = no puedo.
//  - excepciones: [{ fecha, tipo 'no_disponible' | 'limitada', disciplina, max_minutos, nota }]
//      sustituyen a la plantilla de ESA fecha entera.
//  - Si el atleta no ha configurado nada, no hay avisos ('sin_datos').
import { diaSemanaISO, sumarDias } from './chartUtils'

export const DISCIPLINAS_DISPONIBILIDAD = ['swim', 'bike', 'run', 'strength']

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

const lista = (x) => (Array.isArray(x) ? x : [])
const esFila = (f) => f !== null && typeof f === 'object'
const esDisciplina = (d) => DISCIPLINAS_DISPONIBILIDAD.includes(d)
// max_minutos: número válido, o null (= sin límite). Cualquier otra cosa se trata como sin límite.
const limiteDe = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function aMapa(filas) {
  const mapa = {}
  for (const f of filas) mapa[f.disciplina] = limiteDe(f.max_minutos)
  return mapa
}

// Disponibilidad de UN día:
//   { origen: 'sin_datos' | 'plantilla' | 'excepcion' | 'dia_libre',
//     disciplinas: { swim?: n|null, bike?: …, run?: …, strength?: … }, nota? }
// Una clave presente = esa disciplina cabe; valor null = sin límite; número = máximo en minutos.
export function disponibilidadDelDia(datos, fecha) {
  if (typeof fecha !== 'string' || !FECHA_RE.test(fecha)) return { origen: 'sin_datos', disciplinas: {} }

  const plantilla = lista(datos?.plantilla).filter(esFila)
  const delDia = lista(datos?.excepciones).filter((e) => esFila(e) && e.fecha === fecha)

  // a) día libre
  const libre = delDia.find((e) => e.tipo === 'no_disponible')
  if (libre) return { origen: 'dia_libre', disciplinas: {}, ...(libre.nota ? { nota: libre.nota } : {}) }

  // b) excepción limitada: sustituye a la plantilla de ese día
  const limitadas = delDia.filter((e) => e.tipo === 'limitada' && esDisciplina(e.disciplina))
  if (limitadas.length > 0) {
    const nota = limitadas.find((e) => e.nota)?.nota
    return { origen: 'excepcion', disciplinas: aMapa(limitadas), ...(nota ? { nota } : {}) }
  }

  // e) sin plantilla y sin excepción aplicable: no hay datos
  if (plantilla.length === 0) return { origen: 'sin_datos', disciplinas: {} }

  // c) y d) plantilla configurada: lo que marcó para ese día de la semana
  // (si no marcó nada ese día, disciplinas queda vacío: día sin nada disponible)
  const dia = diaSemanaISO(fecha)
  const filasDelDia = plantilla.filter((p) => p.dia_semana === dia && esDisciplina(p.disciplina))
  return { origen: 'plantilla', disciplinas: aMapa(filasDelDia) }
}

// Evalúa si una sesión (fecha + disciplina + duración opcional) encaja.
//   { nivel: 'ok' | 'aviso' | 'sin_datos',
//     motivo: null | 'dia_libre' | 'disciplina_no_disponible' | 'excede_minutos',
//     limite: number | null, nota? }
// duracionMin null/undefined (sesiones por distancia) → solo se comprueba la disciplina.
export function evaluarDisponibilidad(datos, fecha, disciplina, duracionMin) {
  const dia = disponibilidadDelDia(datos, fecha)
  const nota = dia.nota ? { nota: dia.nota } : {}

  if (dia.origen === 'sin_datos' || !esDisciplina(disciplina)) {
    return { nivel: 'sin_datos', motivo: null, limite: null }
  }
  if (dia.origen === 'dia_libre') return { nivel: 'aviso', motivo: 'dia_libre', limite: null, ...nota }

  if (!Object.prototype.hasOwnProperty.call(dia.disciplinas, disciplina)) {
    return { nivel: 'aviso', motivo: 'disciplina_no_disponible', limite: null, ...nota }
  }
  const limite = dia.disciplinas[disciplina]
  if (limite === null) return { nivel: 'ok', motivo: null, limite: null, ...nota }
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

// ── Edición (lote B) ────────────────────────────────────────────────────────
// Estado del editor de la plantilla: { '<dia>-<disciplina>': { max: number|null } }.
// Clave presente = esa disciplina cabe ese día; max null = sin límite.
export const claveCelda = (dia, disciplina) => `${dia}-${disciplina}`

export function plantillaAEstado(filas) {
  const estado = {}
  for (const f of lista(filas)) {
    if (!esFila(f) || !esDisciplina(f.disciplina)) continue
    if (!Number.isInteger(f.dia_semana) || f.dia_semana < 1 || f.dia_semana > 7) continue
    estado[claveCelda(f.dia_semana, f.disciplina)] = { max: limiteDe(f.max_minutos) }
  }
  return estado
}

// Qué hay que escribir para pasar de lo guardado a lo editado: solo celdas nuevas
// o cambiadas (upsert) y las quitadas (borrar). Sin cambios → listas vacías.
export function cambiosPlantilla(filasGuardadas, estadoEditado) {
  const guardado = plantillaAEstado(filasGuardadas)
  const editado = estadoEditado && typeof estadoEditado === 'object' ? estadoEditado : {}
  const upsert = []
  const borrar = []
  for (const dia of [1, 2, 3, 4, 5, 6, 7]) {
    for (const disciplina of DISCIPLINAS_DISPONIBILIDAD) {
      const k = claveCelda(dia, disciplina)
      const antes = guardado[k]
      const ahora = editado[k]
      if (ahora) {
        const max = limiteDe(ahora.max)
        if (!antes || antes.max !== max) upsert.push({ dia_semana: dia, disciplina, max_minutos: max })
      } else if (antes) {
        borrar.push({ dia_semana: dia, disciplina })
      }
    }
  }
  return { upsert, borrar }
}

// Filas a insertar para una excepción de una fecha.
//   tipo 'no_disponible' → 1 fila sin disciplina; 'limitada' → 1 fila por disciplina marcada.
//   disciplinas: { run: 60, bike: null } (null = sin límite). Devuelve [] si no es válida.
export function filasExcepcion({ fecha, tipo, disciplinas, nota }) {
  if (typeof fecha !== 'string' || !FECHA_RE.test(fecha)) return []
  const notaLimpia = typeof nota === 'string' && nota.trim() ? nota.trim().slice(0, 200) : null
  if (tipo === 'no_disponible') {
    return [{ fecha, tipo, disciplina: null, max_minutos: null, nota: notaLimpia }]
  }
  if (tipo !== 'limitada') return []
  return DISCIPLINAS_DISPONIBILIDAD
    .filter((d) => disciplinas && Object.prototype.hasOwnProperty.call(disciplinas, d))
    .map((d) => ({ fecha, tipo, disciplina: d, max_minutos: limiteDe(disciplinas[d]), nota: notaLimpia }))
}
