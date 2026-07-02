// Design system del Coach Dashboard — única fuente de verdad para colores y estilos base.
// Nueva dirección visual (handoff aprobado 2026-07): sistema de color por disciplina
// sobre fondo Void, tipografía dual JetBrains Mono (números) + Archivo (UI).

export const FONTS = {
  // JetBrains Mono para TODO valor numérico (km, ritmo, TSS, potencia, FC, fechas):
  // tabular figures, referencia a reloj GPS/ciclocomputador.
  mono: "'JetBrains Mono', monospace",
  // Archivo para UI (nombres, labels, texto de sesión, botones).
  sans: "'Archivo', sans-serif",
}

export const COLORS = {
  background: '#0B0D12', // Void — fondo de la vista
  card: '#12151C', // Slate — superficie de cards
  cardBorder: '#1B202C', // Border — bordes de cards, separadores
  accent: '#2FBFAF', // Swim teal — acento de marca (el punto de firma)
  textPrimary: '#EDEEF2', // Ink — texto primario, números neutros
  textSecondary: '#8A90A0', // Mist — texto secundario, labels
  textTertiary: '#5C6270', // Mist oscuro — texto terciario (subetiquetas)
  load: '#8B7FD1', // Load · Dusk Violet — TSS/carga (no es una disciplina)
  restBorder: '#2A3040', // Borde punteado de días de descanso
  error: '#E85D5D', // Run coral — reutilizado como color de error
}

export const DISCIPLINE_COLORS = {
  swim: '#2FBFAF', // Neritic Teal
  bike: '#E8934A', // Asphalt Amber
  run: '#E85D5D', // Exertion Coral
  strength: '#8B7FD1', // Load violet (fuerza no es disciplina de triatlón)
  other: '#5C6270', // Mist oscuro
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
  fontFamily: FONTS.sans,
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
  fontFamily: FONTS.sans,
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
  fontFamily: FONTS.sans,
  cursor: 'pointer',
}
