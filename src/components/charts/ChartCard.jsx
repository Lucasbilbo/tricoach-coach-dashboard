import { COLORS, cardStyle } from '../../lib/theme'

export default function ChartCard({ title, children }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 24 }}>
      <p
        style={{
          color: COLORS.textSecondary,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginTop: 0,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}
