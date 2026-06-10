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
  mediaMovil,
  tickStyle,
  gridStroke,
  tooltipBoxStyle,
} from '../../lib/chartUtils'

const MINIMO_ACTIVIDADES = 3
const VENTANA_MEDIA = 3

function PowerTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const punto = payload[0].payload
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{punto.label}</p>
      <p style={{ margin: '2px 0' }}>
        {punto.distancia != null ? `${punto.distancia} km` : 'Distancia —'}
      </p>
      <p style={{ margin: '2px 0', color: DISCIPLINE_COLORS.bike }}>
        Potencia media: {punto.potencia} W
      </p>
      <p style={{ margin: '2px 0', color: COLORS.textSecondary }}>
        FC media: {punto.fc != null ? `${punto.fc} ppm` : '—'}
      </p>
    </div>
  )
}

export default function PowerChart({ actividades }) {
  const bikes = (actividades || [])
    .filter((a) => a.disciplina === 'bike' && a.potencia_media != null)
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))

  if (bikes.length < MINIMO_ACTIVIDADES) return null

  const potencias = bikes.map((a) => a.potencia_media)
  const medias = mediaMovil(potencias, VENTANA_MEDIA)

  const data = bikes.map((a, i) => ({
    label: formatFechaCorta(a.fecha),
    potencia: potencias[i],
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
          domain={['dataMin - 10', 'dataMax + 10']}
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${Math.round(v)} W`}
          width={52}
        />
        <Tooltip content={<PowerTooltip />} cursor={{ stroke: COLORS.cardBorder }} />
        <Line
          dataKey="media"
          stroke={COLORS.accent}
          strokeWidth={2}
          dot={false}
          connectNulls
          name={`Media ${VENTANA_MEDIA} actividades`}
        />
        <Scatter dataKey="potencia" fill={DISCIPLINE_COLORS.bike} name="Potencia" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
