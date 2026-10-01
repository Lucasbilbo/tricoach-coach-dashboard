// estadoSesion.js — ¿se hizo la sesión prescrita? Fuente ÚNICA para la vista
// del coach (SessionsList) y la del atleta (AthleteHome). Funciones puras (sin
// imports) para poder probarlas con node --test.
//
// Criterio: una actividad de Strava de la misma disciplina el mismo día
// (Europe/Madrid). Cada actividad completa COMO MUCHO una sesión: si hay dos
// sesiones de carrera el mismo día y una sola actividad, solo una sale hecha
// (F6 de la auditoría: antes la misma actividad marcaba las dos).

export const ESTADO = {
  completada: 'completada',
  programada: 'programada',
  pendiente: 'pendiente',
  sinDatos: 'sin_datos',
}

// Empareja sesiones con actividades. Dentro de cada (fecha, disciplina) asigna
// a cada sesión la actividad libre de duración más parecida a la prescrita.
// Devuelve Map<sesion.id, actividad>.
export function asignarActividades(sesiones, actividades) {
  const libres = new Map()
  for (const a of actividades || []) {
    if (!a?.fecha || !a?.disciplina) continue
    const k = `${a.fecha}|${a.disciplina}`
    if (!libres.has(k)) libres.set(k, [])
    libres.get(k).push(a)
  }

  const asignadas = new Map()
  // Primero las sesiones con duración conocida (emparejan mejor), luego el resto.
  const orden = [...(sesiones || [])].sort((x, y) => (y.duracion_min ? 1 : 0) - (x.duracion_min ? 1 : 0))
  for (const s of orden) {
    const candidatas = libres.get(`${s.fecha}|${s.disciplina}`)
    if (!candidatas || candidatas.length === 0) continue
    let mejor = 0
    if (s.duracion_min) {
      let menorDif = Infinity
      candidatas.forEach((a, i) => {
        const dif = Math.abs((a.duracion_min ?? 0) - s.duracion_min)
        if (dif < menorDif) {
          menorDif = dif
          mejor = i
        }
      })
    }
    asignadas.set(s.id, candidatas[mejor])
    candidatas.splice(mejor, 1)
  }
  return asignadas
}

// Estado de UNA sesión dado lo ya asignado.
//  - completada: hay actividad emparejada
//  - programada: es de hoy o futura y aún sin actividad
//  - sin_datos: más antigua que las actividades disponibles (no se puede saber;
//    nunca un falso "pendiente")
//  - pendiente: pasada, con datos, y sin actividad
export function estadoDeSesion(sesion, actividad, hoy, coberturaDesde) {
  if (actividad) return ESTADO.completada
  if (sesion.fecha >= hoy) return ESTADO.programada
  if (!coberturaDesde || sesion.fecha < coberturaDesde) return ESTADO.sinDatos
  return ESTADO.pendiente
}

// Semanas de actividades necesarias para cubrir la sesión pasada más antigua,
// con tope. null si no hay sesiones pasadas.
export function semanasNecesarias(fechas, hoy, tope = 26) {
  const pasadas = (fechas || []).filter((f) => f && f < hoy)
  if (pasadas.length === 0) return null
  const masAntigua = pasadas.reduce((m, f) => (f < m ? f : m))
  const dias = Math.ceil((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${masAntigua}T00:00:00Z`)) / 86400000)
  return Math.min(Math.max(Math.ceil(dias / 7) + 1, 1), tope)
}

// Fecha (YYYY-MM-DD) de hace `semanas` semanas respecto a `hoy`.
export function fechaHaceSemanas(hoy, semanas) {
  const t = Date.parse(`${hoy}T00:00:00Z`) - semanas * 7 * 86400000
  return new Date(t).toISOString().slice(0, 10)
}
