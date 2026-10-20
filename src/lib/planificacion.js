// planificacion.js — lógica PURA de qué semanas ve el coach para planificar.
// Fechas YYYY-MM-DD (Europe/Madrid), semanas que empiezan en lunes.
import { sumarDias } from './chartUtils'

// Semanas futuras que se muestran SIEMPRE, aunque estén vacías, para que el coach
// pueda planificarlas viendo la disponibilidad del atleta.
export const SEMANAS_FUTURAS_MINIMAS = 2

// Lunes de las semanas futuras a mostrar, ascendentes y SIN huecos: desde la
// siguiente a la actual hasta la más lejana entre (actual + mínimas + extra) y
// la última semana futura que ya tiene sesiones.
//   semanaActual: lunes de la semana en curso
//   lunesConSesiones: lunes (de cualquier época) que tienen sesiones
//   extra: semanas vacías adicionales pedidas con "Planificar otra semana"
export function semanasFuturas(semanaActual, lunesConSesiones = [], extra = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semanaActual || '')) return []
  const horizonteMinimo = sumarDias(semanaActual, 7 * (SEMANAS_FUTURAS_MINIMAS + Math.max(0, extra)))
  const ultimaConSesiones = lunesConSesiones.filter((l) => l > semanaActual).sort().pop()
  const hasta = ultimaConSesiones && ultimaConSesiones > horizonteMinimo ? ultimaConSesiones : horizonteMinimo
  const res = []
  for (let lunes = sumarDias(semanaActual, 7); lunes <= hasta; lunes = sumarDias(lunes, 7)) res.push(lunes)
  return res
}

// ¿Se puede planificar en esta fecha? Hoy y días futuros sí; pasados no.
export const esPlanificable = (fecha, hoy) => typeof fecha === 'string' && fecha >= hoy
