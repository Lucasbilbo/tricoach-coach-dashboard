import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, cardStyle } from '../lib/theme'
import { MESES_CORTOS, lunesDeSemana, formatDiaMes } from '../lib/chartUtils'
import { useIsMobile } from '../hooks/useIsMobile'
import WorkoutBuilder from './WorkoutBuilder'
import WorkoutDetail from './WorkoutDetail'
import ActivityDetail from './ActivityDetail'

const BADGE_COLORS = DISCIPLINE_COLORS

const DISC_LABELS = {
  run: 'Running',
  swim: 'Natación',
  bike: 'Ciclismo',
  strength: 'Fuerza',
  other: 'Otro',
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
  if (act) return { texto: '✓ Completada', color: COLORS.accent, actividadStrava: act }
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
  padding: '8px 10px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'Archivo', sans-serif",
  minHeight: 36,
  lineHeight: 1,
}

const cabeceraSemanaStyle = {
  margin: '0 0 8px',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

// Agrupa las sesiones por semana (lunes, mismo helper que los charts) preservando
// el orden de entrada. Sesiones sin fecha (no debería haber: fecha es NOT NULL)
// caen en un grupo aparte al final del recorrido.
function agruparPorSemana(sesiones) {
  const grupos = []
  const indicePorLunes = {}
  for (const sesion of sesiones) {
    const lunes = sesion.fecha ? lunesDeSemana(sesion.fecha) : 'sin-fecha'
    if (indicePorLunes[lunes] == null) {
      indicePorLunes[lunes] = grupos.length
      grupos.push({ lunes, sesiones: [] })
    }
    grupos[indicePorLunes[lunes]].sesiones.push(sesion)
  }
  return grupos
}

export default function SessionsList({ coachId, athleteId, actividades, atletaNombre, onNewSession }) {
  const isMobile = useIsMobile()
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [sesionEditando, setSesionEditando] = useState(null)
  const [reenviando, setReenviando] = useState(null)
  const [expandidaId, setExpandidaId] = useState(null)
  const [actividadDetalle, setActividadDetalle] = useState(null)
  const [historicoAbierto, setHistoricoAbierto] = useState(false)
  // Actividades para calcular Completada/Pendiente, dimensionadas a la sesión más
  // antigua y NO al selector de semanas del análisis (A1). Cacheadas por ventana.
  const [actividadesEstado, setActividadesEstado] = useState(null)
  const estadoCacheRef = useRef({ key: null })

  function toggleExpandida(id) {
    setExpandidaId((prev) => (prev === id ? null : id))
  }

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
      const lista = data || []
      setSesiones(lista)

      // A1: el estado Completada/Pendiente no debe depender del rango del selector.
      // Traemos las actividades que cubren desde la sesión más antigua hasta hoy en
      // UNA llamada dedicada, cacheada por ventana (no se repite al cambiar el
      // selector ni al recargar si la sesión más antigua no cambia).
      const fechas = lista.map((s) => s.fecha).filter(Boolean)
      if (fechas.length > 0) {
        const masAntigua = fechas.reduce((min, f) => (f < min ? f : min), fechas[0])
        const dias = Math.ceil((Date.now() - new Date(`${masAntigua}T00:00:00Z`).getTime()) / 86400000)
        const weeks = Math.min(Math.max(Math.ceil(dias / 7) + 1, 1), 52)
        const key = `${athleteId}:${weeks}`
        if (estadoCacheRef.current.key !== key) {
          const res = await fetch('/.netlify/functions/coach-athlete-data', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ athleteId, weeks }),
          })
          if (res.ok) {
            const json = await res.json().catch(() => null)
            if (json?.actividades) {
              estadoCacheRef.current = { key }
              setActividadesEstado(json.actividades)
            }
          }
        }
      }
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
      // coach/atleta se derivan de la sesión y del JWT en el backend
      const res = await fetch('/.netlify/functions/send-to-intervals', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId: sesion.id }),
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

  // Card individual de sesión (JSX intacto; solo extraído para reutilizarlo en
  // semana actual / futuras / histórico).
  // Usa las actividades dedicadas (cubren toda la historia de sesiones); mientras
  // cargan, cae en las del análisis para no mostrar vacío.
  const actsParaEstado = actividadesEstado || actividades

  const renderSesion = (sesion) => {
    const estado = estadoSesion(sesion, actsParaEstado)
    const completada = !!estado.actividadStrava
    const tieneWorkout = sesion.workout_steps?.bloques?.length > 0
    const expandida = expandidaId === sesion.id

    return (
      <div
        key={sesion.id}
        onClick={() => tieneWorkout && toggleExpandida(sesion.id)}
        style={{ ...cardStyle, cursor: tieneWorkout ? 'pointer' : 'default' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
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
                {DISC_LABELS[sesion.disciplina] || sesion.disciplina}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: estado.color }}>
                {estado.texto}
              </span>
            </div>

            <p style={{ margin: '8px 0 0', fontSize: 14, color: COLORS.textPrimary }}>
              {tituloSesion(sesion)}
            </p>

          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', ...(isMobile && { width: '100%', marginTop: 8 }) }}>
            {completada && (
              <button
                onClick={(e) => { e.stopPropagation(); setActividadDetalle(estado.actividadStrava) }}
                style={{ ...accionBtnStyle, color: COLORS.accent, borderColor: COLORS.accent }}
              >
                Ver actividad →
              </button>
            )}

            {tieneWorkout && (
              <button
                onClick={(e) => { e.stopPropagation(); toggleExpandida(sesion.id) }}
                style={{ ...accionBtnStyle, color: COLORS.accent, borderColor: COLORS.accent }}
              >
                {expandida ? '▼ Workout' : '▶ Workout'}
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
                onClick={(e) => { e.stopPropagation(); handleReenviarGarmin(sesion) }}
                disabled={reenviando === sesion.id}
                style={{ ...accionBtnStyle, opacity: reenviando === sesion.id ? 0.5 : 1 }}
              >
                {reenviando === sesion.id ? '...' : 'Enviar'}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); setSesionEditando(sesion) }} style={accionBtnStyle}>
              Editar
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleEliminar(sesion) }}
              style={{ ...accionBtnStyle, color: COLORS.error }}
            >
              Eliminar
            </button>
          </div>
        </div>

        {expandida && tieneWorkout && (
          <div onClick={(e) => e.stopPropagation()}>
            <WorkoutDetail sesion={sesion} mostrarNotas={true} />
          </div>
        )}
      </div>
    )
  }

  // Cabecera de semana + sus sesiones. La semana actual (esActual) muestra un
  // mensaje si no tiene sesiones, en vez de omitirse.
  const renderSemana = (lunes, sesionesGrupo, esActual) => (
    <div key={lunes}>
      <div style={cabeceraSemanaStyle}>
        {lunes === 'sin-fecha' ? 'Sin fecha' : `Semana del ${formatDiaMes(lunes)}`}
      </div>
      {sesionesGrupo.length === 0 && esActual ? (
        <div style={{ ...cardStyle, color: COLORS.textSecondary, fontSize: 13 }}>
          Sin sesiones esta semana
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sesionesGrupo.map(renderSesion)}
        </div>
      )}
    </div>
  )

  // Ancla a la semana actual: actual arriba (siempre), luego futuras
  // ascendentes, y las pasadas colapsadas bajo "Ver histórico" (descendentes).
  const grupos = agruparPorSemana(sesiones)
  const semanaActual = lunesDeSemana(hoyMadrid())
  const grupoActual = grupos.find((g) => g.lunes === semanaActual)
  const futuras = grupos.filter((g) => g.lunes > semanaActual)
  const pasadas = grupos.filter((g) => g.lunes < semanaActual).reverse()

  return (
    <div>
      {error && <p style={{ color: COLORS.error }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Semana actual: siempre visible, con mensaje si no hay sesiones */}
        {renderSemana(semanaActual, grupoActual ? grupoActual.sesiones : [], true)}

        {/* Semanas futuras: ascendente (más próxima primero) */}
        {futuras.map((g) => renderSemana(g.lunes, g.sesiones, false))}

        {/* Histórico (semanas pasadas): colapsado por defecto, descendente */}
        {pasadas.length > 0 && (
          <div>
            <button
              onClick={() => setHistoricoAbierto((v) => !v)}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 8,
                color: COLORS.textSecondary,
                padding: '10px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Archivo', sans-serif",
                width: '100%',
                textAlign: 'left',
              }}
            >
              {historicoAbierto ? '▼' : '▶'} Ver histórico ({pasadas.length})
            </button>
            {historicoAbierto && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 12 }}>
                {pasadas.map((g) => renderSemana(g.lunes, g.sesiones, false))}
              </div>
            )}
          </div>
        )}
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

      {actividadDetalle && (
        <ActivityDetail
          activityId={actividadDetalle.id}
          athleteId={athleteId}
          onClose={() => setActividadDetalle(null)}
        />
      )}
    </div>
  )
}
