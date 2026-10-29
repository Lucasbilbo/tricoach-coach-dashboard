import { useCallback, useEffect, useRef, useState } from 'react'
import { tieneEntreno } from '../lib/adjuntos'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { pedirDatosAtleta, invalidarDatosAtleta } from '../lib/athleteData'
import { ESTADO, asignarActividades, estadoDeSesion } from '../lib/estadoSesion'
import { COLORS, DISCIPLINE_LABELS, FONTS, cardStyle, ghostButtonStyle, iconButtonStyle, railStyle } from '../lib/theme'
import Icon from './ui/Icon'
import { MESES_CORTOS, lunesDeSemana, formatDiaMes, hoyMadrid } from '../lib/chartUtils'
import WorkoutBuilder from './WorkoutBuilder'
import WorkoutDetail from './WorkoutDetail'
import ActivityDetail from './ActivityDetail'
import SemanaCalendario from './SemanaCalendario'
import { semanasFuturas } from '../lib/planificacion'
import { useDisponibilidad } from '../hooks/useDisponibilidad'
import { formatHora, minutosPlanificados } from '../lib/disponibilidad'
import { cargarFeedback } from '../lib/feedbackApi'
import { FeedbackLinea, FeedbackTexto } from './FeedbackSesion'
import { cargarNutricion } from '../lib/nutricionApi'
import NutricionSesion from './NutricionSesion'
import { avisoTomado, tienePlan, tieneTomado } from '../lib/nutricion'
import Aviso from './ui/Aviso'
import { avisoEventoAntiguo } from '../lib/avisosReloj'
import Cumplimiento from './Cumplimiento'
import { calibrar, cargaSemana } from '../lib/proyeccion'
import DuracionSesion from './DuracionSesion'

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
// Ámbar de aviso (el de la agenda), no el de bici: "sin enviar" no es una disciplina
const COLOR_PENDIENTE = '#E8B84A'

// "TSS 210 de ~320": real (violeta de carga) frente a lo previsto (estimación,
// con "~"). Semanas futuras: solo lo previsto.
// Resumen de una semana plegada: "· 7 sesiones · ~6:30"
function ResumenSemana({ sesiones }) {
  if (!sesiones.length) return <span style={{ fontWeight: 400, color: COLORS.textTertiary }}>· sin sesiones</span>
  const { minutos, estimadas } = minutosPlanificados(sesiones)
  const h = Math.floor(minutos / 60)
  const m = String(minutos % 60).padStart(2, '0')
  return (
    <span style={{ fontWeight: 400, color: COLORS.textSecondary }}>
      · {sesiones.length} {sesiones.length === 1 ? 'sesión' : 'sesiones'}
      {minutos > 0 && <span style={{ fontFamily: FONTS.mono }}> · {estimadas ? '~' : ''}{h}:{m}</span>}
    </span>
  )
}

