import { COLORS, cardStyle } from '../../lib/theme'

// flush: sin margen inferior (cuando la card va dentro de una rejilla con gap)
export default function ChartCard({ title, children, flush = false }) {
  return (
    <div style={{ ...cardStyle, marginBottom: flush ? 0 : 14, minWidth: 0 }}>
      <p
        style={{
          color: COLORS.textPrimary,
          fontSize: 14,
          marginTop: 0,
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}
