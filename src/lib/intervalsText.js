// Generador de texto en sintaxis Intervals.icu.
// Cada bloque es un elemento de `partes`, unidos con \n\n para que
// Intervals.icu los parsee como pasos independientes.

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

const normalizarZona = (v) => v && v.includes('-') ? v.split('-')[0] : v
const nombreStr = (nombre) => nombre ? ` @${nombre}` : ''

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

export function buildIntervalsText(session) {
  const ws = session.workout_steps || {}
  const bloques = ws.bloques || []
  const material = ws.material || []
  const notas = ws.notas || ''
  const disciplina = session.disciplina

  const partes = []

  if (Array.isArray(material) && material.length > 0) {
    partes.push('Material: ' + material.join(', '))
  }

  for (const bloque of bloques) {
    if (bloque.tipo === 'warmup') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push('Warmup ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj)
    } else if (bloque.tipo === 'cooldown') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push('Cooldown ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj)
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
  if (notas) {
    return sintaxis + '\n\n---\n' + notas
  }
  return sintaxis
}
