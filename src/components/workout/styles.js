// Estilos base del WorkoutBuilder (C3: extraídos para compartir entre el
// componente principal y sus sub-componentes de bloque).
import { COLORS } from '../../lib/theme'

export const labelSm = {
  display: 'block',
  fontSize: 13,
  color: COLORS.textSecondary,
  marginBottom: 3,
}

export const miniBtn = {
  background: 'transparent',
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 10,
  color: COLORS.textSecondary,
  padding: '6px 10px',
  minHeight: 36,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif",
}

export const addBtnStyle = {
  background: 'transparent',
  border: `1.5px dashed rgba(255,255,255,0.16)`,
  borderRadius: 14,
  color: COLORS.textSoft,
  padding: '0 12px',
  minHeight: 48,
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif",
  width: '100%',
}

export const sectionLabel = {
  display: 'block',
  fontSize: 15,
  fontWeight: 700,
  color: COLORS.textPrimary,
  marginBottom: 10,
}

export const separadorSection = {
  fontSize: 18,
  fontWeight: 750,
  fontStretch: '108%',
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
    borderRadius: 999,
    padding: '0 16px',
    minHeight: 42,
    boxSizing: 'border-box',
    fontSize: 15,
    fontWeight: sel ? 600 : 500,
    cursor: bloqueado ? 'not-allowed' : 'pointer',
    opacity: bloqueado ? 0.35 : 1,
    fontFamily: mono ? "'JetBrains Mono', monospace" : "'Archivo Variable', 'Archivo', system-ui, sans-serif",
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
    borderRadius: 999,
    padding: '0 16px',
    minHeight: 42,
    boxSizing: 'border-box',
    fontSize: 15,
    fontWeight: sel ? 600 : 500,
    cursor: bloqueado ? 'not-allowed' : 'pointer',
    opacity: bloqueado ? 0.35 : 1,
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif",
    whiteSpace: 'nowrap',
    flexShrink: 0,
  }
}
