// Resúmenes de una línea de los bloques del creador (lógica pura, con tests).
// Sirven para pintar cada bloque PLEGADO ("Calentamiento · 15′ Z1") y para
// proponer un nombre cuando el coach no escribe uno ("Carrera · 6×3′ Z4").

const DISCIPLINA_NOMBRE = { swim: 'Natación', bike: 'Ciclismo', run: 'Carrera', strength: 'Fuerza', other: 'Entreno' }

export function cantidadTexto(cantidad, unidad) {
  if (cantidad == null || cantidad === '') return ''
  if (unidad === 'min') return `${cantidad}′`
  if (unidad === 's') return `${cantidad}″`
  if (unidad === 'h') return `${cantidad} h`
  if (unidad === 'mtr') return `${cantidad} m`
  return `${cantidad} ${unidad || ''}`.trim()
}

export function objetivoTexto(tipo, valor) {
  if (!tipo || !valor) return ''
  if (tipo === 'fc') return `${valor}% FC`
  if (tipo === 'potencia') return `${valor}% pot.`
  return String(valor) // zona (Z2) o ritmo (4:50-5:10)
}

// "3′ Z4" · "100 m 1:45" · "200 m" (+ " · Progresivo" si lleva nombre y se pide)
export function pasoTexto(paso, { conNombre = true } = {}) {
  const partes = [cantidadTexto(paso.cantidad, paso.unidad), objetivoTexto(paso.objetivo_tipo, paso.objetivo_valor)].filter(Boolean)
  const base = partes.join(' ')
  const nombre = conNombre && paso.nombre ? String(paso.nombre).trim() : ''
  return [base, nombre].filter(Boolean).join(' · ')
}

// Una línea por bloque: la serie como "6 × (3′ Z4 / 2′ Z1)".
export function resumenBloque(bloque) {
  if (!bloque) return ''
  if (bloque.tipo === 'repeat') {
    const pasos = (bloque.pasos || []).map((p) => pasoTexto(p)).filter(Boolean)
    const veces = Number(bloque.repeticiones) || 1
    const cuerpo = pasos.length === 0 ? 'sin pasos' : pasos.length === 1 ? pasos[0] : `(${pasos.join(' / ')})`
    return `${veces} × ${cuerpo}`
  }
  return pasoTexto(bloque) || 'Sin definir'
}

// Nombre propuesto si el coach no escribe ninguno: la serie principal manda.
export function nombrePorDefecto(disciplina, bloques) {
  const base = DISCIPLINA_NOMBRE[disciplina] || 'Entreno'
  const serie = (bloques || []).find((b) => b.tipo === 'repeat' && (b.pasos || []).length > 0)
  if (serie) {
    const principal = pasoTexto(serie.pasos[0], { conNombre: false })
    return `${base} · ${Number(serie.repeticiones) || 1}×${principal}`
  }
  const pasos = (bloques || []).filter((b) => b.tipo !== 'pausa')
  if (pasos.length === 1) return `${base} · ${pasoTexto(pasos[0], { conNombre: false })}`
  return base
}
