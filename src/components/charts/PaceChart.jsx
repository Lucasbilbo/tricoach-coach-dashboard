import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { COLORS, DISCIPLINE_COLORS } from '../../lib/theme'
import {
  formatFechaCorta,
  ritmoToDecimal,
  decimalToRitmo,
  mediaMovil,
  tickStyle,
  gridStroke,
  tooltipBoxStyle,
} from '../../lib/chartUtils'

const VENTANA_MEDIA = 3

function PaceTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const punto = payload[0].payload
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{punto.label}</p>
      <p style={{ margin: '2px 0' }}>
        {punto.distancia != null ? `${punto.distancia} km` : 'Distancia —'}
      </p>
      <p style={{ margin: '2px 0', color: DISCIPLINE_COLORS.run }}>
        Ritmo: {decimalToRitmo(punto.ritmo)} /km
      </p>
      <p style={{ margin: '2px 0', color: COLORS.textSecondary }}>
        FC media: {punto.fc != null ? `${punto.fc} ppm` : '—'}
      </p>
    </div>
  )
}

export default function PaceChart({ actividades }) {
  const runs = (actividades || [])
    .filter((a) => a.disciplina === 'run' && ritmoToDecimal(a.ritmo_min_km) != null)
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))

  if (runs.length === 0) return null

  const ritmos = runs.map((a) => ritmoToDecimal(a.ritmo_min_km))
  const medias = mediaMovil(ritmos, VENTANA_MEDIA)

  const data = runs.map((a, i) => ({
    label: formatFechaCorta(a.fecha),
    ritmo: ritmos[i],
    media: medias[i],
    distancia: a.distancia_km,
    fc: a.fc_media,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: COLORS.cardBorder }} tickLine={false} />
        <YAxis
          reversed
          domain={['dataMin - 0.25', 'dataMax + 0.25']}
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={decimalToRitmo}
          width={44}
        />
        <Tooltip content={<PaceTooltip />} cursor={{ stroke: COLORS.cardBorder }} />
        <Line
          dataKey="media"
          stroke={COLORS.accent}
          strokeWidth={2}
          dot={false}
          connectNulls
          name={`Media ${VENTANA_MEDIA} actividades`}
        />
        <Scatter dataKey="ritmo" fill={DISCIPLINE_COLORS.run} name="Ritmo" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
