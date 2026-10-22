// cumplimiento.js — cuánto se parece lo hecho a lo prescrito. Lógica PURA (sin
// imports) para node --test; la usan la vista del coach y la del atleta.
//
// Base de comparación, por orden:
//  1. duración: la sesión tiene duracion_min (todos los pasos por tiempo).
//     Salvo natación (ver abajo).
//  2. distancia: todos los pasos van por distancia (natación sobre todo). La
//     actividad ya trae sumados los metros de técnica (lib/tecnica en backend).
//  Sin ninguna de las dos (mezcla tiempo/distancia, fuerza "tal cual") → null:
//  solo se sabe que está hecha.
//
// Bandas (las de TrainingPeaks): 80–120 % ok · 50–79 % o 121–150 % parcial ·
// resto lejos.

export const NIVEL = { ok: 'ok', parcial: 'parcial', lejos: 'lejos' }

const METROS_POR_UNIDAD = { mtr: 1, mts: 1, m: 1, km: 1000 }

// Mismo criterio que esDescanso en lib/intervals-text.cjs (lo que va al reloj
// como descanso): por nombre, o por segundos sin nombre ni objetivo.
function esDescanso(paso) {
  if (/^\s*(descanso|desc\b|rec\b|recup|pausa)/i.test(paso.nombre || '')) return true
  return paso.unidad === 's' && !paso.objetivo_tipo && !(paso.nombre && String(paso.nombre).trim())
}

// Metros totales de la sesión si todos sus pasos (salvo los descansos) van por
// distancia; si no, null.
export function metrosPrescritos(workoutSteps) {
  let total = 0
  let pasos = 0
  for (const b of workoutSteps?.bloques || []) {
    const lista = b.tipo === 'repeat' ? b.pasos || [] : [b]
    const veces = b.tipo === 'repeat' ? Number(b.repeticiones) || 0 : 1
    for (const p of lista) {
      if (esDescanso(p)) continue
      const factor = METROS_POR_UNIDAD[p.unidad]
      const cantidad = Number(p.cantidad)
      if (!factor || !Number.isFinite(cantidad)) return null
      total += cantidad * factor * veces
      pasos++
    }
  }
  return pasos > 0 && total > 0 ? Math.round(total) : null
}

export function nivelDe(pct) {
  if (pct >= 80 && pct <= 120) return NIVEL.ok
  if ((pct >= 50 && pct < 80) || (pct > 120 && pct <= 150)) return NIVEL.parcial
  return NIVEL.lejos
}

const fmtKm = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km` : `${m} m`)

// → { nivel, pct, base, texto } o null si no hay con qué comparar.
export function cumplimiento(sesion, actividad) {
  if (!sesion || !actividad) return null

  // Natación NUNCA por duración: el tiempo en movimiento de Strava no cuenta los
  // descansos (una sesión de 70' bien hecha sale ~55 %) y el total tampoco es
  // fiable (el reloj se autopausa en la pared). Medido con datos reales 2026-10.
  const prescritoMin = Number(sesion.duracion_min)
  const realMin = Number(actividad.duracion_min)
  if (sesion.disciplina !== 'swim' && prescritoMin > 0 && realMin > 0) {
    const pct = Math.round((realMin / prescritoMin) * 100)
    return { nivel: nivelDe(pct), pct, base: 'duracion', texto: `${Math.round(realMin)} de ${Math.round(prescritoMin)} min` }
  }

  const prescritoM = metrosPrescritos(sesion.workout_steps)
  const realM = Math.round((Number(actividad.distancia_km) || 0) * 1000)
  if (prescritoM && realM > 0) {
    const pct = Math.round((realM / prescritoM) * 100)
    return { nivel: nivelDe(pct), pct, base: 'distancia', texto: `${fmtKm(realM)} de ${fmtKm(prescritoM)}` }
  }
  return null
}
