import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { COLORS, DISCIPLINE_COLORS } from '../../lib/theme'
import { formatFechaCorta, tickStyle, gridStroke, tooltipBoxStyle, sumarDias, hoyMadrid } from '../../lib/chartUtils'
import { computeCargaDiaria } from '../../lib/carga'

const SEMANAS_MINIMAS_LINEAS = 8

const ATL_COLOR = '#2FBFAF' // Swim teal (fatiga aguda)
const CTL_COLOR = '#E8934A' // Bike amber (fitness crónico)
const BAR_COLOR = DISCIPLINE_COLORS.strength // Load violet (TSS)

function TSSTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  const punto = payload[0].payload
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Semana del {label}</p>
      <p style={{ margin: '2px 0', color: BAR_COLOR }}>TSS: {Math.round(punto.tss_total || 0)}</p>
      {punto.atl != null && (
        <p style={{ margin: '2px 0', color: ATL_COLOR }}>ATL: {Math.round(punto.atl)}</p>
      )}
      {punto.ctl != null && (
        <p style={{ margin: '2px 0', color: CTL_COLOR }}>CTL: {Math.round(punto.ctl)}</p>
      )}
    </div>
  )
}

export default function TSSChart({ actividades, actividadesCarga, semanas }) {
  if (!semanas || semanas.length === 0) return null

  const mostrarLineas = semanas.length >= SEMANAS_MINIMAS_LINEAS

  // EWMA 7/42 anclada a hoy (Europe/Madrid): la carga decae hasta hoy aunque la
  // última actividad sea anterior. Se calienta con la serie larga (26 semanas)
  // si el padre la pasa; el selector solo recorta las barras, no el cálculo.
  // Cada semana toma el valor de su domingo (o el último día si aún no llegó).
  let cargaPorFecha = {}
  let ultimoDia = null
  if (mostrarLineas) {
    const cargaDiaria = computeCargaDiaria(actividadesCarga || actividades || [], hoyMadrid())
    cargaPorFecha = cargaDiaria.reduce((acc, dia) => ({ ...acc, [dia.fecha]: dia }), {})
    ultimoDia = cargaDiaria[cargaDiaria.length - 1] || null
  }

  const data = semanas.map((s) => {
    const dia = cargaPorFecha[sumarDias(s.semana, 6)] || ultimoDia
    return {
      label: formatFechaCorta(s.semana),
      tss_total: s.tss_total || 0,
      atl: mostrarLineas && dia ? dia.atl : null,
      ctl: mostrarLineas && dia ? dia.ctl : null,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: COLORS.cardBorder }} tickLine={false} />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<TSSTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {mostrarLineas && (
          <Legend
            wrapperStyle={{ fontSize: 12, color: COLORS.textSecondary }}
            iconType="plainline"
          />
        )}
        <Bar dataKey="tss_total" name="TSS semanal" fill={BAR_COLOR} radius={[3, 3, 0, 0]} maxBarSize={42} legendType="rect" />
        {mostrarLineas && (
          <Line dataKey="atl" name="ATL (7 días)" stroke={ATL_COLOR} strokeWidth={2} dot={false} />
        )}
        {mostrarLineas && (
          <Line dataKey="ctl" name="CTL (28 días)" stroke={CTL_COLOR} strokeWidth={2} dot={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
