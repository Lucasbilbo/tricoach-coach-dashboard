import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ResponsiveContainer } from 'recharts'
import { COLORS, FONTS } from '../../lib/theme'
import { formatDiaMes, formatFechaCorta, tickStyle, gridStroke, tooltipBoxStyle, hoyMadrid } from '../../lib/chartUtils'
import { computeCargaDiaria } from '../../lib/carga'

// Forma: CTL (fitness, 42 días) y ATL (fatiga, 7 días) DIARIOS, en su escala
// (TSS/día). Énfasis: la CTL en el violeta de carga; la ATL como contexto en
// gris. Sin colores de disciplina (teal/ámbar significan natación/bici).
// La serie se calienta con `actividadesCarga` (26 semanas) y solo se DIBUJA
// el rango del selector (desde el lunes de la primera semana).
// `proyeccion` (lib/proyeccion.js): continuación DISCONTINUA desde hoy con lo
// que el coach ya tiene planificado, solo hasta la última sesión planificada.
const CTL_COLOR = COLORS.load
const ATL_COLOR = COLORS.textSecondary

const signo = (n) => (n > 0 ? `+${n}` : `${n}`)

function FormaTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  const previsto = p.ctl == null
  const ctl = Math.round(previsto ? p.ctlP : p.ctl)
  const atl = Math.round(previsto ? p.atlP : p.atl)
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
        {p.label}
        {previsto && <span style={{ color: COLORS.textSecondary, fontWeight: 500 }}> · previsto</span>}
      </p>
      <Fila color={CTL_COLOR} nombre="CTL" valor={ctl} />
      <Fila color={ATL_COLOR} nombre="ATL" valor={atl} />
      <p style={{ margin: '4px 0 0', color: COLORS.textSecondary }}>
        TSB <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{signo(ctl - atl)}</span>
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

function Leyenda({ ctl, atl, conPrevisto }) {
  const item = (color, nombre, nota, valor, discontinua = false) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 14,
          height: 0,
          borderTop: `2px ${discontinua ? 'dashed' : 'solid'} ${color}`,
        }}
      />
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
      {conPrevisto && item(COLORS.textSecondary, 'Previsto', 'con lo planificado', null, true)}
    </div>
  )
}

// "Con lo planificado, el 1 Nov: CTL 41 · TSB +6" o, si la prueba A cae
// dentro del plan, la forma con la que se llega a ella.
function ResumenPrevisto({ proyeccion }) {
  const { prueba, evento, final, hasta } = proyeccion
  const mono = { fontFamily: FONTS.mono, color: COLORS.textPrimary }
  let texto
  if (prueba) {
    texto = (
      <>
        Llega a <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>{prueba.evento.nombre}</span>{' '}
        (<span style={mono}>{formatDiaMes(prueba.evento.fecha)}</span>) con CTL <span style={mono}>{prueba.ctl}</span> · TSB{' '}
        <span style={mono}>{signo(prueba.tsb)}</span>
      </>
    )
  } else if (final) {
    texto = (
      <>
        Con lo planificado, el <span style={mono}>{formatDiaMes(hasta)}</span>: CTL <span style={mono}>{final.ctl}</span> · TSB{' '}
        <span style={mono}>{signo(final.tsb)}</span>
        {evento && (
          <span style={{ color: COLORS.textTertiary }}>
            {' '}· {evento.nombre} ({formatDiaMes(evento.fecha)}) queda fuera del plan
          </span>
        )}
      </>
    )
  }
  if (!texto) return null
  return <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.5 }}>{texto}</p>
}

export default function FormaChart({ actividadesCarga, desde, proyeccion }) {
  const hoy = hoyMadrid()
  const data = useMemo(() => {
    const dias = computeCargaDiaria(actividadesCarga || [], hoy)
    const reales = dias
      .filter((d) => !desde || d.fecha >= desde)
      .map((d) => ({ ...d, label: formatFechaCorta(d.fecha) }))
    if (!proyeccion?.dias?.length || reales.length === 0) return reales
    // El tramo previsto arranca en el último punto real para que las líneas se unan
    const ult = reales[reales.length - 1]
    ult.ctlP = ult.ctl
    ult.atlP = ult.atl
    const futuros = proyeccion.dias
      .filter((d) => d.fecha > ult.fecha)
      .map((d) => ({ fecha: d.fecha, label: formatFechaCorta(d.fecha), ctl: null, atl: null, ctlP: d.ctl, atlP: d.atl }))
    return [...reales, ...futuros]
  }, [actividadesCarga, desde, proyeccion, hoy])

  if (data.length < 2) return null
  const hoyPunto = [...data].reverse().find((d) => d.ctl != null)
  const conPrevisto = data.some((d) => d.ctl == null)
  const prueba = conPrevisto ? proyeccion?.prueba : null

  return (
    <div>
      {/* Valores de hoy en la leyenda: etiqueta directa del punto que importa */}
      <Leyenda ctl={Math.round(hoyPunto.ctl)} atl={Math.round(hoyPunto.atl)} conPrevisto={conPrevisto} />
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: COLORS.cardBorder }} tickLine={false} minTickGap={24} />
          <YAxis tick={{ ...tickStyle, fontFamily: FONTS.mono }} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<FormaTooltip />} cursor={{ stroke: COLORS.cardBorder }} />
          <ReferenceLine x={hoyPunto.label} stroke={COLORS.cardBorder} />
          {prueba && (
            <ReferenceLine
              x={formatFechaCorta(prueba.evento.fecha)}
              stroke={COLORS.textTertiary}
              strokeDasharray="2 3"
              label={{ value: prueba.evento.nombre, position: 'insideTopRight', fill: COLORS.textSecondary, fontSize: 11 }}
            />
          )}
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
          {conPrevisto && (
            <Line dataKey="atlP" name="ATL prevista" stroke={ATL_COLOR} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          )}
          {conPrevisto && (
            <Line dataKey="ctlP" name="CTL prevista" stroke={CTL_COLOR} strokeWidth={2} strokeDasharray="4 3" dot={false} activeDot={{ r: 4, stroke: COLORS.card, strokeWidth: 2 }} isAnimationActive={false} />
          )}
        </LineChart>
      </ResponsiveContainer>
      {conPrevisto && <ResumenPrevisto proyeccion={proyeccion} />}
    </div>
  )
}