function CargaSemana({ prevista, real }) {
  if (prevista == null && real == null) return null
  const mono = { fontFamily: FONTS.mono }
  return (
    <span
      title="TSS de la semana: hecho frente a lo previsto con lo prescrito (estimado con las sesiones que ya ha hecho el atleta)"
      style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary, whiteSpace: 'nowrap' }}
    >
      TSS{' '}
      {real != null && <span style={{ ...mono, color: COLORS.load, fontWeight: 600 }}>{real}</span>}
      {real != null && prevista != null && ' de '}
      {prevista != null && <span style={{ ...mono, color: COLORS.textPrimary }}>~{prevista}</span>}
      {real == null && prevista != null && ' previsto'}
    </span>
  )
}

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
  // El reloj quedó con un entreno antiguo duplicado (no se pudo retirar)
  const [avisoReloj, setAvisoReloj] = useState(null)
  const [sesionEditando, setSesionEditando] = useState(null)
  // Semanas vacías extra pedidas con "Planificar otra semana"
  const [semanasExtra, setSemanasExtra] = useState(0)
  const [reenviando, setReenviando] = useState(null)
  const [expandidaId, setExpandidaId] = useState(null)
  const [actividadDetalle, setActividadDetalle] = useState(null)
  const [historicoAbierto, setHistoricoAbierto] = useState(false)
  // Actividades para calcular Completada/Pendiente, y el inicio de su cobertura.
  // El estado NO depende del selector de semanas del análisis (A1). Cacheadas.
  const [actividadesEstado, setActividadesEstado] = useState(null)
  const [coberturaDesde, setCoberturaDesde] = useState(null)
  const estadoCacheRef = useRef({ key: null })
  const disponibilidad = useDisponibilidad(athleteId)
  // Cómo le fue al atleta cada sesión (lo escribe él; aquí solo se lee)
  const [feedbacks, setFeedbacks] = useState(() => new Map())
  // Plan de nutrición por sesión (lo editan coach y atleta). disponible=false si
  // la tabla aún no existe (migración 017): la sección no se muestra.
  const [nutricion, setNutricion] = useState(() => ({ mapa: new Map(), disponible: false }))

  function actualizarNutricion(id, n) {
    setNutricion((prev) => {
      const mapa = new Map(prev.mapa)
      if (n) mapa.set(id, n)
      else mapa.delete(id)
      return { ...prev, mapa }
    })
  }

  // Semanas futuras plegadas: la actual y la siguiente se ven enteras; las demás
  // salen como una línea de resumen y se abren al pulsar (la lista medía ~8
  // pantallas en móvil). Las que el coach abre o añade quedan abiertas.
  const [semanasAbiertas, setSemanasAbiertas] = useState(() => new Set())
  const alternarSemana = (lunes) =>
    setSemanasAbiertas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(lunes)) nuevo.delete(lunes)
      else nuevo.add(lunes)
      return nuevo
    })

  // Panel de nutrición abierto (uno a la vez, como "Ver entreno")
  const [nutriAbiertaId, setNutriAbiertaId] = useState(null)

  function toggleExpandida(id) {
    setExpandidaId((prev) => (prev === id ? null : id))
  }

  // `senal.activo` (opcional) descarta una respuesta que llega tras desmontar o
  // cambiar de atleta: así no pisa la lista del atleta nuevo.
  const cargarSesiones = useCallback(async (senal) => {
    try {
      const [{ data, error: queryError }, mapaFeedback, datosNutricion] = await Promise.all([
        supabase
          .from('coach_sessions')
          .select('*')
          .eq('coach_id', coachId)
          .eq('athlete_id', athleteId)
          .order('fecha', { ascending: true })
          .order('hora_inicio_min', { ascending: true, nullsFirst: true }),
        cargarFeedback(athleteId),
        cargarNutricion(athleteId),
      ])
      if (senal && !senal.activo) return
      setFeedbacks(mapaFeedback)
      setNutricion(datosNutricion)

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
      const res = await pedirDatosAtleta(athleteId, semanas, { records: false })
      if (res.ok) {
        const json = res.json
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
    invalidarDatosAtleta(athleteId) // los metros de técnica salen de coach_sessions
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

  // { cerrar: false } = guardado a medias con un aviso en el creador: se
  // refresca la lista pero el creador sigue abierto para que se lea.
  function handleEditGuardado({ cerrar = true } = {}) {
    if (cerrar) setSesionEditando(null)
    invalidarEstado()
    cargarSesiones()
    // El padre remonta esta lista (key) con onNewSession: con el creador
    // abierto por un aviso eso lo cerraría y el aviso se perdería.
    if (cerrar && onNewSession) onNewSession()
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
        setAvisoReloj(avisoEventoAntiguo(json, sesion.fecha, 'coach'))
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
  // TSS previsto calibrado con lo que este atleta ya hizo (lib/proyeccion)
  const hoy = hoyMadrid()
  const calibracion = calibrar(sesiones, actsParaEstado, hoy)
  const coberturaCarga = actividadesEstado ? coberturaDesde : fechaMadridHace(weeks)

  const renderSesion = (sesion) => {
    const estado = estadoSesion(sesion, asignacion.get(sesion.id), coberturaDesde)
    const completada = !!estado.actividadStrava
    const tieneWorkout = tieneEntreno(sesion.workout_steps)
    const expandida = expandidaId === sesion.id
    const enviada = !!sesion.enviado_a_garmin
    // Pasada: el reloj ya no importa (ni el aviso naranja ni "Enviar al reloj").
    // Hoy sí: puede que aún no haya entrenado.
    const pasada = sesion.fecha < hoy
    const nutri = nutricion.mapa.get(sesion.id)
    // Nutrición: en futuras siempre (para planificar); en pasadas solo si hay algo
    const mostrarNutri = nutricion.disponible && sesion.disciplina !== 'other' && (!pasada || tienePlan(nutri) || tieneTomado(nutri))
    const avisoNutri = avisoTomado(nutri)
    const nutriAbierta = nutriAbiertaId === sesion.id

    return (
      <article key={sesion.id} style={{ ...cardStyle, padding: '14px 14px 12px 18px', ...railStyle(sesion.disciplina) }}>
        {/* Cabecera: fecha y deporte a la izquierda, acciones de icono a la derecha
            (así nunca se van a una línea propia en el móvil). */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0, paddingTop: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13, color: COLORS.textSecondary }}>
              <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>
                {formatFechaSesion(sesion.fecha)}{Number.isInteger(sesion.hora_inicio_min) ? ` · ${formatHora(sesion.hora_inicio_min)}` : ''}
              </span>
              <span>{DISC_LABELS[sesion.disciplina] || sesion.disciplina}</span>
              <DuracionSesion sesion={sesion} />
              {sesion.movida_por === 'atleta' && (
                <span title={sesion.movida_at ? `Movida el ${new Date(sesion.movida_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : undefined}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: COLORS.accent, fontSize: 12, fontWeight: 600 }}>
                  <Icon name="move" size={12} strokeWidth={2.4} />
                  Movida por {atletaNombre || 'el atleta'}
                </span>
              )}
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
                setSesionEditando({ ...sesion, id: undefined, fecha: '', intervals_event_id: null, enviado_a_garmin: false, _nutricionDe: sesion.id })
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
          {completada && <Cumplimiento sesion={sesion} actividad={estado.actividadStrava} />}
          {!pasada && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: enviada ? COLORS.textSecondary : COLOR_PENDIENTE }}>
              <Icon name="watch" size={15} />
              {enviada ? 'En el reloj' : 'Sin enviar al reloj'}
            </span>
          )}
          <FeedbackLinea feedback={feedbacks.get(sesion.id)} nombre={atletaNombre} />
        </div>
        <FeedbackTexto feedback={feedbacks.get(sesion.id)} />

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
            {mostrarNutri && (
              <button
                onClick={() => setNutriAbiertaId((prev) => (prev === sesion.id ? null : sesion.id))}
                style={{ ...textoBtnStyle, color: avisoNutri ? COLORS.error : textoBtnStyle.color }}
                aria-expanded={nutriAbierta}
                title={avisoNutri || undefined}
              >
                <Icon name={avisoNutri ? 'alert' : 'chevronDown'} size={16} style={{ transform: !avisoNutri && nutriAbierta ? 'rotate(180deg)' : 'none' }} />
                Nutrición
                {nutri?.carbohidratos_g_h > 0 && !avisoNutri && (
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textSecondary }}>{nutri.carbohidratos_g_h} g/h</span>
                )}
              </button>
            )}
          </div>
          {!enviada && !pasada && tieneWorkout && (
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

        {nutriAbierta && mostrarNutri && (
          <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.cardBorder}` }}>
            <NutricionSesion
              key={sesion.id}
              soloPanel
              sesion={sesion}
              uid={coachId}
              quien="coach"
              otroNombre={atletaNombre}
              inicial={nutri}
              onCambio={actualizarNutricion}
            />
          </div>
        )}

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
  // Pulsar un día de la tira: creador de entrenos con esa fecha ya puesta
  const planificarDia = (fecha, hora = null) => setSesionEditando({ fecha, hora_inicio_min: hora })

  // Mover desde la agenda (arrastrar / hoja "Mover"): pasa por move-session,
  // que también mueve el entreno en el reloj si ya estaba enviado.
  async function moverSesion(sesion, fecha, hora) {
    try {
      const res = await fetch('/.netlify/functions/move-session', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId: sesion.id, fecha, hora_inicio_min: hora }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = json.error || 'No se pudo mover la sesión'
        setError(msg)
        return { error: msg }
      }
      setError('')
      setAvisoReloj(avisoEventoAntiguo(json, sesion.fecha, 'coach'))
      setSesiones((prev) => prev
        .map((s) => (s.id === sesion.id ? { ...s, ...json.sesion } : s))
        .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.hora_inicio_min ?? -1) - (b.hora_inicio_min ?? -1))))
      invalidarEstado()
      return { ok: true }
    } catch {
      setError('Error de conexión moviendo la sesión')
      return { error: 'Error de conexión moviendo la sesión' }
    }
  }

  // plegada: la semana sale como una línea (fecha · nº sesiones · tiempo · TSS)
  // que se abre al pulsar. null = no plegable.
  const renderSemana = (lunes, sesionesGrupo, esActual, planificable = false, plegada = null) => {
    const plegable = plegada !== null
    const cabecera = (
      <>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {plegable && <Icon name="chevronDown" size={16} style={{ transform: plegada ? 'rotate(-90deg)' : 'none', color: COLORS.textSecondary }} />}
          {lunes === 'sin-fecha' ? 'Sin fecha' : `Semana del ${formatDiaMes(lunes)}`}
          {plegada && <ResumenSemana sesiones={sesionesGrupo} />}
        </span>
        {lunes !== 'sin-fecha' && (
          <CargaSemana {...cargaSemana({ lunes, sesiones: sesionesGrupo, actividades: actsParaEstado, calibracion, coberturaDesde: coberturaCarga, hoy })} />
        )}
      </>
    )
    return (
    <div key={lunes}>
      {plegable ? (
        <button
          type="button"
          onClick={() => alternarSemana(lunes)}
          aria-expanded={!plegada}
          style={{ ...cabeceraSemanaStyle, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', width: '100%', background: 'none', border: 'none', padding: plegada ? '10px 0' : 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', ...(plegada ? { margin: 0, borderBottom: `1px solid ${COLORS.cardBorder}` } : {}) }}
        >
          {cabecera}
        </button>
      ) : (
        <div style={{ ...cabeceraSemanaStyle, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          {cabecera}
        </div>
      )}
      {!plegada && lunes !== 'sin-fecha' && (
        <SemanaCalendario
          lunes={lunes}
          datos={disponibilidad}
          sesiones={sesionesGrupo}
          onDia={planificable ? planificarDia : undefined}
          onAbrir={(s) => setSesionEditando(s)}
          onMover={moverSesion}
          quien="coach"
          nombreAtleta={atletaNombre}
        />
      )}
      {plegada ? null : sesionesGrupo.length === 0 && (esActual || planificable) ? (
        <div style={{ ...cardStyle, color: COLORS.textSecondary, fontSize: 14, padding: 16 }}>
          {esActual ? 'Sin sesiones esta semana' : 'Sin sesiones'} · pulsa un día para planificar
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sesionesGrupo.map(renderSesion)}
        </div>
      )}
    </div>
    )
  }

  // Ancla a la semana actual: actual arriba (siempre), luego futuras
  // ascendentes, y las pasadas colapsadas bajo "Ver histórico" (descendentes).
  const grupos = agruparPorSemana(sesiones)
  const semanaActual = lunesDeSemana(hoyMadrid())
  const grupoActual = grupos.find((g) => g.lunes === semanaActual)
  // Futuras: SIEMPRE las próximas semanas aunque estén vacías (para planificar
  // viendo la disponibilidad), sin huecos, hasta la última con sesiones.
  const sesionesPorLunes = Object.fromEntries(grupos.map((g) => [g.lunes, g.sesiones]))
  const futuras = semanasFuturas(semanaActual, grupos.map((g) => g.lunes), semanasExtra)
    .map((lunes) => ({ lunes, sesiones: sesionesPorLunes[lunes] || [] }))
  const pasadas = grupos.filter((g) => g.lunes < semanaActual).reverse()

  return (
    <div>
      {error && <p style={{ color: COLORS.error }}>{error}</p>}
      {avisoReloj && <Aviso onCerrar={() => setAvisoReloj(null)} style={{ marginBottom: 16 }}>{avisoReloj}</Aviso>}

      {sesiones.length === 0 && (
        // B4: estado vacío claro para el coach (en vez de solo "Sin sesiones esta semana").
        <div style={{ ...cardStyle, textAlign: 'center', padding: 32, marginBottom: 24 }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>
            Aún no has prescrito sesiones a este atleta
          </p>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>
            Usa «Prescribir entreno» o pulsa un día de la semana para crear la primera.
          </p>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Semana actual: siempre visible, con mensaje si no hay sesiones */}
        {renderSemana(semanaActual, grupoActual ? grupoActual.sesiones : [], true, true)}

        {/* Semanas futuras: ascendente (más próxima primero), también vacías */}
        {/* La siguiente, entera; de ahí en adelante, plegadas salvo que se abran */}
        {futuras.map((g, i) => renderSemana(g.lunes, g.sesiones, false, true, i === 0 ? null : !semanasAbiertas.has(g.lunes)))}

        <button
          type="button"
          onClick={() => {
            // La semana nueva se añade abierta: se ha pedido para planificarla
            const ultima = futuras.length ? futuras[futuras.length - 1].lunes : semanaActual
            const nueva = new Date(Date.parse(`${ultima}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10)
            setSemanasAbiertas((prev) => new Set(prev).add(nueva))
            setSemanasExtra((n) => n + 1)
          }}
          style={{ ...ghostButtonStyle, alignSelf: 'flex-start', padding: '8px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Icon name="plus" size={15} strokeWidth={2} />
          Planificar otra semana
        </button>

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

      {sesionEditando && (
        <WorkoutBuilder
          isOpen={!!sesionEditando}
          athleteId={athleteId}
          coachId={coachId}
          sessionExistente={sesionEditando}
          atletaNombre={atletaNombre}
          nutricionExistente={nutricion.mapa.get(sesionEditando.id ?? sesionEditando._nutricionDe)}
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
