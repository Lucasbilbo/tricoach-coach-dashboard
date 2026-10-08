import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { ESTADO, asignarActividades, estadoDeSesion } from '../lib/estadoSesion'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS, cardStyle, iconButtonStyle, railStyle } from '../lib/theme'
import Icon from './ui/Icon'
import { MESES_CORTOS, lunesDeSemana, formatDiaMes } from '../lib/chartUtils'
import WorkoutBuilder from './WorkoutBuilder'
import WorkoutDetail from './WorkoutDetail'
import ActivityDetail from './ActivityDetail'

const DISC_LABELS = {
  run: 'Carrera',
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

// Fecha (YYYY-MM-DD, Europe/Madrid) de hace `weeks` semanas: inicio de la
// ventana de actividades disponibles.
function fechaMadridHace(weeks) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - weeks * 7 * 86400000))
}

// Texto/color del estado (la lógica vive en lib/estadoSesion, compartida con la
// vista del atleta).
function estadoSesion(sesion, actividad, coberturaDesde) {
  const estado = estadoDeSesion(sesion, actividad, hoyMadrid(), coberturaDesde)
  if (estado === ESTADO.completada) return { texto: '✓ Completada', color: COLORS.accent, actividadStrava: actividad }
  if (estado === ESTADO.programada) return { texto: 'Programada', color: COLORS.textSecondary, actividadStrava: null }
  if (estado === ESTADO.sinDatos) return { texto: 'Sin datos en el rango', color: COLORS.textTertiary, actividadStrava: null }
  return { texto: 'Pendiente', color: COLORS.textSecondary, actividadStrava: null }
}

function tituloSesion(sesion) {
  const nombre = sesion.workout_steps?.nombre
  if (nombre && nombre.trim()) return nombre.trim()
  const desc = sesion.descripcion || ''
  return desc.length > 40 ? desc.slice(0, 40) + '…' : desc || '—'
}

// Acción de texto (ver entreno / actividad): sin caja, para no competir con
// los botones de icono.
const textoBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  border: 'none',
  color: COLORS.textSecondary,
  padding: '8px 6px 8px 0',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  minHeight: 36,
}

// Botón de icono compacto de la cabecera de la tarjeta (sin caja: 3 seguidos
// pesaban demasiado en el móvil). Área táctil de 36 px.
const accionIconoStyle = {
  ...iconButtonStyle,
  border: 'none',
  color: COLORS.textTertiary,
}

// Ámbar: sesión que aún no está en el reloj.
const COLOR_PENDIENTE = DISCIPLINE_COLORS.bike

