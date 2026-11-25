import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, displayStyle, sectionTitleStyle, metricNumberStyle } from '../../lib/theme'
import { useIsMobile } from '../../hooks/useIsMobile'
import Icon from './Icon'

// Piezas de maquetación compartidas por todas las pantallas.

// Símbolo de la marca: las tres disciplinas como trazos — el agua (ola), la
// bici (línea continua) y la carrera (zancadas, discontinua).
export function BrandMark({ size = 26 }) {
  return (
    <svg width={size} height={Math.round(size * 0.7)} viewBox="0 0 26 18" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      <path d="M2 4c3-3 5 3 8 0s5 3 8 0 4 2 6 0" stroke={DISCIPLINE_COLORS.swim} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M2 10h22" stroke={DISCIPLINE_COLORS.bike} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M2 16h22" stroke={DISCIPLINE_COLORS.run} strokeWidth="2.4" strokeLinecap="round" strokeDasharray="5 4" />
    </svg>
  )
}

// Marca: símbolo + nombre (o, con `sub`, símbolo + texto de contexto, p. ej. la fecha).
export function Brand({ sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <BrandMark />
      {sub ? (
        <span style={{ fontSize: 15, color: COLORS.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
      ) : (
        <span style={{ fontSize: 16, fontWeight: 800, fontStretch: '112%', letterSpacing: '-0.01em', color: COLORS.textPrimary }}>GetRiCoach</span>
      )}
    </div>
  )
}

// Cabecera de página: fila de marca (con volver opcional y acciones) y título
// ancho (displayStyle). `title` es opcional: /home abre directamente con el
// entreno de hoy.
export function PageHeader({ onBack, backLabel = 'Volver', brandSub, title, subtitle, actions, topActions }) {
  return (
    <header style={{ marginBottom: title ? 24 : 18, paddingTop: 'env(safe-area-inset-top)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, marginBottom: title ? 16 : 0 }}>
        {onBack ? (
          <button
            onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: COLORS.textSecondary, fontSize: 15, cursor: 'pointer', padding: '10px 8px 10px 0', minHeight: 44 }}
          >
            <Icon name="back" size={18} />
            {backLabel}
          </button>
        ) : (
          <Brand sub={brandSub} />
        )}
        {topActions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{topActions}</div>}
      </div>
      {title && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: '1 1 220px' }}>
            <h1 style={{ ...displayStyle, margin: 0, fontSize: 'clamp(36px, 10vw, 48px)', color: COLORS.textPrimary, overflowWrap: 'anywhere' }}>
              {title}
            </h1>
            {subtitle && <p style={{ margin: '10px 0 0', fontSize: 16, lineHeight: 1.4, color: COLORS.textSecondary }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
    </header>
  )
}

// Pestañas. En el móvil, barra flotante ABAJO (donde llega el pulgar; antes
// arriba, fijas al hacer scroll). En tablet y escritorio, grupo de píldoras
// fijo arriba. Al cambiar de pestaña en el móvil se vuelve arriba: la barra
// está siempre a mano y si no, aterrizas a media página de la otra pestaña.
// pageStyle deja sitio abajo para la barra.
export function Tabs({ tabs, active, onChange }) {
  const movil = useIsMobile(700)
  const cambiar = (clave) => {
    if (clave !== active && movil && typeof window !== 'undefined') window.scrollTo(0, 0)
    onChange(clave)
  }
  if (movil) {
    return (
      <nav
        role="tablist"
        aria-label="Secciones"
        style={{
          position: 'fixed',
          left: 12,
          right: 12,
          bottom: 'calc(12px + env(safe-area-inset-bottom))',
          zIndex: 40,
          height: 64,
          padding: 5,
          boxSizing: 'border-box',
          display: 'grid',
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          gap: 2,
          borderRadius: 32,
          background: 'rgba(24,28,37,0.86)',
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
          boxShadow: `0 12px 32px rgba(0,0,0,0.55), inset 0 1px 0 ${COLORS.highlight}`,
        }}
      >
        {tabs.map((t) => {
          const sel = t.clave === active
          return (
            <button
              key={t.clave}
              role="tab"
              aria-selected={sel}
              onClick={() => cambiar(t.clave)}
              style={{
                border: 'none',
                borderRadius: 27,
                background: sel ? COLORS.textPrimary : 'transparent',
                color: sel ? COLORS.background : COLORS.textSecondary,
                fontSize: 14,
                fontWeight: sel ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                padding: '0 4px',
              }}
            >
              {t.etiqueta}
            </button>
          )
        })}
      </nav>
    )
  }
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, margin: '0 -4px 24px', padding: '10px 4px', background: 'rgba(10,12,17,0.88)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
      <nav role="tablist" aria-label="Secciones" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 26, background: COLORS.card, boxShadow: `inset 0 1px 0 ${COLORS.highlight}` }}>
        {tabs.map((t) => {
          const sel = t.clave === active
          return (
            <button
              key={t.clave}
              role="tab"
              aria-selected={sel}
              onClick={() => cambiar(t.clave)}
              style={{
                border: 'none',
                borderRadius: 22,
                minHeight: 40,
                padding: '0 18px',
                background: sel ? COLORS.textPrimary : 'transparent',
                color: sel ? COLORS.background : COLORS.textSecondary,
                fontSize: 15,
                fontWeight: sel ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.etiqueta}
            </button>
          )
        })}
      </nav>
    </div>
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

// Número + unidad para métricas: el número grande, la unidad pequeña. Los
// números van con coma decimal (63,2 km, no 63.2).
export function Metric({ value, unit, label, color }) {
  if (typeof value === 'number') value = value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...metricNumberStyle, fontSize: 26, color: color || COLORS.textPrimary, whiteSpace: 'nowrap' }}>
        {value ?? '—'}
        {unit && value != null && <span style={{ fontSize: 14, fontWeight: 400, color: COLORS.textSecondary, marginLeft: 4 }}>{unit}</span>}
      </div>
      {label && <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>{label}</div>}
    </div>
  )
}

// Control segmentado compacto (p. ej. selector de semanas).
export function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ display: 'inline-flex', padding: 4, gap: 2, borderRadius: 22, background: COLORS.card, boxShadow: `inset 0 1px 0 ${COLORS.highlight}`, maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none' }}
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
              borderRadius: 18,
              padding: '0 14px',
              minHeight: 36,
              fontSize: 14,
              fontWeight: sel ? 700 : 500,
              background: sel ? 'rgba(237,238,242,0.12)' : 'transparent',
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
