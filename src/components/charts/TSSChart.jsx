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
import { formatFechaCorta, tickStyle, gridStroke, tooltipBoxStyle } from '../../lib/chartUtils'

const SEMANAS_MINIMAS_LINEAS = 8
const VENTANA_ATL_DIAS = 7
const VENTANA_CTL_DIAS = 28
const DIA_MS = 86400000

const ATL_COLOR = '#00D4FF'
const CTL_COLOR = '#00E5A0'
const BAR_COLOR = DISCIPLINE_COLORS.strength

function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + dias * DIA_MS).toISOString().slice(0, 10)
}

// ATL/CTL por día: media móvil del TSS diario (días sin actividad cuentan 0)
function calcularCargaDiaria(actividades, desde, hasta) {
  const tssPorDia = actividades.reduce((acc, act) => {
    if (!act.fecha || act.tss_estimado == null) return acc
    return { ...acc, [act.fecha]: (acc[act.fecha] || 0) + act.tss_estimado }
  }, {})

  const dias = []
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    dias.push({ fecha, tss: tssPorDia[fecha] || 0 })
  }

  return dias.map((dia, i) => {
    const tramoAtl = dias.slice(Math.max(0, i - VENTANA_ATL_DIAS + 1), i + 1)
    const tramoCtl = dias.slice(Math.max(0, i - VENTANA_CTL_DIAS + 1), i + 1)
    return {
      fecha: dia.fecha,
      atl: tramoAtl.reduce((acc, d) => acc + d.tss, 0) / VENTANA_ATL_DIAS,
      ctl: tramoCtl.reduce((acc, d) => acc + d.tss, 0) / VENTANA_CTL_DIAS,
    }
  })
}

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

export default function TSSChart({ actividades, semanas }) {
  if (!semanas || semanas.length === 0) return null

  const mostrarLineas = semanas.length >= SEMANAS_MINIMAS_LINEAS

  let cargaPorFinDeSemana = {}
  if (mostrarLineas) {
    const desde = semanas[0].semana
    const hasta = sumarDias(semanas[semanas.length - 1].semana, 6)
    const cargaDiaria = calcularCargaDiaria(actividades || [], desde, hasta)
    cargaPorFinDeSemana = cargaDiaria.reduce(
      (acc, dia) => ({ ...acc, [dia.fecha]: dia }),
      {}
    )
  }

  const data = semanas.map((s) => {
    const finDeSemana = cargaPorFinDeSemana[sumarDias(s.semana, 6)]
    return {
      label: formatFechaCorta(s.semana),
      tss_total: s.tss_total || 0,
      atl: mostrarLineas && finDeSemana ? finDeSemana.atl : null,
      ctl: mostrarLineas && finDeSemana ? finDeSemana.ctl : null,
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
