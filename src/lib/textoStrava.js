// Entreno en texto limpio para pegar en la descripción de Strava (lógica pura,
// con tests). No es el texto de Intervals: aquí se escribe para que lo lea una
// persona ("8 × (1 min Z5 / 1 min Z1)"). Las notas del entrenador NO se incluyen.
import { adjuntoDe } from './adjuntos.js'

function cantidad(c, u) {
  if (c == null || c === '') return ''
  if (u === 'min') return `${c} min`
  if (u === 's') return `${c} s`
  if (u === 'h') return `${c} h`
  if (u === 'mtr') return `${c} m`
  return `${c} ${u || ''}`.trim()
}

function objetivo(tipo, valor) {
  if (!tipo || !valor) return ''
  if (tipo === 'fc') return `${valor}% FC`
  if (tipo === 'potencia') return `${valor}% FTP`
  if (tipo === 'zona_potencia') return `${valor} potencia`
  return String(valor)
}

function paso(p) {
  const base = [cantidad(p.cantidad, p.unidad), objetivo(p.objetivo_tipo, p.objetivo_valor)].filter(Boolean).join(' ')
  const nombre = p.nombre ? String(p.nombre).trim() : ''
  const material = Array.isArray(p.material) && p.material.length ? `(${p.material.join(', ')})` : ''
  return [base, nombre, material].filter(Boolean).join(' ')
}

function linea(b) {
  if (b.tipo === 'pausa') return ''
  if (b.tipo === 'repeat') {
    const pasos = (b.pasos || []).filter((p) => p.tipo !== 'pausa').map(paso).filter(Boolean)
    if (pasos.length === 0) return ''
    const veces = Number(b.repeticiones) || 1
    const cuerpo = pasos.length === 1 ? pasos[0] : `(${pasos.join(' / ')})`
    return `${veces} × ${cuerpo}`
  }
  const texto = paso(b)
  if (!texto) return ''
  if (b.tipo === 'warmup') return `Calentamiento: ${texto}`
  if (b.tipo === 'cooldown') return `Vuelta a la calma: ${texto}`
  return texto
}

export function textoParaStrava(sesion) {
  const ws = sesion?.workout_steps
  const titulo = (ws?.nombre || '').trim() || (sesion?.descripcion || '').trim()
  const lineas = (ws?.bloques || []).map(linea).filter(Boolean)
  const adjunto = adjuntoDe(ws)
  const libre = adjunto?.texto ? String(adjunto.texto).trim() : ''
  return [titulo, ...lineas, libre].filter(Boolean).join('\n')
}
