import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS } from '../../lib/theme'
import {
  formatFechaCorta,
  formatHorasMin,
  lunesDeSemana,
  tickStyle,
  gridStroke,
  tooltipBoxStyle,
} from '../../lib/chartUtils'

const STACK_COLORS = {
  run: DISCIPLINE_COLORS.run,
  bike: DISCIPLINE_COLORS.bike,
  swim: DISCIPLINE_COLORS.swim,
  strength: DISCIPLINE_COLORS.strength,
  other: '#94A3B8',
}

const DISCIPLINAS = ['run', 'bike', 'swim', 'strength', 'other']

// Las semanas del backend no traen horas por disciplina: se calculan
// desde las actividades agrupando por lunes de semana.
function horasPorSemana(actividades) {
  return actividades.reduce((acc, act) => {
    if (!act.fecha || !act.duracion_min) return acc
    const lunes = lunesDeSemana(act.fecha)
    const disciplina = DISCIPLINAS.includes(act.disciplina) ? act.disciplina : 'other'
    const semana = acc[lunes] || {}
    return {
      ...acc,
      [lunes]: { ...semana, [disciplina]: (semana[disciplina] || 0) + act.duracion_min / 60 },
    }
  }, {})
}

function VolumeTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Semana del {label}</p>
      {payload
        .filter((entry) => entry.value > 0)
        .map((entry) => (
          <p key={entry.dataKey} style={{ margin: '2px 0', color: entry.fill }}>
            {DISCIPLINE_LABELS[entry.dataKey] || entry.dataKey}: {formatHorasMin(entry.value)}
          </p>
        ))}
    </div>
  )
}

export default function VolumeChart({ semanas, actividades }) {
  if (!semanas || semanas.length === 0) return null

  const horas = horasPorSemana(actividades || [])
  const data = semanas.map((s) => ({
    label: formatFechaCorta(s.semana),
    run: horas[s.semana]?.run || 0,
    bike: horas[s.semana]?.bike || 0,
    swim: horas[s.semana]?.swim || 0,
    strength: horas[s.semana]?.strength || 0,
    other: horas[s.semana]?.other || 0,
  }))

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: COLORS.cardBorder }} tickLine={false} />
        <YAxis
          tick={tickStyle}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}h`}
          width={36}
        />
        <Tooltip content={<VolumeTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        {DISCIPLINAS.map((disciplina) => (
          <Bar
            key={disciplina}
            dataKey={disciplina}
            stackId="volumen"
            fill={STACK_COLORS[disciplina]}
            radius={disciplina === 'other' ? [3, 3, 0, 0] : 0}
            maxBarSize={42}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
