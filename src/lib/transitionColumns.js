// Helpers para construir las columnas de <TransitionLine> desde datos reales.
// Separado del componente para no romper el fast-refresh (un archivo de
// componente solo debe exportar componentes).
import { COLORS } from './theme'

const REST_HEIGHT_PCT = 14

// Columna "completada": relleno sólido segmentado por disciplina.
// segments: [{ color, pct }] — pct = proporción (0-100) dentro de la columna.
export function makeDoneColumn({ label, statusLabel = '', isToday = false, heightPct, segments }) {
  return {
    label,
    isToday,
    statusLabel,
    heightPct,
    borderStyle: 'solid',
    borderWidth: '0px',
    borderColor: 'transparent',
    segments: segments.map((s) => ({ color: s.color, pct: s.pct, opacity: 1 })),
  }
}

// Columna de descanso: borde punteado gris, altura mínima, sin relleno.
export function makeRestColumn({ label, statusLabel = 'Descanso' }) {
  return {
    label,
    isToday: false,
    statusLabel,
    heightPct: REST_HEIGHT_PCT,
    borderStyle: 'dashed',
    borderWidth: '1.5px',
    borderColor: COLORS.restBorder,
    segments: [{ color: 'transparent', pct: 100, opacity: 1 }],
  }
}

// Columna programada/futura: borde punteado en color de disciplina, relleno 0.18.
export function makePrescribedColumn({ label, color, heightPct, statusLabel = 'Programado' }) {
  return {
    label,
    isToday: false,
    statusLabel,
    heightPct,
    borderStyle: 'dashed',
    borderWidth: '1.5px',
    borderColor: color,
    segments: [{ color, pct: 100, opacity: 0.18 }],
  }
}
