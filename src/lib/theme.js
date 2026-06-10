// Design system del Coach Dashboard — única fuente de verdad para colores y estilos base

export const COLORS = {
  background: '#0A0F1E',
  card: '#0F1729',
  cardBorder: 'rgba(255,255,255,0.06)',
  accent: '#00D4FF',
  textPrimary: '#F1F5F9',
  textSecondary: '#64748B',
  error: '#FF4D6D',
}

export const DISCIPLINE_COLORS = {
  run: '#FF4D6D',
  bike: '#00E5A0',
  swim: '#00D4FF',
  strength: '#7C3AED',
  other: '#64748B',
}

export const DISCIPLINE_LABELS = {
  run: 'Carrera',
  bike: 'Ciclismo',
  swim: 'Natación',
  strength: 'Fuerza',
  other: 'Otro',
}

export const cardStyle = {
  background: COLORS.card,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 12,
  padding: 20,
}

export const pageStyle = {
  minHeight: '100vh',
  background: COLORS.background,
  color: COLORS.textPrimary,
  fontFamily: "'Inter', sans-serif",
  padding: 24,
}

export const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: COLORS.background,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: COLORS.textPrimary,
  fontSize: 14,
  fontFamily: "'Inter', sans-serif",
  outline: 'none',
}

export const buttonStyle = {
  background: COLORS.accent,
  color: COLORS.background,
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "'Inter', sans-serif",
  cursor: 'pointer',
}
