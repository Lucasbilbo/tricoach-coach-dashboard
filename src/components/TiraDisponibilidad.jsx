// Tira de la semana para el coach: por día, lo que el atleta puede hacer
// (disciplina y límite) y los minutos que ya le has prescrito. Si alguna sesión
// no encaja, el día se marca; solo informa, nunca bloquea.
// Con `onDia`, los días de hoy en adelante son botones: pulsar uno abre el
// creador de entrenos con esa fecha (planificar la semana desde aquí).
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS } from '../lib/theme'
import { esPlanificable } from '../lib/planificacion'
import { DISCIPLINAS_DISPONIBILIDAD, evaluarDisponibilidad, formatTramo, formatTramoCorto, minutosPlanificados, resumenSemana } from '../lib/disponibilidad'

const INICIAL_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const AMBAR = '#E8B84A'
// Una letra distinta por disciplina (Ciclismo y Carrera empiezan igual).
const LETRA = { swim: 'N', bike: 'B', run: 'C', strength: 'F' }

const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

export default function TiraDisponibilidad({ lunes, datos, sesiones, onDia, hoy }) {
  const dias = resumenSemana(datos, lunes)
  if (dias.length === 0) return null
  // Sin disponibilidad configurada solo se muestra si sirve para planificar
  const sinDatos = dias.every((d) => d.origen === 'sin_datos')
  if (sinDatos && !onDia) return null

  return (
    <div
      role="group"
      aria-label="Disponibilidad del atleta esta semana"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', overflowX: 'auto', gap: 6, marginBottom: 12 }}
    >
      {dias.map((dia, i) => {
        const delDia = (sesiones || []).filter((s) => s.fecha === dia.fecha)
        const { minutos, sinDuracion } = minutosPlanificados(delDia)
        const choca = delDia.some((s) => evaluarDisponibilidad(datos, dia.fecha, s.disciplina, s.duracion_min).nivel === 'aviso')
        const libre = dia.origen === 'dia_libre'
        const pulsable = !!onDia && esPlanificable(dia.fecha, hoy)
        const Caja = pulsable ? 'button' : 'div'
        const nombreDia = `${NOMBRE_DIA[i]} ${Number(dia.fecha.slice(8))}`
        return (
          <Caja
            key={dia.fecha}
            {...(pulsable
              ? {
                  type: 'button',
                  onClick: () => onDia(dia.fecha),
                  'aria-label': `Planificar entreno el ${nombreDia}${libre ? ' (marcado como no disponible)' : ''}`,
                }
              : {})}
            title={dia.nota || (pulsable ? `Planificar el ${nombreDia}` : undefined)}
            style={{
              border: `1px solid ${choca ? AMBAR : COLORS.cardBorder}`,
              background: libre ? 'transparent' : COLORS.card,
              borderStyle: libre ? 'dashed' : 'solid',
              borderRadius: 8, padding: '6px 6px 7px', minHeight: 64,
              // Reset de <button> para que se vea igual que la tarjeta
              textAlign: 'left', color: 'inherit', font: 'inherit', fontSize: 11, display: 'flex',
              flexDirection: 'column', alignItems: 'stretch', position: 'relative',
              cursor: pulsable ? 'pointer' : 'default', opacity: onDia && !pulsable ? 0.55 : 1,
            }}
          >
            <div style={{ color: COLORS.textSecondary, fontFamily: FONTS.mono, marginBottom: 4 }}>
              {INICIAL_DIA[i]} {Number(dia.fecha.slice(8))}
            </div>
            {libre ? (
              <div style={{ color: COLORS.textTertiary }}>Libre</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {DISCIPLINAS_DISPONIBILIDAD.filter((d) => dia.disciplinas[d]).map((d) => (
                  <span
                    key={d}
                    title={`${DISCIPLINE_LABELS[d]}: ${dia.disciplinas[d].map(formatTramo).join(', ')}`}
                    style={{ color: DISCIPLINE_COLORS[d], fontFamily: FONTS.mono, fontWeight: 600, display: 'block', width: '100%' }}
                  >
                    {LETRA[d]} {dia.disciplinas[d].map(formatTramoCorto).join(' ')}
                  </span>
                ))}
                {Object.keys(dia.disciplinas).length === 0 && dia.origen !== 'sin_datos' && <span style={{ color: COLORS.textTertiary }}>—</span>}
              </div>
            )}
            {delDia.length > 0 && (
              <div style={{ marginTop: 4, fontFamily: FONTS.mono, color: choca ? AMBAR : COLORS.textPrimary }}>
                {minutos > 0 ? `${minutos}'` : ''}{sinDuracion > 0 ? (minutos > 0 ? ' +' : '') + `${sinDuracion}×` : ''}
              </div>
            )}
            {pulsable && (
              <span aria-hidden="true" style={{ position: 'absolute', right: 6, bottom: 4, color: COLORS.textTertiary, fontSize: 14, lineHeight: 1 }}>
                +
              </span>
            )}
          </Caja>
        )
      })}
    </div>
  )
}
