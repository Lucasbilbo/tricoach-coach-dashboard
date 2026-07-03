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
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 8,
}

export const separadorSection = {
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  paddingBottom: 6,
  marginBottom: 12,
  marginTop: 4,
}