const cabeceraSemanaStyle = {
  margin: '0 0 10px',
  fontSize: 14,
  fontWeight: 600,
  color: COLORS.textPrimary,
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

const ESTADO_MAX_SEMANAS = 26 // tope de la ventana de actividades para el estado

export default function SessionsList({ coachId, athleteId, actividades, weeks = 8, atletaNombre, onNewSession }) {
  const [sesiones, setSesiones] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [sesionEditando, setSesionEditando] = useState(null)
  const [reenviando, setReenviando] = useState(null)
  const [expandidaId, setExpandidaId] = useState(null)
  const [actividadDetalle, setActividadDetalle] = useState(null)
  const [historicoAbierto, setHistoricoAbierto] = useState(false)
  // Actividades para calcular Completada/Pendiente, y el inicio de su cobertura.
  // El estado NO depende del selector de semanas del análisis (A1). Cacheadas.
  const [actividadesEstado, setActividadesEstado] = useState(null)
  const [coberturaDesde, setCoberturaDesde] = useState(null)
  const estadoCacheRef = useRef({ key: null })

  function toggleExpandida(id) {
    setExpandidaId((prev) => (prev === id ? null : id))
  }

  // `senal.activo` (opcional) descarta una respuesta que llega tras desmontar o
  // cambiar de atleta: así no pisa la lista del atleta nuevo.
  const cargarSesiones = useCallback(async (senal) => {
    try {
      const { data, error: queryError } = await supabase
        .from('coach_sessions')
        .select('*')
        .eq('coach_id', coachId)
        .eq('athlete_id', athleteId)
        .order('fecha', { ascending: true })
      if (senal && !senal.activo) return

      if (queryError) {
        setError('No se pudieron cargar las sesiones')
        return
      }
      setError('')
      const lista = data || []
      setSesiones(lista)

      // Estado Completada/Pendiente: solo las sesiones PASADAS definen la ventana
      // de actividades que necesitamos.
      const hoy = hoyMadrid()
      const fechasPasadas = lista.map((s) => s.fecha).filter((f) => f && f <= hoy)
      if (fechasPasadas.length === 0) return // solo futuras → todas "Programada"
      const masAntigua = fechasPasadas.reduce((min, f) => (f < min ? f : min), fechasPasadas[0])

      // 1) Si la ventana del selector ya cubre la sesión pasada más antigua,
      //    reutilizamos esas actividades: sin llamada extra.
      if (masAntigua >= fechaMadridHace(weeks)) {
        estadoCacheRef.current = { key: null }
        setActividadesEstado(null) // actsParaEstado cae en la prop `actividades`
        setCoberturaDesde(fechaMadridHace(weeks))
        return
      }

      // 2) Si no, UNA llamada dedicada dimensionada a la sesión más antigua, con
      //    tope de 26 semanas; lo más antiguo que el tope mostrará "sin datos en
      //    el rango" (nunca un falso Pendiente). Cacheada por ventana.
      const dias = Math.ceil((Date.now() - new Date(`${masAntigua}T00:00:00Z`).getTime()) / 86400000)
      const semanas = Math.min(Math.max(Math.ceil(dias / 7) + 1, 1), ESTADO_MAX_SEMANAS)
      setCoberturaDesde(fechaMadridHace(semanas))
      const key = `${athleteId}:${semanas}`
      if (estadoCacheRef.current.key === key) return // ya cargado para esta ventana
      const res = await fetch('/.netlify/functions/coach-athlete-data', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ athleteId, weeks: semanas, records: false }),
      })
      if (res.ok) {
        const json = await res.json().catch(() => null)
        if (senal && !senal.activo) return
        if (json?.actividades) {
          estadoCacheRef.current = { key }
          setActividadesEstado(json.actividades)
        }
      }
    } catch {
      if (!senal || senal.activo) setError('Error de conexión cargando las sesiones')
    } finally {
      if (!senal || senal.activo) setCargando(false)
    }
  }, [coachId, athleteId, weeks])

  // Invalida la caché de actividades del estado (crear/editar/eliminar sesión):
  // la próxima carga volverá a decidir reutilizar o pedir la ventana.
  function invalidarEstado() {
    estadoCacheRef.current = { key: null }
  }

  useEffect(() => {
    const senal = { activo: true }
    // Falso positivo de set-state-in-effect: cargarSesiones es async y todos
    // sus setState van DESPUÉS del primer await (no son síncronos).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarSesiones(senal)
    return () => { senal.activo = false }
  }, [cargarSesiones])

  async function handleEliminar(sesion) {
    const enReloj = !!sesion.intervals_event_id
    const confirmado = window.confirm(
      `¿Eliminar la sesión de ${DISCIPLINE_LABELS[sesion.disciplina] || sesion.disciplina} del ${formatFechaSesion(sesion.fecha)}?` +
        (enReloj ? '\n\nTambién se quitará del reloj del atleta.' : '')
    )
    if (!confirmado) return

    // Vía backend: borra también el entreno en Intervals (→ reloj).
    try {
      const res = await fetch('/.netlify/functions/delete-session', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId: sesion.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'No se pudo eliminar la sesión')
        return
      }
    } catch {
      setError('Error de conexión eliminando la sesión')
      return
    }
    invalidarEstado()
    cargarSesiones()
  }

  function handleEditGuardado() {
    setSesionEditando(null)
    invalidarEstado()
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
  // Una actividad completa como mucho una sesión (F6).
  const asignacion = asignarActividades(sesiones, actsParaEstado)

  const renderSesion = (sesion) => {
    const estado = estadoSesion(sesion, asignacion.get(sesion.id), coberturaDesde)
    const completada = !!estado.actividadStrava
    const tieneWorkout = sesion.workout_steps?.bloques?.length > 0
    const expandida = expandidaId === sesion.id
    const enviada = !!sesion.enviado_a_garmin

    return (
      <article key={sesion.id} style={{ ...cardStyle, padding: '14px 14px 12px 18px', ...railStyle(sesion.disciplina) }}>
        {/* Cabecera: fecha y deporte a la izquierda, acciones de icono a la derecha
            (así nunca se van a una línea propia en el móvil). */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0, paddingTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13, color: COLORS.textSecondary }}>
              <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{formatFechaSesion(sesion.fecha)}</span>
              <span>{DISC_LABELS[sesion.disciplina] || sesion.disciplina}</span>
              {sesion.duracion_min ? <span style={{ fontFamily: FONTS.mono }}>{sesion.duracion_min} min</span> : null}
            </div>
            <h3 style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{tituloSesion(sesion)}</h3>
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button onClick={() => setSesionEditando(sesion)} style={accionIconoStyle} aria-label="Editar sesión" title="Editar">
              <Icon name="edit" size={16} />
            </button>
            <button
              onClick={() =>
                // Copia sin id ni envío: el builder la trata como sesión nueva y
                // solo falta elegir el día.
                setSesionEditando({ ...sesion, id: undefined, fecha: '', intervals_event_id: null, enviado_a_garmin: false })
              }
              style={accionIconoStyle}
              aria-label="Duplicar sesión"
              title="Duplicar a otro día"
            >
              <Icon name="copy" size={16} />
            </button>
            <button onClick={() => handleEliminar(sesion)} style={accionIconoStyle} aria-label="Eliminar sesión" title="Eliminar">
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: estado.color, fontWeight: 500 }}>
            {completada && <Icon name="check" size={15} strokeWidth={2.2} />}
            {estado.texto.replace('✓ ', '')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: enviada ? COLORS.textSecondary : COLOR_PENDIENTE }}>
            <Icon name="watch" size={15} />
            {enviada ? 'En el reloj' : 'Sin enviar al reloj'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {tieneWorkout && (
              <button onClick={() => toggleExpandida(sesion.id)} style={textoBtnStyle} aria-expanded={expandida}>
                <Icon name="chevronDown" size={16} style={{ transform: expandida ? 'rotate(180deg)' : 'none' }} />
                {expandida ? 'Ocultar' : 'Ver entreno'}
              </button>
            )}
            {completada && (
              <button onClick={() => setActividadDetalle(estado.actividadStrava)} style={textoBtnStyle}>
                <Icon name="external" size={15} />
                Actividad
              </button>
            )}
          </div>
          {!enviada && tieneWorkout && (
            <button
              onClick={() => handleReenviarGarmin(sesion)}
              disabled={reenviando === sesion.id}
              style={{ ...iconButtonStyle, width: 'auto', padding: '0 12px', gap: 6, color: COLORS.accent, borderColor: 'rgba(47,191,175,0.45)', fontSize: 13, fontWeight: 600, opacity: reenviando === sesion.id ? 0.6 : 1 }}
            >
              <Icon name="send" size={15} />
              {reenviando === sesion.id ? 'Enviando…' : 'Enviar al reloj'}
            </button>
          )}
        </div>

        {expandida && tieneWorkout && (
          <div style={{ marginTop: 10 }}>
            <WorkoutDetail sesion={sesion} mostrarNotas={true} />
          </div>
        )}
      </article>
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
        <div style={{ ...cardStyle, color: COLORS.textSecondary, fontSize: 14, padding: 16 }}>
          Sin sesiones esta semana
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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

      {sesiones.length === 0 ? (
        // B4: estado vacío claro para el coach (en vez de solo "Sin sesiones esta semana").
        <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>
            Aún no has prescrito sesiones a este atleta
          </p>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>
            Usa «Prescribir entreno» para crear la primera.
          </p>
        </div>
      ) : (
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
              aria-expanded={historicoAbierto}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'transparent',
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 10,
                color: COLORS.textSecondary,
                padding: '12px 14px',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <Icon name="chevronDown" size={16} style={{ transform: historicoAbierto ? 'rotate(180deg)' : 'none' }} />
              Semanas anteriores
              <span style={{ fontFamily: FONTS.mono, color: COLORS.textTertiary }}>{pasadas.length}</span>
            </button>
            {historicoAbierto && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 12 }}>
                {pasadas.map((g) => renderSemana(g.lunes, g.sesiones, false))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

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
