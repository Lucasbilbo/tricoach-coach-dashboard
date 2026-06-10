import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { COLORS } from '../../lib/theme'
import { tickStyle, gridStroke, tooltipBoxStyle } from '../../lib/chartUtils'

const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']
const ZONA_COLORS = ['#93C5FD', '#6EE7B7', '#FDE68A', '#FCA5A5', '#F87171']

function distribucionZonas(actividades) {
  const minutos = actividades.reduce((acc, act) => {
    if (!act.zona_fc || !act.duracion_min || !ZONAS.includes(act.zona_fc)) return acc
    return { ...acc, [act.zona_fc]: (acc[act.zona_fc] || 0) + act.duracion_min }
  }, {})

  const total = ZONAS.reduce((acc, z) => acc + (minutos[z] || 0), 0)
  if (total === 0) return []

  return ZONAS.map((zona, i) => ({
    zona,
    minutos: Math.round(minutos[zona] || 0),
    pct: Math.round(((minutos[zona] || 0) / total) * 100),
    color: ZONA_COLORS[i],
  }))
}

function ZonesTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const fila = payload[0].payload
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: 0, fontWeight: 600, color: fila.color }}>{fila.zona}</p>
      <p style={{ margin: '4px 0 0' }}>
        {fila.pct}% · {fila.minutos} min
      </p>
    </div>
  )
}

export default function ZonesChart({ actividades }) {
  const data = distribucionZonas(actividades || [])
  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid stroke={gridStroke} horizontal={false} />
        <XAxis
          type="number"
          tick={tickStyle}
          axisLine={{ stroke: COLORS.cardBorder }}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 'dataMax']}
        />
        <YAxis
          type="category"
          dataKey="zona"
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<ZonesTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={28}>
          {data.map((fila) => (
            <Cell key={fila.zona} fill={fila.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
