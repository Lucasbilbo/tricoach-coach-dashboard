import { COLORS, FONTS, DISCIPLINE_COLORS } from '../../lib/theme'

// Línea de Transición — elemento de firma del sistema. Franja de barras apiladas
// por columna (día o semana), cada una segmentada por disciplina, con 3 estados
// distinguibles por relleno + borde (no solo color, por accesibilidad):
//   - completado: relleno sólido, sin borde
//   - programado: borde punteado en color de disciplina, relleno opacity 0.18
//   - descanso:   borde punteado gris (#2A3040), altura mínima, sin relleno
// Anima height/opacity con transition 180ms al cambiar de props (corto a propósito).
//
// Es de presentación pura: recibe `columns` ya normalizadas. Construye las
// columnas con los helpers de lib/transitionColumns.js.

const LEYENDA = [
  { label: 'Natación', color: DISCIPLINE_COLORS.swim },
  { label: 'Ciclismo', color: DISCIPLINE_COLORS.bike },
  { label: 'Running', color: DISCIPLINE_COLORS.run },
]

export default function TransitionLine({
  columns = [],
  titulo = 'LÍNEA DE TRANSICIÓN — volumen y disciplina por día',
  barsHeight = 180,
  gap = 14,
  maxBarWidth = 52, // en móvil, pasar null para que la barra use el 100%
  barRadius = 6,
  showLegend = true,
  showStatusLabel = true,
  dowFontSize = 11,
  animate = true,
}) {
  const transitionBar = animate ? 'height 180ms ease' : 'none'
  const transitionSeg = animate ? 'height 180ms ease, opacity 180ms ease' : 'none'

  return (
    <div style={{ ...cardStyleLocal }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 18,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, color: COLORS.textSecondary, letterSpacing: '0.03em' }}>
          {titulo}
        </span>
        {showLegend && (
          <div style={{ display: 'flex', gap: 16 }}>
            {LEYENDA.map((l) => (
              <span
                key={l.label}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: COLORS.textSecondary }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, display: 'inline-block' }} />
                {l.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div
        role="img"
        aria-label={titulo}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns.length || 1}, 1fr)`,
          gap,
          alignItems: 'end',
          height: barsHeight,
        }}
      >
        {columns.map((col, i) => (
          <div
            key={col.label != null ? `${col.label}-${i}` : i}
            title={`${col.label}${col.statusLabel ? ' · ' + col.statusLabel : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-end',
              height: '100%',
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column-reverse',
                width: '100%',
                ...(maxBarWidth ? { maxWidth: maxBarWidth } : {}),
                height: `${col.heightPct}%`,
                borderRadius: barRadius,
                overflow: 'hidden',
                borderStyle: col.borderStyle,
                borderWidth: col.borderWidth,
                borderColor: col.borderColor,
                transition: transitionBar,
              }}
            >
              {col.segments.map((seg, si) => (
                <div
                  key={si}
                  style={{
                    width: '100%',
                    height: `${seg.pct}%`,
                    background: seg.color,
                    opacity: seg.opacity,
                    transition: transitionSeg,
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontSize: dowFontSize,
                color: col.isToday ? COLORS.textPrimary : COLORS.textSecondary,
                textAlign: 'center',
              }}
            >
              {col.label}
            </div>
            {showStatusLabel && (
              <div style={{ fontSize: 10, color: COLORS.textTertiary, textAlign: 'center', lineHeight: 1.3 }}>
                {col.statusLabel}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const cardStyleLocal = {
  background: COLORS.card,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 12,
  padding: '24px 24px 18px',
}
