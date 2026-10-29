import { COLORS, FONTS, DISCIPLINE_COLORS, DISCIPLINE_LABELS } from '../../lib/theme'

// Línea de Transición — elemento de firma del sistema. Franja de barras apiladas
// por columna (día o semana), cada una segmentada por disciplina, con 3 estados
// distinguibles por relleno + borde (no solo color, por accesibilidad):
//   - completado: relleno sólido, sin borde
//   - programado: borde punteado en color de disciplina, relleno opacity 0.18
//   - descanso:   borde punteado gris (#2A3040), altura mínima, sin relleno
// Anima height/opacity con transition 180ms al cambiar de props (corto a propósito).
//
// Es de presentación pura: recibe `columns` ya normalizadas (las construye
// buildTransitionColumns en lib/athleteStats.js).

// Leyenda con las disciplinas que de verdad salen en las barras (fuerza
// incluida, que antes se pintaba en violeta sin explicar), con los nombres de
// la app ("Carrera", no "Running").
const ORDEN_LEYENDA = ['swim', 'bike', 'run', 'strength']
function leyendaDe(columns) {
  const hay = new Set(columns.flatMap((c) => c.segments.map((s) => s.disciplina).filter(Boolean)))
  return ORDEN_LEYENDA.filter((d) => hay.has(d)).map((d) => ({ label: DISCIPLINE_LABELS[d], color: DISCIPLINE_COLORS[d] }))
}

export default function TransitionLine({
  columns = [],
  titulo = 'Volumen por día y disciplina',
  barsHeight = 180,
  gap = 14,
  maxBarWidth = 52, // en móvil, pasar null para que la barra use el 100%
  barRadius = 6,
  showLegend = true,
  showStatusLabel = true,
  showLabels = true, // etiqueta de columna (día/semana) bajo la barra
  // Máximo de etiquetas bajo las barras. Con más columnas se pinta una de cada
  // N, contando desde la última (la semana en curso siempre lleva la suya), y
  // las horas por semana se ocultan. Antes, con 24 semanas en móvil, las
  // etiquetas no cabían y empujaban la página a 637 px de ancho; en escritorio
  // se partían en dos líneas y descuadraban las barras.
  maxLabels = 12,
  dowFontSize = 11,
  animate = true,
  bare = false, // sin card wrapper (para mini-indicadores dentro de otra card)
}) {
  const transitionBar = animate ? 'height 180ms ease' : 'none'
  const transitionSeg = animate ? 'height 180ms ease, opacity 180ms ease' : 'none'
  const leyenda = showLegend ? leyendaDe(columns) : []
  const mostrarHeader = !!titulo || leyenda.length > 0
  const paso = Math.max(1, Math.ceil(columns.length / Math.max(1, maxLabels)))
  const conEtiqueta = (i) => (columns.length - 1 - i) % paso === 0
  const conEstado = showStatusLabel && paso === 1

  return (
    <div style={bare ? undefined : { ...cardStyleLocal }}>
      {mostrarHeader && (
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
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
            {titulo}
          </span>
          {leyenda.length > 0 && (
            <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap' }}>
              {leyenda.map((l) => (
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
      )}

      <div
        role="img"
        aria-label={titulo}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns.length || 1}, minmax(0, 1fr))`,
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
            {showLabels && (
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: dowFontSize,
                  color: col.isToday ? COLORS.textPrimary : COLORS.textSecondary,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  lineHeight: 1.3,
                }}
              >
                {conEtiqueta(i) ? col.label : '\u00a0'}
              </div>
            )}
            {conEstado && showLabels && (
              <div style={{ fontSize: 10, color: COLORS.textTertiary, textAlign: 'center', lineHeight: 1.3, whiteSpace: 'nowrap' }}>
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
