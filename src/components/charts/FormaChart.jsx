import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer } from 'recharts'
import { COLORS, FONTS } from '../../lib/theme'
import { formatFechaCorta, tickStyle, gridStroke, tooltipBoxStyle, hoyMadrid } from '../../lib/chartUtils'
import { computeCargaDiaria } from '../../lib/carga'

// Forma: CTL (fitness, 42 días) y ATL (fatiga, 7 días) DIARIOS, en su escala
// (TSS/día). Énfasis: la CTL en el violeta de carga; la ATL como contexto en
// gris. Sin colores de disciplina (teal/ámbar significan natación/bici).
// La serie se calienta con `actividadesCarga` (26 semanas) y solo se DIBUJA
// el rango del selector (desde el lunes de la primera semana).
const CTL_COLOR = COLORS.load
const ATL_COLOR = COLORS.textSecondary

function FormaTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  const tsb = Math.round(p.ctl) - Math.round(p.atl)
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>{p.label}</p>
      <Fila color={CTL_COLOR} nombre="CTL" valor={Math.round(p.ctl)} />
      <Fila color={ATL_COLOR} nombre="ATL" valor={Math.round(p.atl)} />
      <p style={{ margin: '4px 0 0', color: COLORS.textSecondary }}>
        TSB <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{tsb > 0 ? `+${tsb}` : tsb}</span>
      </p>
    </div>
  )
}

function Fila({ color, nombre, valor }) {
  return (
    <p style={{ margin: '2px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 10, height: 2, background: color, borderRadius: 1 }} />
      <span style={{ color: COLORS.textSecondary }}>{nombre}</span>
      <span style={{ fontFamily: FONTS.mono }}>{valor}</span>
    </p>
  )
}

function Leyenda({ ctl, atl }) {
  const item = (color, nombre, nota, valor) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 14, height: 2, background: color, borderRadius: 1 }} />
      <span style={{ color: COLORS.textSecondary }}>
        {nombre} <span style={{ color: COLORS.textTertiary }}>{nota}</span>
      </span>
      {valor != null && <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{valor}</span>}
    </span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12, marginBottom: 10 }}>
      {item(CTL_COLOR, 'CTL', 'fitness · 42 d', ctl)}
      {item(ATL_COLOR, 'ATL', 'fatiga · 7 d', atl)}
    </div>
  )
}

export default function FormaChart({ actividadesCarga, desde }) {
  const data = useMemo(() => {
    const dias = computeCargaDiaria(actividadesCarga || [], hoyMadrid())
    return dias
      .filter((d) => !desde || d.fecha >= desde)
      .map((d) => ({ ...d, label: formatFechaCorta(d.fecha) }))
  }, [actividadesCarga, desde])

  if (data.length < 2) return null
  const ultimo = data[data.length - 1]

  return (
    <div>
      {/* Valores de hoy en la leyenda: etiqueta directa del punto que importa */}
      <Leyenda ctl={Math.round(ultimo.ctl)} atl={Math.round(ultimo.atl)} />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: COLORS.cardBorder }} tickLine={false} minTickGap={24} />
          <YAxis tick={{ ...tickStyle, fontFamily: FONTS.mono }} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<FormaTooltip />} cursor={{ stroke: COLORS.cardBorder }} />
          <ReferenceLine x={ultimo.label} stroke={COLORS.cardBorder} />
          <Line dataKey="atl" name="ATL" stroke={ATL_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line
            dataKey="ctl"
            name="CTL"
            stroke={CTL_COLOR}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: COLORS.card, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
