// season.js — helpers puros de la Temporada (sin imports para poder probarlos
// con `node --test`). Colores alineados con DISCIPLINE_COLORS de theme.js.

export const DEPORTES = {
  run: { label: 'Carrera', color: '#E85D5D' },
  tri: { label: 'Triatlón', color: '#EDEEF2' },
  bike: { label: 'Ciclismo', color: '#E8934A' },
  swim: { label: 'Natación', color: '#2FBFAF' },
  other: { label: 'Otro', color: '#5C6270' },
}

// Triatlón = las tres disciplinas: se pinta como un punto tricolor.
export const TRI_GRADIENT = 'conic-gradient(#2FBFAF 0 33.3%, #E8934A 0 66.6%, #E85D5D 0)'

export const ESTADOS = {
  candidata: { label: 'Candidata', color: '#8A90A0', fondo: 'transparent', borde: '#2A3040' },
  confirmada: { label: 'Confirmada', color: '#EDEEF2', fondo: 'rgba(237,238,242,0.06)', borde: '#3A4152' },
  inscrito: { label: 'Inscrito', color: '#0B0D12', fondo: '#2FBFAF', borde: '#2FBFAF' },
  descartada: { label: 'Descartada', color: '#5C6270', fondo: 'transparent', borde: '#1B202C' },
  hecha: { label: 'Hecha', color: '#8B7FD1', fondo: 'rgba(139,127,209,0.12)', borde: '#8B7FD1' },
}

export const ORDEN_ESTADOS = ['candidata', 'confirmada', 'inscrito', 'hecha', 'descartada']

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// Ámbar (DISCIPLINE_COLORS.bike) para avisos de inscripción.
export const COLOR_AVISO = '#E8934A'

// Días de margen para avisar de una inscripción próxima.
export const DIAS_AVISO_INSCRIPCION = 30

export function hoyMadrid(now = new Date()) {
  return now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' })
}

function aUTC(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function diasEntre(desde, hasta) {
  return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000)
}

// '2027-03-14' → '14 mar 2027'; aproximada → '~ mar 2027'
export function formatFechaEvento(evento) {
  if (!evento?.fecha) return 'Sin fecha'
  const [y, m, d] = evento.fecha.split('-').map(Number)
  if (evento.fecha_aprox) return `~ ${MESES[m - 1]} ${y}`
  return `${d} ${MESES[m - 1]} ${y}`
}

export function formatFechaCorta(fecha) {
  if (!fecha) return ''
  const [, m, d] = fecha.split('-').map(Number)
  return `${d} ${MESES[m - 1]}`
}

export function etiquetaMes(clave) {
  if (clave === 'sin-fecha') return 'Sin fecha'
  const [y, m] = clave.split('-').map(Number)
  return `${MESES_LARGOS[m - 1]} ${y}`
}

// Agrupa por mes 'YYYY-MM' en orden cronológico; las pruebas sin fecha al final.
export function agruparPorMes(eventos) {
  const grupos = new Map()
  const ordenados = [...eventos].sort(compararEventos)
  for (const e of ordenados) {
    const clave = e.fecha ? e.fecha.slice(0, 7) : 'sin-fecha'
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(e)
  }
  return [...grupos.entries()].map(([clave, items]) => ({ clave, items }))
}

const PESO_PRIORIDAD = { A: 0, B: 1, C: 2 }

export function compararEventos(a, b) {
  if (a.fecha && b.fecha && a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
  if (a.fecha && !b.fecha) return -1
  if (!a.fecha && b.fecha) return 1
  const pa = PESO_PRIORIDAD[a.prioridad] ?? 3
  const pb = PESO_PRIORIDAD[b.prioridad] ?? 3
  if (pa !== pb) return pa - pb
  return (a.nombre || '').localeCompare(b.nombre || '', 'es')
}

// Aviso de inscripción: solo tiene sentido si aún no estás inscrito.
// → { nivel: 'vencida' | 'pronto', dias } o null
export function alertaInscripcion(evento, hoy) {
  if (!evento?.inscripcion_antes) return null
  if (!['candidata', 'confirmada'].includes(evento.estado)) return null
  const dias = diasEntre(hoy, evento.inscripcion_antes)
  if (dias < 0) return { nivel: 'vencida', dias }
  if (dias <= DIAS_AVISO_INSCRIPCION) return { nivel: 'pronto', dias }
  return null
}

export function textoAlerta(alerta) {
  if (!alerta) return ''
  if (alerta.nivel === 'vencida') return 'Plazo de inscripción pasado'
  if (alerta.dias === 0) return 'Inscripción: hoy'
  if (alerta.dias === 1) return 'Inscripción: mañana'
  return `Inscripción en ${alerta.dias} días`
}

export function filtrarEventos(eventos, filtro) {
  if (filtro === 'todas') return eventos
  if (filtro === 'activas') return eventos.filter((e) => e.estado !== 'descartada')
  return eventos.filter((e) => e.estado === filtro)
}

// Pruebas futuras no descartadas, como mucho `limite`, para el resumen del coach.
export function proximasPruebas(eventos, hoy, limite = 8) {
  return eventos
    .filter((e) => e.fecha && e.fecha >= hoy && e.estado !== 'descartada' && e.estado !== 'hecha')
    .sort(compararEventos)
    .slice(0, limite)
}

// Pruebas con inscripción próxima o vencida, ordenadas por urgencia.
export function inscripcionesPendientes(eventos, hoy) {
  return eventos
    .map((e) => ({ evento: e, alerta: alertaInscripcion(e, hoy) }))
    .filter((x) => x.alerta)
    .sort((a, b) => a.alerta.dias - b.alerta.dias)
}

// 12 meses desde el mes de `hoy` (para la tira de temporada).
export function mesesTemporada(hoy, n = 12) {
  const [y, m] = hoy.split('-').map(Number)
  const meses = []
  for (let i = 0; i < n; i++) {
    const total = m - 1 + i
    const yy = y + Math.floor(total / 12)
    const mm = (total % 12) + 1
    meses.push({ clave: `${yy}-${String(mm).padStart(2, '0')}`, corto: MESES[mm - 1], anio: yy })
  }
  return meses
}

export function eventoVacio() {
  return {
    nombre: '',
    deporte: 'run',
    distancia: '',
    fecha: '',
    fecha_aprox: false,
    estado: 'candidata',
    prioridad: '',
    escenario: '',
    precio: '',
    url: '',
    inscripcion_antes: '',
    notas: '',
  }
}

// Fila de BD → valores del formulario (null → '').
export function eventoAFormulario(evento) {
  const base = eventoVacio()
  const out = { ...base }
  for (const k of Object.keys(base)) {
    const v = evento?.[k]
    out[k] = typeof base[k] === 'boolean' ? v === true : v ?? ''
  }
  return out
}

// Texto "quién y cuándo" de un cambio: 'Jon García · hace 2 h' / 'Tú · 3 oct'
export function textoAutoria(actorId, actores, viewerId, fechaIso, now = new Date()) {
  const quien = actorId === viewerId ? 'Tú' : actores?.[actorId] || 'Alguien'
  const ms = now.getTime() - new Date(fechaIso).getTime()
  const min = Math.floor(ms / 60000)
  let cuando
  if (min < 1) cuando = 'ahora'
  else if (min < 60) cuando = `hace ${min} min`
  else if (min < 60 * 24) cuando = `hace ${Math.floor(min / 60)} h`
  else cuando = formatFechaCorta(hoyMadrid(new Date(fechaIso)))
  return `${quien} · ${cuando}`
}
