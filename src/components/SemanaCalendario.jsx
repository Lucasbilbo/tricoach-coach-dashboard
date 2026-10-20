// SemanaCalendario — la semana del coach como calendario. Los días son
// columnas y las HORAS van en el eje vertical, que es donde hay sitio: una
// ventana de 2h30 pasa de ser una barra de 8 px a una banda de 30 px que se ve
// sin descifrar nada. Las franjas del atleta se pintan como bandas de color por
// disciplina (carriles dentro de la columna, así se ve lo que se solapa) y los
// entrenos ya prescritos van debajo, en el mismo sitio donde miras el día.
//
// No toca el modelo de datos: `coach_sessions` solo tiene fecha, no hora, así
// que las sesiones son chips al pie de la columna. El día que tengan hora, el
// chip se convierte en un bloque dentro de la banda y el choque se ve solo.
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS } from '../lib/theme'
import { esPlanificable } from '../lib/planificacion'
import { DISCIPLINAS_DISPONIBILIDAD, evaluarDisponibilidad, formatHora, formatTramo, minutosPlanificados, resumenSemana } from '../lib/disponibilidad'

const INICIAL_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const AMBAR = '#E8B84A'
const ALTO = 188
const ANCHO_HORAS = 30

// Color de disciplina con transparencia (las bandas dejan ver la rejilla).
const banda = (hex) => `${hex}B0`

// Ventana horaria de la semana: solo las horas que el atleta usa, redondeadas
// a la hora y con media hora de aire. Así las bandas ocupan todo lo que pueden.
function ventana(dias) {
  let min = Infinity
  let max = -Infinity
  for (const d of dias) {
    for (const tramos of Object.values(d.disciplinas)) {
      for (const t of tramos) {
        if (t.inicio_min < min) min = t.inicio_min
        if (t.fin_min > max) max = t.fin_min
      }
    }
  }
  if (!Number.isFinite(min)) return [360, 1320] // 6:00–22:00 por defecto
  min = Math.max(0, Math.floor(min / 60) * 60 - 30)
  max = Math.min(1440, Math.ceil(max / 60) * 60 + 30)
  if (max - min < 420) max = Math.min(1440, min + 420) // mínimo 7 h de alto
  return [min, max]
}

// Horas rotuladas: cada 2 h si la ventana es corta, cada 3 h si es larga.
function marcas(min, max) {
  const paso = max - min <= 540 ? 120 : 180
  const res = []
  for (let h = Math.ceil(min / paso) * paso; h < max; h += paso) res.push(h)
  return res
}

