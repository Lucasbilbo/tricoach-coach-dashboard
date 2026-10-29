// HojaMover — hoja inferior para mover una sesión de día y hora sin arrastrar
// (móvil, o tocando una sesión). Solo ofrece días de hoy en adelante y horas
// que encajan en las franjas del atleta para esa disciplina; "Sin hora" siempre.
// Mover es libre: no bloquea por disponibilidad, solo informa.
import { useState } from 'react'
import { COLORS, DISCIPLINE_COLORS, FONTS } from '../lib/theme'
import { sumarDias } from '../lib/chartUtils'
import { disponibilidadDelDia, evaluarDisponibilidad, formatHora, textoAviso } from '../lib/disponibilidad'
import { horasPosibles, validarMovimiento } from '../lib/agenda'
import Icon from './ui/Icon'
import { duracionPrevista } from '../lib/tssPrevisto'

const INICIAL = ['D', 'L', 'M', 'X', 'J', 'V', 'S']
const NOMBRE = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_A_LA_VISTA = 14

const diaSemana = (fecha) => new Date(fecha + 'T00:00:00Z').getUTCDay()
const fmtDur = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

const etiqueta = { fontSize: 11, letterSpacing: '0.08em', color: COLORS.textTertiary, fontWeight: 600, margin: '0 0 8px' }

function chip(sel, extra = {}) {
  return {
    flexShrink: 0, borderRadius: 10, cursor: 'pointer', textAlign: 'center',
    border: `1px solid ${sel ? COLORS.accent : '#232A38'}`,
    background: sel ? COLORS.accent : '#181C26',
    color: sel ? COLORS.background : COLORS.textPrimary,
    ...extra,
  }
}

