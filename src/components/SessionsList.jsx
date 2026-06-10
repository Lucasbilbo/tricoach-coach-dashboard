import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS, DISCIPLINE_LABELS, cardStyle } from '../lib/theme'
import { MESES_CORTOS } from '../lib/chartUtils'
import PrescribeModal from './PrescribeModal'

const BADGE_COLORS = {
  swim: '#00D4FF',
  bike: '#00E5A0',
  run: '#FF4D6D',
  strength: '#7C3AED',
  other: '#94A3B8',
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// 'YYYY-MM-DD' → 'Lun 8 Jun'
function formatFechaSesion(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_CORTOS[date.getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}`
}

// Hoy en Europe/Madrid como YYYY-MM-DD
function hoyMadrid() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function estadoSesion(sesion, actividades) {
  const completada = (actividades || []).some(
    (act) => act.fecha === sesion.fecha && act.disciplina === sesion.disciplina
  )
  if (completada) return { texto: '✓ Completada', color: '#00E5A0' }
  if (sesion.fecha > hoyMadrid()) return { texto: 'Programada', color: COLORS.accent }
  return { texto: 'Pendiente', color: COLORS.textSecondary }
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

export default function SessionsList({ coachId, athleteId, actividades, onNewSession }) {
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [sesionEditando, setSesionEditando] = useState(null)

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
    // El setState ocurre tras await dentro de cargarSesiones, no de forma síncrona
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
                    {sesion.duracion_min != null && (
                      <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                        {sesion.duracion_min} min
                      </span>
                    )}
                    {sesion.intensidad && (
                      <span
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          color: COLORS.textSecondary,
                          borderRadius: 4,
                          padding: '2px 6px',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {sesion.intensidad}
                      </span>
                    )}
                    <span style={{ fontSize: 12, fontWeight: 600, color: estado.color }}>
                      {estado.texto}
                    </span>
                  </div>

                  <p style={{ margin: '8px 0 0', fontSize: 14, color: COLORS.textPrimary }}>
                    {sesion.descripcion}
                  </p>

                  {sesion.notas && (
                    <p
                      style={{
                        margin: '6px 0 0',
                        fontSize: 13,
                        color: COLORS.textSecondary,
                        fontStyle: 'italic',
                      }}
                    >
                      {sesion.notas}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
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
        <PrescribeModal
          athleteId={athleteId}
          coachId={coachId}
          sessionToEdit={sesionEditando}
          onClose={() => setSesionEditando(null)}
          onSaved={handleEditGuardado}
        />
      )}
    </div>
  )
}
