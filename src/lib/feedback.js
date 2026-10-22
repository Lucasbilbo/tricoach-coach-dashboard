// feedback.js — cómo le fue al atleta una sesión prescrita (tabla sesion_feedback,
// migración 015). Lógica PURA (sin imports) para probarla con node --test; el
// acceso a datos está en feedbackApi.js.
//
// RPE: escala CR-10 (1–10) de esfuerzo percibido. Sensaciones: 1 = fatal … 5 = genial.

export const LIMITE_COMENTARIO = 600
export const LIMITE_MOLESTIAS = 200

// Ancla verbal de cada valor de RPE (lo que se lee junto al número elegido)
const RPE_ETIQUETAS = {
  1: 'Muy suave', 2: 'Muy suave',
  3: 'Suave', 4: 'Suave',
  5: 'Moderado', 6: 'Moderado',
  7: 'Duro', 8: 'Duro',
  9: 'Muy duro',
  10: 'Máximo',
}

export function etiquetaRpe(rpe) {
  return RPE_ETIQUETAS[rpe] || ''
}

export const SENSACIONES = [
  { value: 1, label: 'Fatal' },
  { value: 2, label: 'Mal' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Bien' },
  { value: 5, label: 'Genial' },
]

export function etiquetaSensacion(valor) {
  return SENSACIONES.find((s) => s.value === valor)?.label || ''
}

const entero = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : null)
const texto = (v, max) => {
  const t = typeof v === 'string' ? v.trim() : ''
  return t ? t.slice(0, max) : null
}

// Formulario → fila para guardar (sin session_id/athlete_id), o null si no
// cuenta nada (la BD rechaza una fila vacía; así ni se intenta).
export function normalizarFeedback(form) {
  const molestias = !!form?.molestias
  const fila = {
    rpe: entero(form?.rpe, 1, 10),
    sensacion: entero(form?.sensacion, 1, 5),
    comentario: texto(form?.comentario, LIMITE_COMENTARIO),
    molestias,
    molestias_texto: molestias ? texto(form?.molestias_texto, LIMITE_MOLESTIAS) : null,
  }
  const vacio = fila.rpe == null && fila.sensacion == null && !fila.molestias && !fila.comentario
  return vacio ? null : fila
}

// Línea corta para listas: "RPE 7 · Bien". Sin molestias ni comentario (van aparte).
export function resumenFeedback(fb) {
  if (!fb) return ''
  const partes = []
  if (fb.rpe) partes.push(`RPE ${fb.rpe}`)
  if (fb.sensacion) partes.push(etiquetaSensacion(fb.sensacion))
  return partes.join(' · ')
}

// ¿La sesión admite feedback? Solo de hoy hacia atrás (de un entreno futuro no
// hay nada que contar).
export function admiteFeedback(sesion, hoy) {
  return !!sesion?.fecha && sesion.fecha <= hoy
}
