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

function defaultZona(disciplina) {
  if (disciplina === 'swim') return ' Z1 Pace'
  if (disciplina === 'run') return ' Z1 HR'
  if (disciplina === 'bike') return ' Z1'
  return ''
}

const normalizarZona = (v) => (v && v.includes('-') ? v.split('-')[0] : v)
const nombreStr = (nombre) => (nombre ? ` @${nombre}` : '')

function objetivoStr(step, disciplina) {
  const tipo = step.objetivo_tipo
  const valor = step.objetivo_valor
  if (!tipo || !valor) return ''
  if (tipo === 'zona') {
    const zona = normalizarZona(valor)
    if (disciplina === 'swim') return ` ${zona} Pace`
    if (disciplina === 'run') return ` ${zona} HR`
    return ` ${zona}`
  }
  if (tipo === 'fc') return ` ${valor}% HR`
  if (tipo === 'potencia') return ` ${valor}%`
  if (tipo === 'ritmo') {
    if (disciplina === 'swim') return ` ${valor}/100m Pace`
    if (disciplina === 'run') return ` ${valor}/km Pace`
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
      partes.push('- ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj + ' @Calentamiento')
    } else if (bloque.tipo === 'cooldown') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push('- ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj + ' @Vuelta a la calma')
    } else if (bloque.tipo === 'step') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push('- ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj + nombreStr(bloque.nombre))
    } else if (bloque.tipo === 'repeat') {
      const lines = [(bloque.nombre || 'Serie') + ' ' + bloque.repeticiones + 'x']
      for (const paso of (bloque.pasos || [])) {
        lines.push('- ' + paso.cantidad + unidadIntervals(paso.unidad) + objetivoStr(paso, disciplina) + nombreStr(paso.nombre))
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

module.exports = { buildIntervalsText }
