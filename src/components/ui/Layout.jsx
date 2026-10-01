import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS, sectionTitleStyle } from '../../lib/theme'
import Icon from './Icon'

// Piezas de maquetación compartidas por todas las pantallas.

// Marca: tres trazos (natación, bici, carrera) + nombre. Una sola en toda la app.
export function Brand({ size = 13, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span aria-hidden="true" style={{ display: 'flex', gap: 2 }}>
        {['swim', 'bike', 'run'].map((d) => (
          <span key={d} style={{ width: 4, height: size, borderRadius: 2, background: DISCIPLINE_COLORS[d] }} />
        ))}
      </span>
      <span style={{ fontSize: size, fontWeight: 600, color: COLORS.textPrimary, letterSpacing: '0.01em' }}>
        GetRiCoach
      </span>
      {sub && (
        <span style={{ fontSize: size, color: COLORS.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </span>
      )}
    </div>
  )
}

// Cabecera de página: fila de marca (con volver opcional y acciones) y título.
export function PageHeader({ onBack, backLabel = 'Volver', brandSub, title, subtitle, actions, topActions }) {
  return (
    <header style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36, marginBottom: 14 }}>
        {onBack ? (
          <button
            onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: COLORS.textSecondary, fontSize: 14, cursor: 'pointer', padding: '6px 6px 6px 0' }}
          >
            <Icon name="back" size={18} />
            {backLabel}
          </button>
        ) : (
          <Brand sub={brandSub} />
        )}
        {topActions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{topActions}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
          <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.015em', color: COLORS.textPrimary, overflowWrap: 'anywhere' }}>
            {title}
          </h1>
          {subtitle && <p style={{ margin: '6px 0 0', fontSize: 14, color: COLORS.textSecondary }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </header>
  )
}

// Pestañas fijas arriba al hacer scroll. Etiquetas cortas: nunca dos líneas.
export function Tabs({ tabs, active, onChange }) {
  return (
    <nav
      role="tablist"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        display: 'flex',
        gap: 2,
        margin: '0 0 20px',
        background: 'rgba(11,13,18,0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${COLORS.cardBorder}`,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((t) => {
        const sel = t.clave === active
        return (
          <button
            key={t.clave}
            role="tab"
            aria-selected={sel}
            onClick={() => onChange(t.clave)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${sel ? COLORS.accent : 'transparent'}`,
              color: sel ? COLORS.textPrimary : COLORS.textSecondary,
              padding: '13px 12px 11px',
              fontSize: 15,
              fontWeight: sel ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.etiqueta}
          </button>
        )
      })}
    </nav>
  )
}

export function SectionTitle({ children, aside, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, ...style }}>
      <h2 style={sectionTitleStyle}>{children}</h2>
      {aside && <div style={{ fontSize: 13, color: COLORS.textSecondary }}>{aside}</div>}
    </div>
  )
}

// Deporte como texto discreto con su punto de color (sin pastilla rellena).
export function DisciplineTag({ disciplina, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: DISCIPLINE_COLORS[disciplina] || DISCIPLINE_COLORS.other }} />
      {label || DISCIPLINE_LABELS[disciplina] || 'Otro'}
    </span>
  )
}

// Número + unidad para métricas: el número en mono, la unidad pequeña.
export function Metric({ value, unit, label, color }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: FONTS.mono, fontSize: 22, fontWeight: 600, color: color || COLORS.textPrimary, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
        {value ?? '—'}
        {unit && value != null && <span style={{ fontSize: 12, fontWeight: 400, color: COLORS.textSecondary, marginLeft: 3 }}>{unit}</span>}
      </div>
      {label && <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>{label}</div>}
    </div>
  )
}

// Control segmentado compacto (p. ej. selector de semanas).
export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', padding: 3, gap: 2, borderRadius: 10, background: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {options.map((o) => {
        const sel = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none',
              borderRadius: 7,
              padding: '6px 11px',
              fontSize: 13,
              fontWeight: sel ? 600 : 500,
              background: sel ? 'rgba(237,238,242,0.1)' : 'transparent',
              color: sel ? COLORS.textPrimary : COLORS.textSecondary,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
