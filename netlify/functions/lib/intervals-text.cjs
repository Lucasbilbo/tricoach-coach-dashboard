// intervals-text.js — generador ÚNICO del texto de entrenamiento en sintaxis
// Intervals.icu (CommonJS). Fuente de verdad compartida por:
//   - el preview del builder (src/lib/intervalsText.js re-exporta esto)
//   - el envío real a Intervals/Garmin (send-to-intervals.js)
// Antes había dos copias que ya habían divergido en el manejo de notas (F3).
//
// REGLA DE NEGOCIO (no cambiar): las notas del entrenador NUNCA se envían a
// Garmin — congelan el reloj. Solo se muestran en el preview. Por eso el path
// de envío llama SIEMPRE con incluirNotas:false y el preview con true.

function unidadIntervals(unidad) {
  if (unidad === 'min') return 'm'
  return unidad || ''
}

// Objetivo por defecto de los pasos simples sin objetivo (calentamiento, vuelta
// a la calma y pasos sueltos). Bici y carrera van por PULSO: los atletas no
// tienen potenciómetro (2026-10) y una zona de potencia sin medidor deja el
// reloj con un objetivo que no puede medir. Natación SIN objetivo: un ritmo en
// piscina sin umbral configurado solo genera avisos falsos.
function defaultZona(disciplina) {
  if (disciplina === 'run' || disciplina === 'bike') return ' Z1 HR'
  return ''
}

const normalizarZona = (v) => (v && v.includes('-') ? v.split('-')[0] : v)
// Texto del paso que se ve en el reloj (el "cue"): nombre + material del paso
// (p. ej. 'Pies · aletas, tabla'). Intervals SOLO toma como cue el texto que va
// ANTES de la duración/distancia; lo que va detrás no llega al reloj (bug
// 2026-10: material y nombres se perdían). Por eso el cue va delante y se
// neutraliza lo que Intervals leería como orden: zonas (Z4), duraciones o
// distancias (10m, 400mtr, 20"), porcentajes, ritmos (1:45) y repeticiones (4x).
const PALABRA_UNIDAD = {
  km: 'kilómetros', mtr: 'metros', mts: 'metros', m: null, s: 'segundos', seg: 'segundos',
  h: 'horas', min: 'minutos', "'": 'minutos', '’': 'minutos', '"': 'segundos', '”': 'segundos',
  '%': 'por ciento', w: 'vatios', rpm: 'pedaladas', bpm: 'pulsaciones',
}

function cueSeguro(texto, disciplina) {
  return String(texto)
    .replace(/[@^]/g, ' ')
    .replace(/<!>/g, ' ')
    .replace(/\bz\s?([1-7])\b/gi, 'Zona $1')
    .replace(/(\d+(?:[.,]\d+)?)\s*(km|mtr|mts|min|seg|rpm|bpm|m|s|h|w|'|’|"|”|%)(?![a-záéíóúñ])/gi, (_, n, u) => {
      const k = u.toLowerCase()
      const palabra = k === 'm' ? (disciplina === 'swim' ? 'metros' : 'minutos') : PALABRA_UNIDAD[k]
      return `${n} ${palabra}`
    })
    .replace(/(\d{1,2}):([0-5]\d)/g, '$1.$2')
    .replace(/\b(\d+)\s*[x×](?![a-záéíóúñ])/gi, '$1 veces ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cueStr(nombre, material, disciplina) {
  const partes = []
  if (nombre && String(nombre).trim()) partes.push(String(nombre).trim())
  if (Array.isArray(material) && material.length > 0) partes.push(material.join(', '))
  if (!partes.length) return ''
  const cue = cueSeguro(partes.join(' · '), disciplina)
  return cue ? `${cue} ` : ''
}

// Línea de un paso: '- <cue> <cantidad><unidad> <objetivo>'
function lineaPaso(paso, disciplina, cueNombre, objetivo) {
  return '- ' + cueStr(cueNombre, paso.material, disciplina) + paso.cantidad + unidadIntervals(paso.unidad) + objetivo
}

// 'Calentamiento' + nombre opcional del coach → 'Calentamiento · 75 crol 25 otro'
function conPrefijo(prefijo, nombre) {
  const n = nombre && String(nombre).trim()
  return n ? `${prefijo} · ${n}` : prefijo
}

function objetivoStr(step, disciplina) {
  const tipo = step.objetivo_tipo
  const valor = step.objetivo_valor
  if (!tipo || !valor) return ''
  if (tipo === 'zona') {
    const zona = normalizarZona(valor)
    if (disciplina === 'swim') return ` ${zona} Pace`
    // Bici también por pulso (sin potenciómetro). Sesiones antiguas con zona en
    // bici se reinterpretan como zona de FC al reenviarse.
    return ` ${zona} HR`
  }
  if (tipo === 'fc') return ` ${valor}% HR`
  if (tipo === 'potencia') return ` ${valor}%`
  if (tipo === 'ritmo') {
    // Admite ritmo exacto ('5:00') o rango ('4:50-5:10'); Intervals entiende ambos.
    const ritmo = String(valor).replace(/\s+/g, '')
    if (disciplina === 'swim') return ` ${ritmo}/100m Pace`
    if (disciplina === 'run') return ` ${ritmo}/km Pace`
  }
  return ''
}

// Construye el texto de un entrenamiento. Los bloques se separan con \n\n para
// que Intervals los parsee como pasos independientes; los pasos internos de un
// repeat van con \n simple.
//
// options.incluirNotas: true SOLO para el preview. En el envío real debe ser
// false (las notas no llegan al reloj).
function buildIntervalsText(session, options = {}) {
  const incluirNotas = options.incluirNotas === true
  const ws = session.workout_steps || {}
  const bloques = ws.bloques || []
  const material = ws.material || session.material || []
  const notas = ws.notas ?? session.notas ?? ''
  const disciplina = session.disciplina

  const partes = []

  if (Array.isArray(material) && material.length > 0) {
    partes.push('Material: ' + material.join(', '))
  }

  for (const bloque of bloques) {
    if (bloque.tipo === 'warmup') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push(lineaPaso(bloque, disciplina, conPrefijo('Calentamiento', bloque.nombre), obj))
    } else if (bloque.tipo === 'cooldown') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push(lineaPaso(bloque, disciplina, conPrefijo('Vuelta a la calma', bloque.nombre), obj))
    } else if (bloque.tipo === 'step') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push(lineaPaso(bloque, disciplina, bloque.nombre, obj))
    } else if (bloque.tipo === 'repeat') {
      const lines = [(bloque.nombre || 'Serie') + ' ' + bloque.repeticiones + 'x']
      for (const paso of (bloque.pasos || [])) {
        lines.push(lineaPaso(paso, disciplina, paso.nombre, objetivoStr(paso, disciplina)))
      }
      partes.push(lines.join('\n'))
    }
  }

  const sintaxis = partes.join('\n\n')
  if (incluirNotas && notas) {
    return sintaxis + '\n\n---\n' + notas
  }
  return sintaxis
}

module.exports = { buildIntervalsText, cueSeguro }