export default function HojaMover({ sesion, titulo, datos, ahora, onMover, onCerrar, onEditar }) {
  // Real o estimada (pasos por distancia): sirve para avisar si no cabe
  const dur = duracionPrevista(sesion)?.min ?? null
  const [fecha, setFecha] = useState(sesion.fecha >= ahora.fecha ? sesion.fecha : ahora.fecha)
  const [hora, setHora] = useState(Number.isInteger(sesion.hora_inicio_min) ? sesion.hora_inicio_min : null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)

  // De hoy en adelante (lo pasado se pierde); si la sesión está más lejos, su día también.
  const dias = Array.from({ length: DIAS_A_LA_VISTA }, (_, i) => sumarDias(ahora.fecha, i))
  if (!dias.includes(fecha)) dias.push(fecha)

  const sugeridas = horasPosibles(datos, fecha, sesion.disciplina, dur, ahora)
  const horas = hora != null && !sugeridas.includes(hora) ? [...sugeridas, hora].sort((a, b) => a - b) : sugeridas
  const valido = validarMovimiento({ origen: { fecha: sesion.fecha, hora: sesion.hora_inicio_min ?? null }, destino: { fecha, hora }, ahora })
  const sinCambios = valido.code === 'SIN_CAMBIOS'
  const aviso = textoAviso(evaluarDisponibilidad(datos, fecha, sesion.disciplina, dur ?? undefined, hora ?? undefined), sesion.disciplina)
  const nombreDia = fecha === ahora.fecha ? 'hoy' : NOMBRE[diaSemana(fecha)]

  async function confirmar() {
    if (!valido.ok || guardando) return
    setGuardando(true)
    setError(null)
    const r = await onMover(sesion, fecha, hora)
    setGuardando(false)
    if (r?.error) setError(r.error)
    else onCerrar()
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Mover sesión" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={onCerrar} style={{ position: 'absolute', inset: 0, background: 'rgba(5,6,9,0.66)' }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box',
        background: COLORS.card, borderTop: '1px solid #232A38', borderRadius: '22px 22px 0 0',
        padding: '12px 16px calc(20px + env(safe-area-inset-bottom))', boxShadow: '0 -20px 40px rgba(0,0,0,0.4)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#2A3040', margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700 }}>Mover sesión</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, padding: 8, cursor: 'pointer' }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16,
          background: '#181C26', border: '1px solid #232A38', borderRadius: 10,
          boxShadow: `inset 3px 0 0 ${DISCIPLINE_COLORS[sesion.disciplina] || COLORS.textTertiary}`, padding: '9px 12px 9px 14px',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</span>
          <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}>
            {dur ? `${duracionPrevista(sesion).estimada ? '~' : ''}${fmtDur(dur)}` : 'sin duración'}
          </span>
        </div>

        <p style={etiqueta}>DÍA</p>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 14, scrollbarWidth: 'none' }}>
          {dias.map((f) => {
            const sel = f === fecha
            const libre = disponibilidadDelDia(datos, f).origen === 'dia_libre'
            return (
              <button
                key={f}
                type="button"
                onClick={() => { setFecha(f); setError(null) }}
                aria-pressed={sel}
                title={libre ? 'Marcado como no disponible' : undefined}
                style={chip(sel, {
                  width: 46, padding: '7px 0',
                  ...(libre && !sel ? { background: 'repeating-linear-gradient(135deg,#1B202C 0 4px,transparent 4px 9px)', color: COLORS.textTertiary } : {}),
                })}
              >
                <div style={{ fontSize: 11 }}>{INICIAL[diaSemana(f)]}</div>
                <div style={{ fontFamily: FONTS.mono, fontSize: 15, fontWeight: 600, marginTop: 1 }}>{Number(f.slice(8))}</div>
              </button>
            )
          })}
        </div>

        <p style={etiqueta}>HORA DE INICIO</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 12, maxHeight: 176, overflowY: 'auto' }}>
          {[null, ...horas].map((h) => {
            const sel = h === hora
            return (
              <button
                key={h ?? 'sin'}
                type="button"
                onClick={() => { setHora(h); setError(null) }}
                aria-pressed={sel}
                style={chip(sel, { padding: '10px 0', fontFamily: h == null ? FONTS.sans : FONTS.mono, fontSize: 13, fontWeight: sel ? 700 : 500 })}
              >
                {h == null ? 'Sin hora' : formatHora(h)}
              </button>
            )
          })}
        </div>
        {sugeridas.length === 0 && (
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: COLORS.textTertiary }}>Ese día no hay franjas para esta disciplina.</p>
        )}

        <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, lineHeight: 1.45, marginBottom: 16, minHeight: 18, color: sinCambios ? COLORS.textTertiary : !valido.ok || aviso ? '#E8B84A' : COLORS.textSecondary }}>
          {!sinCambios && <Icon name={!valido.ok || aviso ? 'alert' : 'check'} size={16} color={!valido.ok || aviso ? '#E8B84A' : COLORS.accent} />}
          <span>
            {!valido.ok
              ? (sinCambios ? 'Elige el día y la hora nuevos.' : valido.error)
              : aviso || 'Cabe en sus franjas.'}
            {valido.ok && aviso ? ' Se mueve igualmente.' : ''}
          </span>
        </div>

        {error && <p role="alert" style={{ margin: '0 0 12px', fontSize: 13, color: COLORS.error }}>{error}</p>}

        <button
          type="button"
          onClick={confirmar}
          disabled={!valido.ok || guardando}
          style={{
            width: '100%', border: 'none', borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 700, fontFamily: FONTS.sans,
            background: COLORS.accent, color: COLORS.background, cursor: valido.ok ? 'pointer' : 'not-allowed',
            opacity: !valido.ok || guardando ? 0.45 : 1,
          }}
        >
          {guardando ? 'Moviendo…' : `Mover a ${nombreDia}${hora != null ? `, ${formatHora(hora)}` : ''}`}
        </button>
        {onEditar && (
          <button type="button" onClick={onEditar} style={{ display: 'block', margin: '12px auto 0', background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans }}>
            Editar el entreno
          </button>
        )}
        {sesion.intervals_event_id && (
          <p style={{ margin: '10px 0 0', textAlign: 'center', fontSize: 11.5, color: COLORS.textTertiary }}>También se mueve en el reloj.</p>
        )}
      </div>
    </div>
  )
}
