// lib/season-validate.js — validación y diff de eventos de temporada (CommonJS)
// Funciones puras, sin red: las usa netlify/functions/season.js y se prueban
// con `node --test test/`.

const DEPORTES = ['run', 'tri', 'bike', 'swim', 'other']
const ESTADOS = ['candidata', 'confirmada', 'inscrito', 'descartada', 'hecha']
const PRIORIDADES = ['A', 'B', 'C']
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/

const LIMITES = { nombre: 120, distancia: 80, escenario: 40, precio: 60, url: 500, notas: 1000 }

const ETIQUETAS_CAMPO = {
  nombre: 'nombre',
  deporte: 'deporte',
  distancia: 'distancia',
  fecha: 'fecha',
  fecha_aprox: 'fecha aproximada',
  estado: 'estado',
  prioridad: 'prioridad',
  escenario: 'escenario',
  precio: 'precio',
  url: 'enlace',
  inscripcion_antes: 'fecha de inscripción',
  notas: 'notas',
}

function fechaValida(v) {
  if (!FECHA_REGEX.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// Texto opcional: '' / null / undefined → null; recorta espacios.
function textoOpcional(v, max, campo, errores) {
  if (v == null) return null
  if (typeof v !== 'string') {
    errores.push(`${campo} debe ser texto`)
    return null
  }
  const t = v.trim()
  if (!t) return null
  if (t.length > max) errores.push(`${campo} supera ${max} caracteres`)
  return t
}

function fechaOpcional(v, campo, errores) {
  if (v == null || v === '') return null
  if (typeof v !== 'string' || !fechaValida(v)) {
    errores.push(`${campo} no es una fecha válida (AAAA-MM-DD)`)
    return null
  }
  return v
}

// Normaliza y valida el evento recibido del frontend. Solo se copian campos de
// la whitelist: athlete_id, created_by, etc. NUNCA salen del body.
// Devuelve { ok: true, evento } o { ok: false, errores: [...] }.
function validarEvento(input) {
  const errores = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errores: ['evento requerido'] }
  }

  const nombre = typeof input.nombre === 'string' ? input.nombre.trim() : ''
  if (!nombre) errores.push('nombre requerido')
  else if (nombre.length > LIMITES.nombre) errores.push(`nombre supera ${LIMITES.nombre} caracteres`)

  const deporte = input.deporte
  if (!DEPORTES.includes(deporte)) errores.push('deporte inválido')

  const estado = input.estado == null || input.estado === '' ? 'candidata' : input.estado
  if (!ESTADOS.includes(estado)) errores.push('estado inválido')

  const prioridad = input.prioridad == null || input.prioridad === '' ? null : input.prioridad
  if (prioridad !== null && !PRIORIDADES.includes(prioridad)) errores.push('prioridad inválida')

  const url = textoOpcional(input.url, LIMITES.url, 'enlace', errores)
  if (url && !/^https?:\/\//i.test(url)) errores.push('el enlace debe empezar por http:// o https://')

  const evento = {
    nombre,
    deporte,
    distancia: textoOpcional(input.distancia, LIMITES.distancia, 'distancia', errores),
    fecha: fechaOpcional(input.fecha, 'fecha', errores),
    fecha_aprox: input.fecha_aprox === true,
    estado,
    prioridad,
    escenario: textoOpcional(input.escenario, LIMITES.escenario, 'escenario', errores),
    precio: textoOpcional(input.precio, LIMITES.precio, 'precio', errores),
    url,
    inscripcion_antes: fechaOpcional(input.inscripcion_antes, 'fecha de inscripción', errores),
    notas: textoOpcional(input.notas, LIMITES.notas, 'notas', errores),
  }

  return errores.length ? { ok: false, errores } : { ok: true, evento }
}

// Resumen legible de un cambio para el log, p.ej.
// 'Getxo olímpico: estado candidata → confirmada, prioridad – → A'
function resumirCambio(anterior, nuevo) {
  if (!anterior) return `Añade ${nuevo.nombre}`.slice(0, 300)
  const partes = []
  for (const campo of Object.keys(ETIQUETAS_CAMPO)) {
    const a = anterior[campo] ?? null
    const n = nuevo[campo] ?? null
    if (a === n) continue
    if (campo === 'notas' || campo === 'url') {
      partes.push(`${ETIQUETAS_CAMPO[campo]} actualizado`)
    } else if (campo === 'fecha_aprox') {
      partes.push(n ? 'fecha pasa a aproximada' : 'fecha pasa a exacta')
    } else {
      partes.push(`${ETIQUETAS_CAMPO[campo]} ${a ?? '–'} → ${n ?? '–'}`)
    }
  }
  if (!partes.length) return null // sin cambios reales: no se registra
  return `${nuevo.nombre}: ${partes.join(', ')}`.slice(0, 300)
}

module.exports = { validarEvento, resumirCambio, fechaValida, DEPORTES, ESTADOS, PRIORIDADES }
