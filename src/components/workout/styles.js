// Estilos base del WorkoutBuilder (C3: extraídos para compartir entre el
// componente principal y sus sub-componentes de bloque).
import { COLORS } from '../../lib/theme'

export const labelSm = {
  display: 'block',
  fontSize: 11,
  color: COLORS.textSecondary,
  marginBottom: 3,
}

export const miniBtn = {
  background: 'transparent',
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 4,
  color: COLORS.textSecondary,
  padding: '3px 7px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'Archivo', sans-serif",
}

export const addBtnStyle = {
  background: 'transparent',
  border: `1px dashed rgba(255,255,255,0.15)`,
  borderRadius: 6,
  color: COLORS.textSecondary,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'Archivo', sans-serif",
  width: '100%',
}

export const sectionLabel = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.textPrimary,
  marginBottom: 8,
}

export const separadorSection = {
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.textPrimary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  paddingBottom: 6,
  marginBottom: 12,
  marginTop: 4,
}

// Chip de selección (piscina, fecha, hora, zona). Seleccionado = blanco translúcido.
// Para disciplinas usar chipDisciplinaStyle que usa el color semántico de la disciplina.
export function chipStyle(sel, { bloqueado = false, mono = false } = {}) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: sel ? 'rgba(237,238,242,0.1)' : 'transparent',
    color: sel ? COLORS.textPrimary : COLORS.textSecondary,
    border: `1px solid ${sel ? 'rgba(237,238,242,0.34)' : '#262C3A'}`,
    borderRadius: 7,
    padding: '6px 11px',
    minHeight: 32,
    boxSizing: 'border-box',
    fontSize: 12.5,
    fontWeight: sel ? 600 : 500,
    cursor: bloqueado ? 'not-allowed' : 'pointer',
    opacity: bloqueado ? 0.35 : 1,
    fontFamily: mono ? "'JetBrains Mono', monospace" : "'Archivo', sans-serif",
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }
}

// Chip de disciplina: seleccionado usa el color semántico de esa disciplina
// (fondo tenue + borde del color), no el blanco genérico.
export function chipDisciplinaStyle(sel, color, { bloqueado = false } = {}) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: sel ? `${color}1A` : 'transparent', // 10% opacidad del color
    color: sel ? COLORS.textPrimary : COLORS.textSecondary,
    border: `1px solid ${sel ? color : '#262C3A'}`,
    borderRadius: 7,
    padding: '6px 11px',
    minHeight: 32,
    boxSizing: 'border-box',
    fontSize: 12.5,
    fontWeight: sel ? 600 : 500,
    cursor: bloqueado ? 'not-allowed' : 'pointer',
    opacity: bloqueado ? 0.35 : 1,
    fontFamily: "'Archivo', sans-serif",
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }
}
