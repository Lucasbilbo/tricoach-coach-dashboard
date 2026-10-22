// agenda.js — lógica PURA de la agenda semanal con horas (coach y atleta).
// Colocar sesiones a su hora, calcular la ventana visible y las horas a las que
// se puede mover una sesión. Las reglas de mover viven en el módulo compartido
// con la función move-session (mismo criterio en cliente y servidor).
import { disponibilidadDelDia, DISCIPLINAS_DISPONIBILIDAD } from './disponibilidad'

export { ahoraMadrid, validarMovimiento, esMovible, ajustar, horaValida } from '../../netlify/functions/lib/mover-reglas.cjs'

// Alto que se dibuja para una sesión sin duración (por distancia): una hora.
export const DURACION_POR_DEFECTO = 60
const POR_DEFECTO = [360, 1320] // 6:00–22:00 si no hay nada

const lista = (x) => (Array.isArray(x) ? x : [])
const conHora = (s) => Number.isInteger(s?.hora_inicio_min)
const durDe = (s) => (Number.isFinite(s?.duracion_min) && s.duracion_min > 0 ? s.duracion_min : null)

// Ventana horaria a dibujar: los tramos del atleta Y las sesiones con hora,
// redondeada a la hora con media hora de aire y mínimo 7 h. Sin nada, 6–22.
export function ventanaAgenda(dias, sesiones) {
  let min = Infinity
  let max = -Infinity
  for (const d of lista(dias)) {
    for (const tramos of Object.values(d?.disciplinas || {})) {
      for (const t of tramos) {
        min = Math.min(min, t.inicio_min)
        max = Math.max(max, t.fin_min)
      }
    }
  }
  for (const s of lista(sesiones)) {
    if (!conHora(s)) continue
    min = Math.min(min, s.hora_inicio_min)
    max = Math.max(max, s.hora_inicio_min + (durDe(s) ?? DURACION_POR_DEFECTO))
  }
  if (!Number.isFinite(min)) return [...POR_DEFECTO]
  min = Math.max(0, Math.floor(min / 60) * 60 - 30)
  max = Math.min(1440, Math.ceil(max / 60) * 60 + 30)
  if (max - min < 420) {
    max = Math.min(1440, min + 420)
    min = Math.max(0, max - 420)
  }
  return [min, max]
}

// Sesiones de UN día con hora → bloques con columna para las que se solapan:
//   [{ sesion, inicio, fin, sinDuracion, col, cols }]
// Las que se pisan se reparten a lo ancho (col / cols) dentro de su grupo.
export function colocarDia(sesiones) {
  const bloques = lista(sesiones)
    .filter(conHora)
    .map((s) => {
      const d = durDe(s)
      return { sesion: s, inicio: s.hora_inicio_min, fin: s.hora_inicio_min + (d ?? DURACION_POR_DEFECTO), sinDuracion: d == null }
    })
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin)

  const res = []
  let grupo = []
  let finGrupo = -1
  const cerrar = () => {
    const finCol = [] // fin del último bloque de cada columna
    for (const b of grupo) {
      let c = finCol.findIndex((f) => f <= b.inicio)
      if (c === -1) { c = finCol.length; finCol.push(b.fin) } else finCol[c] = b.fin
      b.col = c
    }
    for (const b of grupo) { b.cols = finCol.length; res.push(b) }
    grupo = []
  }
  for (const b of bloques) {
    if (grupo.length && b.inicio >= finGrupo) { cerrar(); finGrupo = -1 }
    grupo.push(b)
    finGrupo = Math.max(finGrupo, b.fin)
  }
  if (grupo.length) cerrar()
  return res
}

export const sinHora = (sesiones) => lista(sesiones).filter((s) => !conHora(s))

// Horas de inicio (cada 30 min) a las que tiene sentido mover una sesión ese
// día: dentro de un tramo de su disciplina y acabando dentro si hay duración.
// Si hoy, solo las que no han pasado. Sin datos del atleta: 6:00–21:30.
// Devuelve [] si ese día no puede hacer esa disciplina (el coach puede forzar
// desde el editor; aquí solo se ofrece lo que encaja).
export function horasPosibles(datos, fecha, disciplina, duracionMin, ahora, paso = 30) {
  const dia = disponibilidadDelDia(datos, fecha)
  const dur = Number.isFinite(duracionMin) && duracionMin > 0 ? duracionMin : null
  let tramos
  if (dia.origen === 'sin_datos' || !DISCIPLINAS_DISPONIBILIDAD.includes(disciplina)) tramos = [{ inicio_min: 360, fin_min: 1320 }]
  else tramos = dia.disciplinas[disciplina] || []
  const res = new Set()
  for (const t of tramos) {
    const ultimo = dur ? t.fin_min - dur : t.fin_min - paso
    for (let m = Math.ceil(t.inicio_min / paso) * paso; m <= ultimo; m += paso) res.add(m)
  }
  return [...res]
    .filter((m) => !(ahora && fecha === ahora.fecha && m < ahora.min))
    .sort((a, b) => a - b)
}
