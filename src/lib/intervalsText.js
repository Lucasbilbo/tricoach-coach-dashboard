// Generador de texto en sintaxis Intervals.icu.
// Recibe un objeto session (o form adaptado) con:
//   session.disciplina
//   session.workout_steps.bloques  → array de bloques
//   session.workout_steps.material → array de material (natación)
//   session.workout_steps.notas    → string de notas

function formatCantidad(cantidad, unidad) {
  if (!cantidad) return ''
  if (unidad === 'mtr') return `${cantidad}mtr`
  if (unidad === 'km') return `${cantidad}km`
  if (unidad === 'min') return `${cantidad}m`
  if (unidad === 's') return `${cantidad}s`
  if (unidad === 'h') {
    const h = Math.floor(Number(cantidad))
    const m = Math.round((Number(cantidad) - h) * 60)
    return m > 0 ? `${h}h${m}m` : `${h}h`
  }
  return `${cantidad}`
}

function formatObjetivo(tipo, valor, disciplina) {
  if (!tipo || !valor) return ''
  if (disciplina === 'swim') {
    if (tipo === 'ritmo') return `${valor}/100m Pace`
    if (tipo === 'fc') return `${valor}% HR`
  }
  if (disciplina === 'run') {
    if (tipo === 'ritmo') return `${valor}/km Pace`
    if (tipo === 'fc') return `${valor}% HR`
    if (tipo === 'zona') return valor
  }
  if (disciplina === 'bike') {
    if (tipo === 'potencia') return `${valor}%`
    if (tipo === 'fc') return `${valor}% HR`
    if (tipo === 'zona') return valor
  }
  return ''
}

export function buildIntervalsText(session) {
  const ws = session.workout_steps || {}
  const bloques = ws.bloques || []
  const material = ws.material || []
  const notas = ws.notas || ''
  const disciplina = session.disciplina

  const lineas = []

  if (Array.isArray(material) && material.length > 0) {
    lineas.push(`Material: ${material.join(', ')}`)
    lineas.push('')
  }

  for (const bloque of bloques) {
    if (bloque.tipo === 'warmup') {
      const cant = formatCantidad(bloque.cantidad, bloque.unidad)
      const obj = formatObjetivo(bloque.objetivo_tipo, bloque.objetivo_valor, disciplina)
      lineas.push(`Warmup ${cant}${obj ? ' ' + obj : ''}`)
    } else if (bloque.tipo === 'cooldown') {
      const cant = formatCantidad(bloque.cantidad, bloque.unidad)
      const obj = formatObjetivo(bloque.objetivo_tipo, bloque.objetivo_valor, disciplina)
      lineas.push(`Cooldown ${cant}${obj ? ' ' + obj : ''}`)
    } else if (bloque.tipo === 'step') {
      const cant = formatCantidad(bloque.cantidad, bloque.unidad)
      const obj = formatObjetivo(bloque.objetivo_tipo, bloque.objetivo_valor, disciplina)
      lineas.push(`- ${cant}${obj ? ' ' + obj : ''}`)
    } else if (bloque.tipo === 'repeat') {
      const nombre = bloque.nombre || 'Main Set'
      lineas.push(`${nombre} ${bloque.repeticiones}x`)
      for (const paso of bloque.pasos || []) {
        const cant = formatCantidad(paso.cantidad, paso.unidad)
        const obj = formatObjetivo(paso.objetivo_tipo, paso.objetivo_valor, disciplina)
        lineas.push(`- ${cant}${obj ? ' ' + obj : ''}`)
      }
    }
  }

  if (notas) {
    lineas.push('')
    lineas.push('---')
    lineas.push(notas)
  }

  return lineas.join('\n')
}
