// Tira de la semana para el coach: por día, lo que el atleta puede hacer
// (disciplina y límite) y los minutos que ya le has prescrito. Si alguna sesión
// no encaja, el día se marca; solo informa, nunca bloquea.
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS } from '../lib/theme'
import { DISCIPLINAS_DISPONIBILIDAD, evaluarDisponibilidad, minutosPlanificados, resumenSemana } from '../lib/disponibilidad'

const INICIAL_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const AMBAR = '#E8B84A'

export default function TiraDisponibilidad({ lunes, datos, sesiones }) {
  const dias = resumenSemana(datos, lunes)
  if (dias.length === 0 || dias.every((d) => d.origen === 'sin_datos')) return null

  return (
    <div
      role="group"
      aria-label="Disponibilidad del atleta esta semana"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginBottom: 12 }}
    >
      {dias.map((dia, i) => {
        const delDia = (sesiones || []).filter((s) => s.fecha === dia.fecha)
        const { minutos, sinDuracion } = minutosPlanificados(delDia)
        const choca = delDia.some((s) => evaluarDisponibilidad(datos, dia.fecha, s.disciplina, s.duracion_min).nivel === 'aviso')
        const libre = dia.origen === 'dia_libre'
        return (
          <div
            key={dia.fecha}
            title={dia.nota || undefined}
            style={{
              border: `1px solid ${choca ? AMBAR : COLORS.cardBorder}`,
              background: libre ? 'transparent' : COLORS.card,
              borderStyle: libre ? 'dashed' : 'solid',
              borderRadius: 8, padding: '6px 6px 7px', minHeight: 64, fontSize: 11,
            }}
          >
            <div style={{ color: COLORS.textSecondary, fontFamily: FONTS.mono, marginBottom: 4 }}>
              {INICIAL_DIA[i]} {Number(dia.fecha.slice(8))}
            </div>
            {libre ? (
              <div style={{ color: COLORS.textTertiary }}>Libre</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {DISCIPLINAS_DISPONIBILIDAD.filter((d) => Object.prototype.hasOwnProperty.call(dia.disciplinas, d)).map((d) => (
                  <span
                    key={d}
                    title={`${DISCIPLINE_LABELS[d]}: ${dia.disciplinas[d] === null ? 'sin límite' : `hasta ${dia.disciplinas[d]} min`}`}
                    style={{ color: DISCIPLINE_COLORS[d], fontFamily: FONTS.mono, fontWeight: 600 }}
                  >
                    {DISCIPLINE_LABELS[d][0]}{dia.disciplinas[d] === null ? '∞' : dia.disciplinas[d]}
                  </span>
                ))}
                {Object.keys(dia.disciplinas).length === 0 && <span style={{ color: COLORS.textTertiary }}>—</span>}
              </div>
            )}
            {delDia.length > 0 && (
              <div style={{ marginTop: 4, fontFamily: FONTS.mono, color: choca ? AMBAR : COLORS.textPrimary }}>
                {minutos > 0 ? `${minutos}'` : ''}{sinDuracion > 0 ? (minutos > 0 ? ' +' : '') + `${sinDuracion}×` : ''}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
