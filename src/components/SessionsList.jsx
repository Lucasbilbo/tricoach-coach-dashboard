import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS, DISCIPLINE_LABELS, cardStyle } from '../lib/theme'
import { MESES_CORTOS } from '../lib/chartUtils'
import WorkoutBuilder from './WorkoutBuilder'
import WorkoutDetail from './WorkoutDetail'
import ActivityDetail from './ActivityDetail'

const BADGE_COLORS = {
  swim: '#00D4FF',
  bike: '#00E5A0',
  run: '#FF4D6D',
  strength: '#7C3AED',
  other: '#94A3B8',
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatFechaSesion(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_CORTOS[date.getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}`
}

function hoyMadrid() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function estadoSesion(sesion, actividades) {
  const act = (actividades || []).find(
    (a) => a.fecha === sesion.fecha && a.disciplina === sesion.disciplina
  )
  if (act) return { texto: '✓ Completada', color: '#00E5A0', actividadStrava: act }
  if (sesion.fecha > hoyMadrid()) return { texto: 'Programada', color: COLORS.accent, actividadStrava: null }
  return { texto: 'Pendiente', color: COLORS.textSecondary, actividadStrava: null }
}

function tituloSesion(sesion) {
  const nombre = sesion.workout_steps?.nombre
  if (nombre && nombre.trim()) return nombre.trim()
  const desc = sesion.descripcion || ''
  return desc.length > 40 ? desc.slice(0, 40) + '…' : desc || '—'
}

const accionBtnStyle = {
  background: 'transparent',
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 6,
  color: COLORS.textSecondary,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
}

function WorkoutModal({ sesion, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 299,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '8%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 520,
          maxWidth: '92vw',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: '#0F1729',
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          padding: 24,
          zIndex: 300,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 13, color: COLORS.textSecondary }}>
            {formatFechaSesion(sesion.fecha)} · {DISCIPLINE_LABELS[sesion.disciplina] || sesion.disciplina}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.textSecondary,
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
        <WorkoutDetail sesion={sesion} mostrarNotas={true} />
      </div>
    </>
  )
}

export default function SessionsList({ coachId, athleteId, actividades, atletaNombre, onNewSession }) {
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [sesionEditando, setSesionEditando] = useState(null)
  const [reenviando, setReenviando] = useState(null)
  const [sesionWorkout, setSesionWorkout] = useState(null)
  const [actividadDetalle, setActividadDetalle] = useState(null)

  const cargarSesiones = useCallback(async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('coach_sessions')
        .select('*')
        .eq('coach_id', coachId)
        .eq('athlete_id', athleteId)
        .order('fecha', { ascending: true })

      if (queryError) {
        setError('No se pudieron cargar las sesiones')
        return
      }
      setError('')
      setSesiones(data || [])
    } catch {
      setError('Error de conexión cargando las sesiones')
    } finally {
      setCargando(false)
    }
  }, [coachId, athleteId])

  useEffect(() => {
    cargarSesiones()
  }, [cargarSesiones])

  async function handleEliminar(sesion) {
    const confirmado = window.confirm(
      `¿Eliminar la sesión de ${DISCIPLINE_LABELS[sesion.disciplina] || sesion.disciplina} del ${formatFechaSesion(sesion.fecha)}?`
    )
    if (!confirmado) return

    const { error: deleteError } = await supabase
      .from('coach_sessions')
      .delete()
      .eq('id', sesion.id)

    if (deleteError) {
      setError('No se pudo eliminar la sesión')
      return
    }
    cargarSesiones()
  }

  function handleEditGuardado() {
    setSesionEditando(null)
    cargarSesiones()
    if (onNewSession) onNewSession()
  }

  async function handleReenviarGarmin(sesion) {
    setReenviando(sesion.id)
    try {
      const res = await fetch('/.netlify/functions/send-to-intervals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-coach-secret': import.meta.env.VITE_COACH_SECRET || '',
        },
        body: JSON.stringify({ sessionId: sesion.id, coachId, athleteId }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        cargarSesiones()
      } else {
        setError(json.error || 'Error enviando a Garmin')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setReenviando(null)
    }
  }

  if (cargando) return <p style={{ color: COLORS.textSecondary }}>Cargando sesiones…</p>

  return (
    <div>
      {error && <p style={{ color: COLORS.error }}>{error}</p>}

      {!error && sesiones.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
          <p style={{ color: COLORS.textSecondary, margin: 0 }}>
            No hay sesiones prescritas para este atleta.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sesiones.map((sesion) => {
          const estado = estadoSesion(sesion, actividades)
          const completada = !!estado.actividadStrava
          const tieneWorkout = sesion.workout_steps?.bloques?.length > 0

          return (
            <div key={sesion.id} style={cardStyle}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                      {formatFechaSesion(sesion.fecha)}
                    </span>
                    <span
                      style={{
                        background: BADGE_COLORS[sesion.disciplina] || BADGE_COLORS.other,
                        color: '#FFFFFF',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {DISCIPLINE_LABELS[sesion.disciplina] || sesion.disciplina}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: estado.color }}>
                      {estado.texto}
                    </span>
                  </div>

                  <p style={{ margin: '8px 0 0', fontSize: 14, color: COLORS.textPrimary }}>
                    {tituloSesion(sesion)}
                  </p>

                  {sesion.notas && (
                    <p style={{ margin: '6px 0 0', fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' }}>
                      {sesion.notas}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {completada && (
                    <button
                      onClick={() => setActividadDetalle(estado.actividadStrava)}
                      style={{ ...accionBtnStyle, color: '#00E5A0', borderColor: '#00E5A0' }}
                    >
                      Ver actividad →
                    </button>
                  )}

                  {tieneWorkout && (
                    <button
                      onClick={() => setSesionWorkout(sesion)}
                      style={{ ...accionBtnStyle, color: COLORS.accent, borderColor: COLORS.accent }}
                    >
                      Workout
                    </button>
                  )}

                  <span
                    title={sesion.enviado_a_garmin ? 'Enviado a Garmin' : 'No enviado a Garmin'}
                    style={{ fontSize: 16 }}
                  >
                    {sesion.enviado_a_garmin ? '✅' : '⏳'}
                  </span>
                  {!sesion.enviado_a_garmin && tieneWorkout && (
                    <button
                      onClick={() => handleReenviarGarmin(sesion)}
                      disabled={reenviando === sesion.id}
                      style={{ ...accionBtnStyle, opacity: reenviando === sesion.id ? 0.5 : 1 }}
                    >
                      {reenviando === sesion.id ? '...' : 'Enviar'}
                    </button>
                  )}
                  <button onClick={() => setSesionEditando(sesion)} style={accionBtnStyle}>
                    Editar
                  </button>
                  <button
                    onClick={() => handleEliminar(sesion)}
                    style={{ ...accionBtnStyle, color: COLORS.error }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {sesionEditando && (
        <WorkoutBuilder
          isOpen={!!sesionEditando}
          athleteId={athleteId}
          coachId={coachId}
          sessionExistente={sesionEditando}
          atletaNombre={atletaNombre}
          onClose={() => setSesionEditando(null)}
          onSaved={handleEditGuardado}
        />
      )}

      {sesionWorkout && (
        <WorkoutModal
          sesion={sesionWorkout}
          onClose={() => setSesionWorkout(null)}
        />
      )}

      {actividadDetalle && (
        <ActivityDetail
          activityId={actividadDetalle.id}
          athleteId={athleteId}
          coachId={coachId}
          onClose={() => setActividadDetalle(null)}
        />
      )}
    </div>
  )
}
