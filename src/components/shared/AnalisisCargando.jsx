import { COLORS, cardStyle } from '../../lib/theme'
import { useIsMobile } from '../../hooks/useIsMobile'

// Esqueleto del análisis mientras llegan los datos de Strava (1–4 s): misma
// rejilla que StravaAnalysis (4 tarjetas + forma/carga) para que la página no
// salte al pintarse. Antes era una línea de texto arriba del todo.
const bloque = { background: 'rgba(237,238,242,0.05)', borderRadius: 6 }

export default function AnalisisCargando() {
  const isMobile = useIsMobile()
  return (
    <div role="status" aria-live="polite" aria-label="Cargando el análisis">
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: isMobile ? 10 : 12, padding: isMobile ? 14 : '16px 20px', height: isMobile ? 82 : 110, boxSizing: 'border-box' }}>
            <div style={{ ...bloque, width: '45%', height: 10 }} />
            <div style={{ ...bloque, width: '65%', height: isMobile ? 18 : 24, marginTop: 10 }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: isMobile ? 14 : 16 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ ...cardStyle, height: 300, boxSizing: 'border-box' }}>
            <div style={{ ...bloque, width: '40%', height: 12 }} />
            <div style={{ ...bloque, height: 200, marginTop: 24 }} />
          </div>
        ))}
      </div>
      <p style={{ margin: '14px 2px 0', fontSize: 12.5, color: COLORS.textTertiary }}>Leyendo las actividades de Strava…</p>
    </div>
  )
}
