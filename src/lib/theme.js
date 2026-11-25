// Design system del Coach Dashboard — única fuente de verdad para colores y estilos base.
// Nueva dirección visual (handoff aprobado 2026-07): sistema de color por disciplina
// sobre fondo Void, tipografía dual JetBrains Mono (números) + Archivo (UI).

export const FONTS = {
  // Rediseño 2026-11 (dirección A «Pulso»): los números van en Archivo con
  // cifras tabulares (font-variant-numeric global en index.css), no en mono.
  // La mono en todas partes daba aire de terminal. `mono` se mantiene como
  // nombre para no tocar 117 usos: hoy es la fuente de números.
  mono: "'Archivo Variable', 'Archivo', system-ui, sans-serif",
  // Texto de código: lo que se escribe tal cual (escritura rápida, texto
  // exacto que llega al reloj). Solo ahí JetBrains Mono.
  code: "'JetBrains Mono', ui-monospace, monospace",
  sans: "'Archivo Variable', 'Archivo', system-ui, sans-serif",
}

// Títulos anchos: Archivo variable estirado. Es la voz de la marca en los
// titulares (nombre del entreno, del atleta, de la página).
export const displayStyle = {
  fontFamily: FONTS.sans,
  fontWeight: 800,
  fontStretch: '118%',
  letterSpacing: '-0.02em',
  lineHeight: 1,
}

export const COLORS = {
  background: '#0A0C11', // Void — fondo de la vista
  card: '#12151C', // Slate — superficie de cards
  raised: '#1A1E27', // Superficie elevada: botones secundarios, controles
  sunken: '#0E1117', // Hundido: inputs y bloques dentro de una tarjeta
  cardBorder: '#1B202C', // Separadores y bordes finos
  highlight: 'rgba(255,255,255,0.06)', // Luz del borde superior de las superficies
  accent: '#2FBFAF', // Swim teal — acento de marca (acción principal)
  onAccent: '#06231F', // Texto sobre el teal relleno (11:1)
  textPrimary: '#EDEEF2', // Ink — texto primario, números neutros
  textSecondary: '#8A90A0', // Mist — texto secundario, labels
  // Mist oscuro — texto terciario (subetiquetas). #7A808F = 4.6:1 sobre Slate y
  // 4.9:1 sobre Void (AA texto pequeño); antes #5C6270 daba 3.0:1 y no pasaba.
  textTertiary: '#7A808F',
  textSoft: '#C9CCD6', // Entre Ink y Mist: texto de apoyo legible en tarjetas
  load: '#8B7FD1', // Load · Dusk Violet — TSS/carga (no es una disciplina)
  loadText: '#A79DE6', // Violeta de carga para NÚMEROS sobre fondo oscuro (6.9:1)
  restBorder: '#2A3040', // Borde punteado de días de descanso
  error: '#E85D5D', // Run coral — reutilizado como color de error
  warning: '#E8B84A', // Ámbar de aviso (NO el de bici, #E8934A)
}

export const DISCIPLINE_COLORS = {
  swim: '#2FBFAF', // Neritic Teal
  bike: '#E8934A', // Asphalt Amber
  run: '#E85D5D', // Exertion Coral
  strength: '#8B7FD1', // Load violet (fuerza no es disciplina de triatlón)
  other: '#5C6270', // Mist oscuro
  rest: '#3A4152', // día de descanso: neutro, sin protagonismo
}

export const DISCIPLINE_LABELS = {
  run: 'Carrera',
  bike: 'Ciclismo',
  swim: 'Natación',
  strength: 'Fuerza',
  other: 'Otro',
  rest: 'Descanso',
}

// Superficie con luz en el borde superior en vez de borde gris: da
// profundidad sin dibujar cajas. Si una tarjeta lleva railStyle, el filo
// sustituye a la luz (ambos van en boxShadow).
export const cardStyle = {
  background: COLORS.card,
  border: '1px solid rgba(255,255,255,0.035)',
  boxShadow: `inset 0 1px 0 ${COLORS.highlight}`,
  borderRadius: 20,
  padding: 20,
}

export const pageStyle = {
  minHeight: '100vh',
  background: COLORS.background,
  color: COLORS.textPrimary,
  fontFamily: FONTS.sans,
  // Abajo deja sitio para la barra de pestañas flotante del móvil.
  padding: '20px clamp(16px, 4vw, 32px) calc(110px + env(safe-area-inset-bottom))',
}

// 16 px mínimo: por debajo, Safari en iPhone hace zoom al enfocar el campo.
export const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: COLORS.sunken,
  border: '1px solid #232836',
  borderRadius: 12,
  padding: '11px 14px',
  minHeight: 46,
  color: COLORS.textPrimary,
  fontSize: 16,
  fontFamily: FONTS.sans,
  outline: 'none',
}

// Acción principal: píldora teal rellena con texto oscuro. Una por pantalla.
export const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  background: COLORS.accent,
  color: COLORS.onAccent,
  border: 'none',
  borderRadius: 999,
  padding: '0 20px',
  minHeight: 44,
  fontSize: 15,
  fontWeight: 700,
  fontFamily: FONTS.sans,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

// ── Sistema de UI ─────────────────────────────────────────────────────────
// Radios por jerarquía: controles pequeños, tarjetas, contenedores grandes.
export const RADIUS = { sm: 10, md: 14, lg: 20, pill: 999 }

// Filo de color por disciplina: el sello visual del panel. Se usa igual en
// sesiones, actividades y pruebas de la temporada. Desde el rediseño
// 2026-11 es una marca vertical DENTRO de la superficie (antes una sombra
// inset en el borde, que en tarjetas de radio 20 se curvaba como un
// paréntesis). Va en background-image: si el componente cambia el fondo al
// pasar el ratón, que use backgroundColor (el shorthand `background` borra
// la marca).
export function railStyle(disciplina, grosor = 3) {
  const c = DISCIPLINE_COLORS[disciplina] || DISCIPLINE_COLORS.other
  return {
    backgroundImage: `linear-gradient(${c}, ${c})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${grosor}px calc(100% - 32px)`,
    backgroundPosition: '9px 16px',
  }
}

// Secundario: píldora en superficie elevada, sin borde.
export const ghostButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  background: COLORS.raised,
  color: COLORS.textPrimary,
  border: 'none',
  borderRadius: 999,
  padding: '0 18px',
  minHeight: 44,
  fontSize: 15,
  fontWeight: 600,
  fontFamily: FONTS.sans,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

// Botón de icono: círculo de 44 px (objetivo táctil de Apple).
export const iconButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  borderRadius: 999,
  background: '#161A22',
  border: 'none',
  color: COLORS.textSoft,
  cursor: 'pointer',
  flexShrink: 0,
}

// Título de sección en frase normal (nada de MAYÚSCULAS espaciadas), algo
// ancho para que se distinga del texto sin necesitar tamaño.
export const sectionTitleStyle = {
  margin: '0 0 12px',
  fontSize: 20,
  fontWeight: 700,
  fontStretch: '110%',
  letterSpacing: '-0.01em',
  color: COLORS.textPrimary,
}

// Número grande de métrica: Archivo con cifras tabulares.
export const metricNumberStyle = {
  fontFamily: FONTS.mono,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.01em',
  lineHeight: 1.05,
  fontWeight: 700,
}
