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
  padding: '20px clamp(16px, 4vw, 32px) 64px',
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

// ── Sistema de UI (2026-10) ───────────────────────────────────────────────
// Radios por jerarquía: controles pequeños, tarjetas, contenedores grandes.
export const RADIUS = { sm: 6, md: 10, lg: 14 }

// Filo de color por disciplina: el sello visual del panel. Se usa igual en
// sesiones, actividades y pruebas de la temporada.
export function railStyle(disciplina, grosor = 3) {
  return { boxShadow: `inset ${grosor}px 0 0 ${DISCIPLINE_COLORS[disciplina] || DISCIPLINE_COLORS.other}` }
}

export const ghostButtonStyle = {
  ...buttonStyle,
  background: 'transparent',
  color: COLORS.textPrimary,
  border: `1px solid ${COLORS.cardBorder}`,
  fontWeight: 500,
}

export const iconButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
  borderRadius: 8,
  background: 'transparent',
  border: `1px solid ${COLORS.cardBorder}`,
  color: COLORS.textSecondary,
  cursor: 'pointer',
  flexShrink: 0,
}

// Título de sección: frase normal, sin mayúsculas forzadas.
export const sectionTitleStyle = {
  margin: '0 0 12px',
  fontSize: 15,
  fontWeight: 600,
  color: COLORS.textPrimary,
  letterSpacing: 0,
}
