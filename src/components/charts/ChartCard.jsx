import { COLORS, cardStyle } from '../../lib/theme'

export default function ChartCard({ title, children }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 14 }}>
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
