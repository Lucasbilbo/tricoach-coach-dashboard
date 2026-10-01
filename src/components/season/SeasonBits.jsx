import { COLORS, FONTS } from '../../lib/theme'
import { COLOR_AVISO, DEPORTES, ESTADOS, TRI_GRADIENT } from '../../lib/season'

// Piezas visuales pequeñas de la Temporada.

export function SportDot({ deporte, size = 10, ring = false }) {
  const color = DEPORTES[deporte]?.color || DEPORTES.other.color
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: deporte === 'tri' ? TRI_GRADIENT : color,
        flexShrink: 0,
        boxShadow: ring ? `0 0 0 2px ${COLORS.card}, 0 0 0 3.5px ${COLORS.textPrimary}` : 'none',
      }}
    />
  )
}

export function EstadoPill({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.candidata
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        padding: '3px 8px',
        borderRadius: 999,
        color: e.color,
        background: e.fondo,
        border: `1px ${estado === 'candidata' ? 'dashed' : 'solid'} ${e.borde}`,
        whiteSpace: 'nowrap',
      }}
    >
      {e.label}
    </span>
  )
}

export function PrioridadBadge({ prioridad }) {
  if (!prioridad) return null
  const esA = prioridad === 'A'
  return (
    <span
      title={`Prioridad ${prioridad}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 6,
        fontFamily: FONTS.mono,
        fontSize: 12,
        fontWeight: 700,
        color: esA ? COLORS.background : COLORS.textPrimary,
        background: esA ? COLORS.textPrimary : 'transparent',
        border: `1px solid ${esA ? COLORS.textPrimary : COLORS.restBorder}`,
        flexShrink: 0,
      }}
    >
      {prioridad}
    </span>
  )
}

export function Chip({ activo, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={activo}
      style={{
        background: activo ? 'rgba(237,238,242,0.1)' : 'transparent',
        color: activo ? COLORS.textPrimary : COLORS.textSecondary,
        border: `1px solid ${activo ? 'rgba(237,238,242,0.25)' : COLORS.cardBorder}`,
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: FONTS.sans,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {children}
    </button>
  )
}



// Filo vertical de color del deporte (triatlón: las tres disciplinas).
export function SportRail({ deporte }) {
  const fondo =
    deporte === 'tri'
      ? 'linear-gradient(#2FBFAF 0 33%, #E8934A 33% 66%, #E85D5D 66%)'
      : DEPORTES[deporte]?.color || DEPORTES.other.color
  return <span aria-hidden="true" style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: fondo, flexShrink: 0 }} />
}

export function IconoAviso({ color = COLOR_AVISO }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  )
}