export default function SemanaCalendario({ lunes, datos, sesiones, onDia, hoy }) {
  const dias = resumenSemana(datos, lunes)
  if (dias.length === 0) return null
  const sinDatos = dias.every((d) => d.origen === 'sin_datos')
  if (sinDatos && !onDia) return null

  const [MIN, MAX] = ventana(dias)
  const span = MAX - MIN
  const y = (m) => ((Math.min(Math.max(m, MIN), MAX) - MIN) / span) * 100

  return (
    <div
      role="group"
      aria-label="Disponibilidad del atleta esta semana"
      style={{ display: 'grid', gridTemplateColumns: `${ANCHO_HORAS}px repeat(7, minmax(0, 1fr))`, gap: 5, marginBottom: 14, alignItems: 'start' }}
    >
      {/* Columna de horas */}
      <div>
        <div style={{ height: 18 }} />
        <div style={{ position: 'relative', height: ALTO }}>
          {marcas(MIN, MAX).map((m) => (
            <span
              key={m}
              style={{
                position: 'absolute', top: `${y(m)}%`, right: 4, transform: 'translateY(-50%)',
                fontFamily: FONTS.mono, fontSize: 9, color: COLORS.textTertiary, whiteSpace: 'nowrap',
              }}
            >
              {formatHora(m)}
            </span>
          ))}
        </div>
      </div>

      {dias.map((dia, i) => {
        const delDia = (sesiones || []).filter((s) => s.fecha === dia.fecha)
        const { minutos, sinDuracion } = minutosPlanificados(delDia)
        const libre = dia.origen === 'dia_libre'
        const conTramos = DISCIPLINAS_DISPONIBILIDAD.filter((d) => dia.disciplinas[d])
        const sinActividad = libre || (dia.origen !== 'sin_datos' && conTramos.length === 0)
        const pulsable = !!onDia && esPlanificable(dia.fecha, hoy) && !sinActividad
        const pasado = !esPlanificable(dia.fecha, hoy)
        const nombreDia = `${NOMBRE_DIA[i]} ${Number(dia.fecha.slice(8))}`
        const choca = delDia.some((s) => evaluarDisponibilidad(datos, dia.fecha, s.disciplina, s.duracion_min).nivel === 'aviso')
        const Caja = pulsable ? 'button' : 'div'
        const esHoy = dia.fecha === hoy
        return (
          <div key={dia.fecha} style={{ opacity: onDia && (pasado || sinActividad) ? 0.45 : 1, minWidth: 0 }}>
            <div
              style={{
                height: 18, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden',
                fontFamily: FONTS.mono, fontSize: 11,
                color: choca ? AMBAR : esHoy ? COLORS.textPrimary : COLORS.textSecondary,
              }}
            >
              <span>{INICIAL_DIA[i]} {Number(dia.fecha.slice(8))}</span>
              {/* Minutos ya prescritos ese día: el resumen de carga que la lista
                  de sesiones de abajo no da (ahí cada sesión va por separado). */}
              {delDia.length > 0 && (
                <span
                  title={`${delDia.length} ${delDia.length === 1 ? 'sesión' : 'sesiones'}`}
                  style={{ color: choca ? AMBAR : COLORS.textTertiary, whiteSpace: 'nowrap' }}
                >
                  {minutos > 0 ? `${minutos}'` : ''}
                  {sinDuracion > 0 ? (minutos > 0 ? '+' : '') + `${sinDuracion}×` : ''}
                </span>
              )}
            </div>

            <Caja
              {...(pulsable
                ? { type: 'button', onClick: () => onDia(dia.fecha), 'aria-label': `Planificar entreno el ${nombreDia}` }
                : {})}
              title={dia.nota || (pulsable ? `Planificar el ${nombreDia}` : undefined)}
              style={{
                position: 'relative', height: ALTO, width: '100%', padding: 0, display: 'block',
                border: `1px solid ${esHoy ? 'rgba(255,255,255,0.16)' : COLORS.cardBorder}`,
                borderStyle: sinActividad ? 'dashed' : 'solid',
                borderRadius: 8,
                background: sinActividad ? 'transparent' : COLORS.card,
                cursor: pulsable ? 'pointer' : 'default',
                overflow: 'hidden',
              }}
            >
              {/* rejilla de horas */}
              {!sinActividad && marcas(MIN, MAX).map((m) => (
                <span key={m} style={{ position: 'absolute', left: 0, right: 0, top: `${y(m)}%`, height: 1, background: 'rgba(255,255,255,0.045)' }} />
              ))}

              {libre && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: COLORS.textTertiary, fontFamily: FONTS.body }}>
                  Libre
                </span>
              )}

              {/* Carriles FIJOS: natación, bici, carrera, fuerza siempre en la
                  misma posición, aunque ese día falte alguna. Así el color de
                  cada deporte cae en la misma vertical toda la semana y se
                  puede escanear de un vistazo. */}
              {DISCIPLINAS_DISPONIBILIDAD.map((d, j) => !dia.disciplinas[d] ? null : (
                <span key={d} style={{ position: 'absolute', top: 3, bottom: 3, left: `${(j * 100) / DISCIPLINAS_DISPONIBILIDAD.length}%`, width: `${100 / DISCIPLINAS_DISPONIBILIDAD.length}%`, display: 'block' }}>
                  {dia.disciplinas[d].map((t) => (
                    <span
                      key={t.inicio_min}
                      title={`${DISCIPLINE_LABELS[d]}: ${formatTramo(t)}`}
                      style={{
                        position: 'absolute', left: 2, right: 2,
                        top: `${y(t.inicio_min)}%`,
                        height: `${Math.max(y(t.fin_min) - y(t.inicio_min), 4)}%`,
                        background: banda(DISCIPLINE_COLORS[d]), borderRadius: 3, display: 'block',
                      }}
                    />
                  ))}
                </span>
              ))}

              {pulsable && (
                <span aria-hidden="true" style={{ position: 'absolute', right: 5, bottom: 3, color: COLORS.textTertiary, fontSize: 14, lineHeight: 1 }}>
                  +
                </span>
              )}
            </Caja>

          </div>
        )
      })}
    </div>
  )
}
