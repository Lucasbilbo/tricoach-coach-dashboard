import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { COLORS, FONTS } from '../../lib/theme'
import { formatFechaCorta, tickStyle, gridStroke, tooltipBoxStyle, hoyMadrid, lunesDeSemana } from '../../lib/chartUtils'

// Carga semanal: SOLO el TSS de cada semana (una suma). ATL/CTL son medias
// diarias en otra escala y van en su propio gráfico (FormaChart); antes
// compartían eje y las líneas quedaban aplastadas contra el suelo.
const BAR_COLOR = COLORS.load

function TSSTooltip({ active, payload }) {
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div style={tooltipBoxStyle}>
      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>
        Semana del {p.label}
        {p.enCurso && <span style={{ color: COLORS.textSecondary, fontWeight: 400 }}> · en curso</span>}
      </p>
      <p style={{ margin: 0, fontFamily: FONTS.mono }}>TSS {Math.round(p.tss_total)}</p>
    </div>
  )
}

export default function TSSChart({ semanas }) {
  if (!semanas || semanas.length === 0) return null
  const lunesHoy = lunesDeSemana(hoyMadrid())

  const data = semanas.map((s) => ({
    label: formatFechaCorta(s.semana),
    tss_total: s.tss_total || 0,
    enCurso: s.semana === lunesHoy,
  }))

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barCategoryGap={2} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="label" tick={tickStyle} axisLine={{ stroke: COLORS.cardBorder }} tickLine={false} minTickGap={8} />
          <YAxis tick={{ ...tickStyle, fontFamily: FONTS.mono }} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={<TSSTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="tss_total" name="TSS semanal" radius={[4, 4, 0, 0]} maxBarSize={36}>
            {data.map((d) => (
              // La semana en curso aún no ha terminado: más tenue para que no se
              // lea como una caída de carga.
              <Cell key={d.label} fill={BAR_COLOR} fillOpacity={d.enCurso ? 0.45 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {data.some((d) => d.enCurso) && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: COLORS.textTertiary }}>
          La barra tenue es la semana en curso.
        </p>
      )}
    </div>
  )
}
