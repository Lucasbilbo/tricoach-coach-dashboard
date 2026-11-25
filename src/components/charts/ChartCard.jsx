import { COLORS, cardStyle } from '../../lib/theme'

// flush: sin margen inferior (cuando la card va dentro de una rejilla con gap)
export default function ChartCard({ title, children, flush = false }) {
  return (
    <div style={{ ...cardStyle, marginBottom: flush ? 0 : 14, minWidth: 0 }}>
      <p
        style={{
          color: COLORS.textPrimary,
          fontSize: 17,
          marginTop: 0,
          marginBottom: 14,
          fontWeight: 700,
          fontStretch: '108%',
        }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}
