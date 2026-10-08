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
import { COLORS, DISCIPLINE_COLORS, FONTS } from '../../lib/theme'
import {
  formatFechaCorta,
  mediaMovil,
  tickStyle,
  gridStroke,
  tooltipBoxStyle,
} from '../../lib/chartUtils'

// Puntos: cada salida en ámbar de bici. Línea: media móvil en gris (contexto),
// no en teal (el teal es natación).
const MINIMO_ACTIVIDADES = 3
const VENTANA_MEDIA = 3

// Eje Y con marcas equiespaciadas y redondas (paso 5/10/20/25/50 W), con aire
// arriba y abajo de los datos.
function ejeRedondo(valores) {
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const bruto = Math.max(max - min, 20) / 4
  const paso = [5, 10, 20, 25, 50, 100].find((p) => p >= bruto) || 100
  const desde = Math.floor((min - paso / 2) / paso) * paso
  const hasta = Math.ceil((max + paso / 2) / paso) * paso
  const ticks = []
  for (let v = desde; v <= hasta; v += paso) ticks.push(v)
  return { min: desde, max: hasta, ticks }
}

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

  const eje = ejeRedondo(potencias)

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, marginBottom: 10, color: COLORS.textSecondary }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: DISCIPLINE_COLORS.bike }} />
          Potencia media por salida
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, borderRadius: 1, background: COLORS.textSecondary }} />
          Media de {VENTANA_MEDIA} salidas
        </span>
      </div>
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: COLORS.cardBorder }} tickLine={false} />
        <YAxis
          domain={[eje.min, eje.max]}
          ticks={eje.ticks}
          axisLine={false}
          tickLine={false}
          tick={{ ...tickStyle, fontFamily: FONTS.mono }}
          tickFormatter={(v) => `${Math.round(v)} W`}
          width={52}
        />
        <Tooltip content={<PowerTooltip />} cursor={{ stroke: COLORS.cardBorder }} />
        <Line
          dataKey="media"
          stroke={COLORS.textSecondary}
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
          name={`Media ${VENTANA_MEDIA} actividades`}
        />
        <Scatter
          dataKey="potencia"
          fill={DISCIPLINE_COLORS.bike}
          name="Potencia"
          shape={(p) => <circle cx={p.cx} cy={p.cy} r={4.5} fill={DISCIPLINE_COLORS.bike} stroke={COLORS.card} strokeWidth={2} />}
        />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  )
}
