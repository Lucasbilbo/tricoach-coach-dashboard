// cargaRelativa.js — ¿la carga de los últimos 7 días es alta o baja PARA ESTE
// atleta? Lógica PURA (node --test). La usa el panel del coach.
//
// Antes el panel pintaba el TSS con cortes fijos (300/450) y con los colores de
// natación/bici/carrera, que en este panel significan disciplina. 300 TSS es
// mucho para un atleta y poco para otro: se compara con SU media de las 4
// semanas completas anteriores (decidido con Lucas 2026-10-29).
//
// semanas: semanas_recientes de coach-dashboard-data, de la más antigua a la
// actual (la última está a medias y no cuenta para la media).

export const UMBRAL_ALTO = 1.2
export const UMBRAL_BAJO = 0.8
const SEMANAS_BASE = 4
const MIN_SEMANAS_CON_DATOS = 3

// → { nivel: 'alta' | 'normal' | 'baja', media, ratio } o null si no hay base
export function cargaRelativa(tssSemana, semanas) {
  if (tssSemana == null || !Array.isArray(semanas) || semanas.length < 2) return null
  const base = semanas.slice(0, -1).slice(-SEMANAS_BASE).map((s) => Number(s?.tss_total) || 0)
  if (base.filter((t) => t > 0).length < MIN_SEMANAS_CON_DATOS) return null
  const media = base.reduce((a, b) => a + b, 0) / base.length
  if (media <= 0) return null
  const ratio = tssSemana / media
  const nivel = ratio > UMBRAL_ALTO ? 'alta' : ratio < UMBRAL_BAJO ? 'baja' : 'normal'
  return { nivel, media: Math.round(media), ratio }
}

export const TEXTO_NIVEL = { alta: 'Por encima', normal: 'En su línea', baja: 'Por debajo' }
