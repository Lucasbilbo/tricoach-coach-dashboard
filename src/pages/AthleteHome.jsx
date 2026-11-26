import { useEffect, useRef, useState } from 'react'
import { tieneEntreno } from '../lib/adjuntos'
import { esDescanso } from '../lib/descanso'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { pedirDatosAtleta } from '../lib/athleteData'
import { misConexiones } from '../lib/connections'
import { ESTADO, asignarActividades, estadoDeSesion, fechaHaceSemanas, semanasNecesarias } from '../lib/estadoSesion'
import { hoyMadrid, MESES_CORTOS } from '../lib/chartUtils'
import { precargarGraficos } from '../lib/precargarGraficos'
import { COLORS, DISCIPLINE_COLORS, buttonStyle, cardStyle, displayStyle, ghostButtonStyle, iconButtonStyle, pageStyle } from '../lib/theme'
import Icon from '../components/ui/Icon'
import { PageHeader, SectionTitle, Tabs } from '../components/ui/Layout'
import SelectorPeriodo from '../components/ui/SelectorPeriodo'
import WorkoutDetail, { Perfil } from '../components/WorkoutDetail'
import { resumenBloque } from '../components/workout/resumen'
import PotenciaAjustes from '../components/PotenciaAjustes'
import WeekCompare from '../components/WeekCompare'
import StravaAnalysis from '../components/shared/StravaAnalysis'
import SinStrava from '../components/shared/SinStrava'
import AnalisisCargando from '../components/shared/AnalisisCargando'
import SeasonPanel from '../components/season/SeasonPanel'
import DisponibilidadEditor from '../components/DisponibilidadEditor'
import AgendaAtleta from '../components/AgendaAtleta'
import { formatHora } from '../lib/disponibilidad'
import { cargarFeedback } from '../lib/feedbackApi'
import { resumenFeedback } from '../lib/feedback'
import { FeedbackEditor, FeedbackRapido } from '../components/FeedbackSesion'
import { cargarNutricion } from '../lib/nutricionApi'
import NutricionSesion from '../components/NutricionSesion'
import Cumplimiento from '../components/Cumplimiento'
import DuracionSesion from '../components/DuracionSesion'
import { duracionPrevista } from '../lib/tssPrevisto'
import { SEMANAS_BASE, SEMANAS_CARGA, claveArchivo, esPreset, periodoInicial } from '../lib/periodo'
import { useDatosRango } from '../hooks/useDatosRango'


const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatFechaLarga(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_CORTOS[date.getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}`
}

function tituloSesion(sesion) {
  const nombre = sesion.workout_steps?.nombre
  if (nombre && nombre.trim()) return nombre.trim()
  const desc = sesion.descripcion || ''
  return desc.length > 40 ? desc.slice(0, 40) + '…' : desc || '—'
}

const DISC_LABELS_HOME = {
  run: 'Carrera',
  bike: 'Ciclismo',
  swim: 'Natación',
  strength: 'Fuerza',
  other: 'Otro',
  rest: 'Descanso',
}

// "Hoy", "Mañana" o el día de la semana para los próximos 6 días.
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
function diaRelativo(fecha) {
  const hoy = hoyMadrid()
  const dias = Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000)
  if (dias === 0) return 'Hoy'
  if (dias === 1) return 'Mañana'
  if (dias > 1 && dias < 7) return DIAS_LARGOS[new Date(`${fecha}T12:00:00Z`).getUTCDay()]
  return null
}

// Fecha en bloque (de la dirección B «Boya»): el número del día grande y
// condensado, como un dorsal, sobre el color de la disciplina. Se escanea
// mejor que «Viernes · 27 Nov». En lo pasado va apagado.
function BloqueFecha({ fecha, disciplina, apagado = false }) {
  const color = DISCIPLINE_COLORS[disciplina] || DISCIPLINE_COLORS.other
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = DIAS_CORTOS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return (
    <span
      aria-hidden="true"
      style={{
        width: 50, height: 52, flexShrink: 0, borderRadius: 14,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: apagado ? 'rgba(255,255,255,0.04)' : `${color}26`,
        boxShadow: `inset 0 0 0 1.5px ${apagado ? 'rgba(255,255,255,0.06)' : `${color}73`}`,
      }}
    >
      <span style={{ fontSize: 25, fontWeight: 900, fontStretch: '72%', lineHeight: 0.95, color: apagado ? COLORS.textSecondary : COLORS.textPrimary }}>{d}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: apagado ? COLORS.textTertiary : COLORS.textSoft, marginTop: 2 }}>{dia}</span>
    </span>
  )
}

// «Miércoles, 25 de noviembre» en hora de Madrid: la cabecera de /home.
function fechaDeHoy() {
  const t = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(new Date())
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const PAGINA_PASADAS = 10
// Ámbar de aviso (el de la agenda), no el ámbar de bici: aquí no hay disciplina
const AVISO_RELOJ = '#E8B84A'
// Próximos: con la planificación a 2–3 semanas caben 15–20; se pagina igual
// (antes .limit(10) sin más: el resto no salía en la lista. Auditoría B3).
const PAGINA_PROXIMAS = 10

// Actividades de Strava que cubren las sesiones pasadas mostradas (tope 26
// semanas). Devuelve el nuevo estado, o null si no hace falta pedir más o si no
// hay Strava (entonces el estado se muestra "—").
async function pedirActividadesEstado(userId, lista, actual) {
  const hoy = hoyMadrid()
  const semanas = semanasNecesarias(lista.map((x) => x.fecha), hoy)
  if (!semanas || !userId) return null
  if (actual?.actividades && actual.semanas >= semanas) return null
  try {
    const res = await pedirDatosAtleta(userId, semanas, { records: false })
    if (!res.ok) return null
    const json = res.json
    return json?.actividades ? { actividades: json.actividades, desde: fechaHaceSemanas(hoy, semanas), semanas } : null
  } catch {
    return null
  }
}

function EstadoPasada({ estado }) {
  if (estado === ESTADO.completada)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: COLORS.accent }}>
        <Icon name="check" size={15} strokeWidth={2.2} />
        Hecho
      </span>
    )
  if (estado === ESTADO.descanso) return <span style={{ color: COLORS.textTertiary }}>Descanso</span>
  if (estado === ESTADO.pendiente) return <span style={{ color: COLORS.textSecondary }}>Sin hacer</span>
  return <span style={{ color: COLORS.textTertiary }} title="Sin datos de Strava para esa fecha">—</span>
}

export default function AthleteHome() {
  const navigate = useNavigate()

  // Auth / IDs
  const [userId, setUserId] = useState(null)

  // Perfil
  const [perfil, setPerfil] = useState(null)

  // Strava data
  // Periodo del Análisis (preset, semana o rango). `weeks` solo sigue a los presets;
  // con una semana o un rango el tramo se pide aparte (useDatosRango).
  const [periodo, setPeriodo] = useState(periodoInicial)
  const weeks = esPreset(periodo) ? periodo.semanas : SEMANAS_BASE
  const [refrescoStrava, setRefrescoStrava] = useState(0) // recarga el análisis tras cambiar la FC máx
  const [datos, setDatos] = useState(null)
  // userId:weeks de lo que hay en `datos` (evita volver a pedir al cambiar de pestaña)
  const stravaClaveRef = useRef(null)
  const [cargandoStrava, setCargandoStrava] = useState(false)
  const [errorStrava, setErrorStrava] = useState('')
  const [sinStrava, setSinStrava] = useState(false) // 409: Strava sin conectar (estado normal, no error)
  const [comparadorAbierto, setComparadorAbierto] = useState(false)

  // Sesiones prescritas
  const [proximas, setProximas] = useState([])
  const [pasadas, setPasadas] = useState([])
  const [cargandoSesiones, setCargandoSesiones] = useState(true)
  const [errorSesiones, setErrorSesiones] = useState(false)
  const [expandidas, setExpandidas] = useState({})
  const [enviandoGarmin, setEnviandoGarmin] = useState({})
  const [erroresGarmin, setErroresGarmin] = useState({})
  // Historial paginado + estado Hecha/Pendiente (misma lógica que ve el coach)
  const [hayMasPasadas, setHayMasPasadas] = useState(false)
  const [hayMasProximas, setHayMasProximas] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [estadoActs, setEstadoActs] = useState({ actividades: null, desde: null, semanas: 0 })
  // Cómo le fue cada sesión (sesion_feedback): Map<session_id, feedback>
  const [feedbacks, setFeedbacks] = useState(() => new Map())
  const [feedbackAbierto, setFeedbackAbierto] = useState({})
  // Plan de nutrición por sesión (sesion_nutricion; lo editan atleta y coach)
  const [nutricion, setNutricion] = useState(() => ({ mapa: new Map(), disponible: false }))

  // Tabs
  const [activeTab, setActiveTab] = useState('sesiones')
  // Al abrir Análisis se pide ya el paquete de gráficos, en paralelo con los datos
  useEffect(() => {
    if (activeTab === 'analisis') precargarGraficos()
  }, [activeTab])
  // Ajustes (potenciómetro, FTP, FC umbral) desde el botón de la cabecera
  const [verAjustes, setVerAjustes] = useState(false)
  // Sube al mover un entreno desde la agenda: recarga la lista de próximos
  const [recargaSesiones, setRecargaSesiones] = useState(0)

  // ── Paso 1+2 fusionados: sesión + perfil + sesiones en paralelo ──────
  // Antes había dos useEffects en cadena (getSession → setUserId → sesiones),
  // lo que añadía un render extra de latencia. Ahora se lanza todo a la vez.
  useEffect(() => {
    let activo = true

    async function cargarPerfilYSesiones() {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id
      if (!uid) {
        navigate('/')
        return
      }
      if (!activo) return
      setUserId(uid)

      const hoy = hoyMadrid()
      setCargandoSesiones(true)

      // Conexiones (Strava/Intervals) van por una Netlify Function (Ohio →
      // Supabase en Frankfurt, ~1 s): NO deben frenar la lista de entrenos, que
      // sale directa de Supabase en ~100 ms. Se piden ya y se añaden al llegar
      // (mientras, conexiones = undefined: no se pinta "Enviar al reloj").
      misConexiones().then((conexiones) => {
        if (activo) setPerfil((p) => ({ ...(p || {}), conexiones }))
      })

      // Perfil y sesiones en paralelo — ya tenemos el uid.
      const [perfilRes, proximasRes, pasadasRes, mapaFeedback, datosNutricion] = await Promise.all([
        supabase.from('profiles').select('nombre, fc_maxima').eq('id', uid).maybeSingle(),
        supabase
          .from('coach_sessions')
          .select('*')
          .eq('athlete_id', uid)
          .gte('fecha', hoy)
          .order('fecha', { ascending: true })
          .order('hora_inicio_min', { ascending: true, nullsFirst: true })
          .order('id', { ascending: true }) // desempate estable para paginar
          .range(0, PAGINA_PROXIMAS),
        supabase
          .from('coach_sessions')
          .select('*')
          .eq('athlete_id', uid)
          .lt('fecha', hoy)
          .order('fecha', { ascending: false })
          .range(0, PAGINA_PASADAS),
        cargarFeedback(uid),
        cargarNutricion(uid),
      ])

      if (!activo) return
      setPerfil((p) => ({ ...(perfilRes.data || {}), conexiones: p?.conexiones }))
      setFeedbacks(mapaFeedback)
      setNutricion(datosNutricion)

      // Distinguir un error de carga de un "no hay entrenamientos" legítimo (F4b)
      if (proximasRes.error || pasadasRes.error) {
        setErrorSesiones(true)
        setProximas([])
        setPasadas([])
      } else {
        setErrorSesiones(false)
        // Se pide una de más para saber si hay otra página
        const proximasLista = proximasRes.data || []
        setHayMasProximas(proximasLista.length > PAGINA_PROXIMAS)
        setProximas(proximasLista.slice(0, PAGINA_PROXIMAS))
        // Se pide una de más para saber si hay otra página
        const lista = pasadasRes.data || []
        setHayMasPasadas(lista.length > PAGINA_PASADAS)
        const visibles = lista.slice(0, PAGINA_PASADAS)
        setPasadas(visibles)
      }
      setCargandoSesiones(false)
      if (!proximasRes.error && !pasadasRes.error) {
        const r = await pedirActividadesEstado(uid, (pasadasRes.data || []).slice(0, PAGINA_PASADAS), null)
        if (activo && r) setEstadoActs(r)
      }
    }

    cargarPerfilYSesiones()
    return () => { activo = false }
  // recargaSesiones también dispara este effect para refrescar las sesiones
  }, [navigate, recargaSesiones])

  // ── Paso 3: cargar datos Strava ───────────────────────────────────────
  useEffect(() => {
    if (!userId || activeTab !== 'analisis') return
    const clave = `${userId}:${weeks}`
    if (stravaClaveRef.current === clave) return // ya cargado para este atleta y rango
    let activo = true

    async function cargarStrava() {
      setCargandoStrava(true)
      setErrorStrava('')
      setSinStrava(false)
      try {
        // El atleta pide SUS datos: el backend lo autoriza porque el uid del
        // JWT coincide con athleteId
        // `carga`: la misma respuesta trae la serie de 26 semanas del análisis (ATL/CTL)
        const res = await pedirDatosAtleta(userId, weeks, { carga: SEMANAS_CARGA })
        const json = res.json
        if (!activo) return
        if (res.status === 409) {
          setSinStrava(true)
          return
        }
        if (!res.ok || !json) {
          setErrorStrava(json?.error || 'No se pudieron cargar los datos de Strava')
          return
        }
        stravaClaveRef.current = clave
        setDatos({ ...json, _weeks: weeks, _userId: userId })
      } catch {
        if (activo) setErrorStrava('Error de conexión cargando datos de Strava')
      } finally {
        if (activo) setCargandoStrava(false)
      }
    }

    cargarStrava()
    return () => { activo = false }
  }, [userId, weeks, activeTab, refrescoStrava])

  async function cargarMasProximas() {
    if (!userId || cargandoMas) return
    setCargandoMas(true)
    const desde = proximas.length
    const { data, error } = await supabase
      .from('coach_sessions')
      .select('*')
      .eq('athlete_id', userId)
      .gte('fecha', hoyMadrid())
      .order('fecha', { ascending: true })
      .order('hora_inicio_min', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA_PROXIMAS)
    setCargandoMas(false)
    if (error) return
    setHayMasProximas((data || []).length > PAGINA_PROXIMAS)
    const vistas = new Set(proximas.map((x) => x.id))
    setProximas([...proximas, ...(data || []).slice(0, PAGINA_PROXIMAS).filter((x) => !vistas.has(x.id))])
  }

  async function cargarMasPasadas() {
    if (!userId || cargandoMas) return
    setCargandoMas(true)
    const desde = pasadas.length
    const { data, error } = await supabase
      .from('coach_sessions')
      .select('*')
      .eq('athlete_id', userId)
      .lt('fecha', hoyMadrid())
      .order('fecha', { ascending: false })
      .range(desde, desde + PAGINA_PASADAS)
    setCargandoMas(false)
    if (error) return
    const nuevas = (data || []).slice(0, PAGINA_PASADAS)
    setHayMasPasadas((data || []).length > PAGINA_PASADAS)
    const todas = [...pasadas, ...nuevas]
    setPasadas(todas)
    const r = await pedirActividadesEstado(userId, todas, estadoActs)
    if (r) setEstadoActs(r)
  }

  function toggleDetalle(id) {
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function actualizarNutricion(id, n) {
    setNutricion((prev) => {
      const mapa = new Map(prev.mapa)
      if (n) mapa.set(id, n)
      else mapa.delete(id)
      return { ...prev, mapa }
    })
  }

  function actualizarFeedback(id, fb) {
    setFeedbacks((prev) => {
      const m = new Map(prev)
      if (fb) m.set(id, fb)
      else m.delete(id)
      return m
    })
  }

  function marcarEnviado(id) {
    setProximas((prev) => prev.map((s) => s.id === id ? { ...s, enviado_a_garmin: true } : s))
    setPasadas((prev) => prev.map((s) => s.id === id ? { ...s, enviado_a_garmin: true } : s))
  }

  // Inicia el OAuth de Strava: pide la authUrl a la función autenticada
  // (state firmado, S4) y redirige el navegador a Strava.
  async function conectarStrava() {
    if (!userId) return
    try {
      const res = await fetch('/.netlify/functions/strava-auth?action=start', {
        method: 'POST',
        headers: await authHeaders(),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.authUrl) {
        window.location.href = json.authUrl
      } else {
        setErrorStrava('No se pudo iniciar la conexión con Strava. Inténtalo de nuevo.')
      }
    } catch {
      setErrorStrava('Error de conexión con Strava. Inténtalo de nuevo.')
    }
  }

  async function enviarAGarmin(sesion) {
    setEnviandoGarmin((prev) => ({ ...prev, [sesion.id]: true }))
    setErroresGarmin((prev) => ({ ...prev, [sesion.id]: null }))
    try {
      // El backend autoriza porque el uid del JWT es el atleta de la sesión
      const res = await fetch('/.netlify/functions/send-to-intervals', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId: sesion.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        marcarEnviado(sesion.id)
      } else {
        setErroresGarmin((prev) => ({ ...prev, [sesion.id]: json.error || 'Error enviando a Garmin' }))
      }
    } catch {
      setErroresGarmin((prev) => ({ ...prev, [sesion.id]: 'Error de conexión' }))
    } finally {
      setEnviandoGarmin((prev) => ({ ...prev, [sesion.id]: false }))
    }
  }

  const semanas = datos?.semanas || []
  const rangoDatos = useDatosRango(userId, periodo, refrescoStrava)
  const datosAnalisis = rangoDatos.activo ? rangoDatos.datos : datos
  const cargandoAnalisis = rangoDatos.activo ? rangoDatos.cargando : cargandoStrava
  const errorAnalisis = rangoDatos.activo ? rangoDatos.error : errorStrava
  const asignacion = asignarActividades(pasadas, estadoActs.actividades)
  const intervalsOk = !!perfil?.conexiones?.intervals
  const stravaOk = !!perfil?.conexiones?.strava

  async function cerrarSesion() {
    await supabase.auth.signOut()
    navigate('/')
  }

  // La sesión protagonista (hoy, o la próxima si hoy no hay nada). Rediseño
  // 2026-11 (dirección A «Pulso»): el nombre en grande, la duración y el perfil
  // de intensidad a lo ancho con el color de la disciplina, el plan en una
  // línea y las dos acciones del día como botones de verdad.
  const renderProxima = (sesion) => {
    const tieneDetalle = tieneEntreno(sesion.workout_steps)
    const abierta = !!expandidas[sesion.id]
    const relativo = diaRelativo(sesion.fecha)
    const enviada = !!sesion.enviado_a_garmin
    const descanso = esDescanso(sesion)
    const esHoy = relativo === 'Hoy'
    const color = DISCIPLINE_COLORS[sesion.disciplina] || DISCIPLINE_COLORS.other
    const hora = Number.isInteger(sesion.hora_inicio_min) ? formatHora(sesion.hora_inicio_min) : null
    const dp = duracionPrevista(sesion)
    const bloques = sesion.workout_steps?.bloques || []
    const plan = bloques.map(resumenBloque).filter(Boolean)
    const cuando = relativo
      ? `${relativo}${hora ? ` a las ${hora}` : ''}`
      : `${formatFechaLarga(sesion.fecha)}${hora ? ` · ${hora}` : ''}`
    const conFeedback = feedbacks.has(sesion.id)
    return (
      <article
        key={sesion.id}
        style={{
          ...cardStyle,
          padding: 0,
          overflow: 'hidden',
          borderRadius: 24,
          background: descanso ? COLORS.card : `radial-gradient(120% 70% at 50% 0%, ${color}2E, ${color}00 65%), ${COLORS.card}`,
        }}
      >
        <div style={{ padding: '20px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: descanso ? COLORS.textSecondary : color }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: descanso ? COLORS.textTertiary : color, flexShrink: 0 }} />
            <span>{cuando} · {DISC_LABELS_HOME[sesion.disciplina] || sesion.disciplina}</span>
          </div>
          <h3 style={{ ...displayStyle, margin: '10px 0 0', fontSize: 'clamp(32px, 9vw, 46px)', overflowWrap: 'anywhere' }}>{tituloSesion(sesion)}</h3>
          {(dp || !descanso) && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
              {dp && (
                <span title={dp.estimada ? 'Estimada con los ritmos de cada paso' : undefined}>
                  <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em' }}>{dp.estimada ? '~' : ''}{dp.min}</span>
                  <span style={{ fontSize: 15, color: COLORS.textSecondary, marginLeft: 4 }}>min</span>
                </span>
              )}
              {!descanso && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, marginLeft: 'auto', color: enviada ? COLORS.accent : AVISO_RELOJ }}>
                  <Icon name="watch" size={16} />
                  {enviada ? 'En tu reloj' : 'Aún no está en tu reloj'}
                </span>
              )}
            </div>
          )}
          {sesion.notas && (
            <p style={{ margin: '12px 0 0', fontSize: 15, color: COLORS.textSoft, lineHeight: 1.5 }}>{sesion.notas}</p>
          )}
        </div>

        {bloques.length > 0 && (
          <div style={{ padding: '20px 16px 0' }}>
            <Perfil bloques={bloques} disciplina={sesion.disciplina} alto={110} tinte={color} separacion={3} style={{ marginBottom: 0 }} />
            {plan.length > 0 && (
              <p style={{ margin: '12px 4px 0', fontSize: 14, lineHeight: 1.5, color: COLORS.textSoft }}>{plan.join('  ·  ')}</p>
            )}
          </div>
        )}

        <div style={{ padding: '16px 16px 16px' }}>
          {(esHoy && !descanso) || tieneDetalle ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {esHoy && !descanso && (
                conFeedback ? (
                  <button
                    onClick={() => setFeedbackAbierto((p) => ({ ...p, [sesion.id]: !p[sesion.id] }))}
                    aria-expanded={!!feedbackAbierto[sesion.id]}
                    style={{ ...ghostButtonStyle, flex: '1 1 auto', minHeight: 52, justifyContent: 'flex-start' }}
                  >
                    <Icon name="check" size={16} style={{ color: COLORS.accent }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Tu feedback: {resumenFeedback(feedbacks.get(sesion.id)) || 'enviado'}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setFeedbackAbierto((p) => ({ ...p, [sesion.id]: !p[sesion.id] }))}
                    aria-expanded={!!feedbackAbierto[sesion.id]}
                    style={{ ...buttonStyle, flex: '1 1 auto', minHeight: 52, fontSize: 17 }}
                  >
                    ¿Cómo te fue?
                  </button>
                )
              )}
              {tieneDetalle && (
                <button onClick={() => toggleDetalle(sesion.id)} aria-expanded={abierta} style={{ ...ghostButtonStyle, minHeight: 52, flex: esHoy && !descanso ? '0 0 auto' : '1 1 auto' }}>
                  {abierta ? 'Ocultar entreno' : 'Ver entreno'}
                </button>
              )}
            </div>
          ) : null}

          {feedbackAbierto[sesion.id] && esHoy && !descanso && (
            <div style={{ marginTop: 14 }}>
              <FeedbackEditor sesion={sesion} athleteId={userId} inicial={feedbacks.get(sesion.id)} onCambio={actualizarFeedback} />
            </div>
          )}

          {abierta && tieneDetalle && (
            <div style={{ marginTop: 12 }}>
              <WorkoutDetail sesion={sesion} mostrarNotas={false} copiarStrava />
              {intervalsOk && !enviada && (
                <div style={{ marginTop: 10 }}>
                  {erroresGarmin[sesion.id] && (
                    <p style={{ color: COLORS.error, fontSize: 13, margin: '0 0 6px' }}>{erroresGarmin[sesion.id]}</p>
                  )}
                  <button
                    onClick={() => enviarAGarmin(sesion)}
                    disabled={enviandoGarmin[sesion.id]}
                    style={{ ...buttonStyle, opacity: enviandoGarmin[sesion.id] ? 0.6 : 1 }}
                  >
                    <Icon name="send" size={15} />
                    {enviandoGarmin[sesion.id] ? 'Enviando…' : 'Enviar a mi reloj'}
                  </button>
                </div>
              )}
            </div>
          )}

          {nutricion.disponible && !descanso && (
            <div style={{ marginTop: 6 }}>
              <NutricionSesion
                key={sesion.id}
                sesion={sesion}
                uid={userId}
                quien="atleta"
                inicial={nutricion.mapa.get(sesion.id)}
                onCambio={actualizarNutricion}
              />
            </div>
          )}
        </div>
      </article>
    )
  }

  // Fila de "Próximos": una línea por entreno, como "Hechos y pendientes", y al
  // pulsarla se abre con el entreno, el envío al reloj y la nutrición. Antes era
  // una tarjeta completa por sesión: 10 tarjetas ≈ 1.300 px en el móvil.
  const renderProximaFila = (sesion, i) => {
    const tieneDetalle = tieneEntreno(sesion.workout_steps)
    const abierta = !!expandidas[sesion.id]
    const relativo = diaRelativo(sesion.fecha)
    const enviada = !!sesion.enviado_a_garmin
    // "Aún no está en tu reloj" solo importa si toca hoy o mañana; para la
    // semana que viene es normal (el entrenador lo manda más cerca).
    const descanso = esDescanso(sesion)
    const avisarReloj = !descanso && !enviada && (relativo === 'Hoy' || relativo === 'Mañana')
    const plan = nutricion.disponible ? nutricion.mapa.get(sesion.id) : null
    return (
      <div key={sesion.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${COLORS.cardBorder}` }}>
        <button
          onClick={() => toggleDetalle(sesion.id)}
          aria-expanded={abierta}
          style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 16px 12px 12px', cursor: 'pointer', color: COLORS.textPrimary }}
        >
          <BloqueFecha fecha={sesion.fecha} disciplina={sesion.disciplina} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 17, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tituloSesion(sesion)}</span>
            <span style={{ display: 'block', fontSize: 14, color: COLORS.textSecondary, marginTop: 3 }}>
              {relativo && <span style={{ color: COLORS.textSoft, fontWeight: 600 }}>{relativo}</span>}
              {relativo && (Number.isInteger(sesion.hora_inicio_min) || duracionPrevista(sesion)) ? ' · ' : ''}
              {Number.isInteger(sesion.hora_inicio_min) ? formatHora(sesion.hora_inicio_min) : ''}
              {Number.isInteger(sesion.hora_inicio_min) && duracionPrevista(sesion) ? ' · ' : ''}
              {duracionPrevista(sesion) && <DuracionSesion sesion={sesion} />}
              {!relativo && !Number.isInteger(sesion.hora_inicio_min) && !duracionPrevista(sesion) && (DISC_LABELS_HOME[sesion.disciplina] || sesion.disciplina)}
            </span>
          </span>
          {avisarReloj && (
            <span title="Aún no está en tu reloj" aria-label="Aún no está en tu reloj" style={{ color: AVISO_RELOJ, display: 'inline-flex' }}>
              <Icon name="watch" size={16} />
            </span>
          )}
          <Icon name="chevronDown" size={16} style={{ color: COLORS.textTertiary, flexShrink: 0, transform: abierta ? 'rotate(180deg)' : 'none' }} />
        </button>
        {abierta && (
          <div style={{ padding: '0 16px 16px 76px' }}>
            {sesion.notas && <p style={{ margin: '0 0 8px', fontSize: 15, color: COLORS.textSoft, lineHeight: 1.5 }}>{sesion.notas}</p>}
            {!descanso && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: enviada ? COLORS.textSecondary : AVISO_RELOJ }}>
                <Icon name="watch" size={15} />
                {enviada ? 'En tu reloj' : 'Aún no está en tu reloj'}
              </span>
            )}
            {intervalsOk && !enviada && !descanso && (
              <div style={{ marginTop: 8 }}>
                {erroresGarmin[sesion.id] && <p style={{ color: COLORS.error, fontSize: 13, margin: '0 0 6px' }}>{erroresGarmin[sesion.id]}</p>}
                <button
                  onClick={() => enviarAGarmin(sesion)}
                  disabled={enviandoGarmin[sesion.id]}
                  style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: enviandoGarmin[sesion.id] ? 0.6 : 1 }}
                >
                  <Icon name="send" size={15} />
                  {enviandoGarmin[sesion.id] ? 'Enviando…' : 'Enviar a mi reloj'}
                </button>
              </div>
            )}
            {tieneDetalle && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}` }}>
                <WorkoutDetail sesion={sesion} mostrarNotas={false} copiarStrava />
              </div>
            )}
            {nutricion.disponible && !descanso && (
              <div style={{ marginTop: 10, paddingTop: 4, borderTop: `1px solid ${COLORS.cardBorder}` }}>
                <NutricionSesion key={sesion.id} sesion={sesion} uid={userId} quien="atleta" inicial={plan} onCambio={actualizarNutricion} />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Lo de HOY arriba del todo (o, si hoy no hay nada, la próxima); la agenda de
  // la semana va debajo y el resto de próximos después (decidido 2026-10-29: la
  // agenda ocupaba la primera pantalla y lo de hoy quedaba abajo).
  const hoyStr = hoyMadrid()
  const deHoy = proximas.filter((s) => s.fecha === hoyStr)
  const destacadas = deHoy.length ? deHoy : proximas.slice(0, 1)
  const restoProximas = proximas.filter((s) => !destacadas.includes(s))

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <PageHeader
          brandSub={fechaDeHoy()}
          topActions={
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setActiveTab('sesiones'); setVerAjustes((v) => !v) }}
                style={{ ...iconButtonStyle, ...(verAjustes ? { color: COLORS.background, background: COLORS.textPrimary } : {}) }}
                aria-label="Ajustes: potenciómetro, FTP y FC umbral"
                aria-expanded={verAjustes}
                title="Ajustes"
              >
                <Icon name="settings" size={17} />
              </button>
              <button onClick={cerrarSesion} style={iconButtonStyle} aria-label="Cerrar sesión" title="Cerrar sesión">
                <Icon name="logout" size={17} />
              </button>
            </div>
          }
        />

        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { clave: 'sesiones', etiqueta: 'Entrenos' },
            { clave: 'analisis', etiqueta: 'Análisis' },
            { clave: 'temporada', etiqueta: 'Temporada' },
            // 'Horario' (antes 'Disponibilidad'): con 4 pestañas no cabía en 375 px
            { clave: 'disponibilidad', etiqueta: 'Horario' },
          ]}
        />

        {/* ══ TAB: ENTRENOS ══════════════════════════════════════════════ */}
        {activeTab === 'sesiones' && (
          <>
            {verAjustes && userId && (
              <section style={{ marginBottom: 28 }}>
                <SectionTitle aside={<button onClick={() => setVerAjustes(false)} style={{ background: 'none', border: 'none', color: COLORS.textSecondary, fontSize: 13, cursor: 'pointer', padding: 4, fontFamily: 'inherit' }}>Cerrar</button>}>
                  Ajustes
                </SectionTitle>
                <PotenciaAjustes athleteId={userId} uid={userId} fcMax={perfil?.fc_maxima} />
              </section>
            )}
            <section style={{ marginBottom: 28 }}>
              {/* Hoy: la propia tarjeta lo dice («Hoy a las 18:30»), sin título encima */}
              {deHoy.length ? <h2 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Hoy</h2> : <SectionTitle>Tu próximo entreno</SectionTitle>}

              {cargandoSesiones ? (
                <p style={{ color: COLORS.textSecondary }}>Cargando…</p>
              ) : errorSesiones ? (
                <div style={{ ...cardStyle, padding: 20 }}>
                  <p style={{ color: COLORS.error, margin: 0 }}>
                    No se pudieron cargar tus entrenos. Recarga la página o inténtalo más tarde.
                  </p>
                </div>
              ) : proximas.length === 0 ? (
                <div style={{ ...cardStyle, padding: 20 }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Nada programado todavía</p>
                  <p style={{ color: COLORS.textSecondary, margin: 0, fontSize: 14 }}>
                    Cuando tu entrenador te prepare un entreno, aparecerá aquí.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {destacadas.map(renderProxima)}
                </div>
              )}
            </section>

            <AgendaAtleta userId={userId} onCambio={() => setRecargaSesiones((n) => n + 1)} />

            {!cargandoSesiones && !errorSesiones && (restoProximas.length > 0 || hayMasProximas) && (
            <section style={{ marginBottom: 32 }}>
              <SectionTitle>Próximos</SectionTitle>
              <div style={{ ...cardStyle, padding: '2px 0' }}>
                {restoProximas.map(renderProximaFila)}
              </div>
              {hayMasProximas && (
                <button onClick={cargarMasProximas} disabled={cargandoMas} style={{ ...ghostButtonStyle, width: '100%', marginTop: 10, color: COLORS.textSecondary }}>
                  {cargandoMas ? 'Cargando…' : 'Ver más entrenos'}
                </button>
              )}
            </section>
            )}

            <section>
              <SectionTitle>Hechos y pendientes</SectionTitle>
              {errorSesiones ? null : !cargandoSesiones && pasadas.length === 0 ? (
                <div style={{ ...cardStyle, padding: 20 }}>
                  <p style={{ color: COLORS.textSecondary, margin: 0, fontSize: 14 }}>Aquí verás tus entrenos pasados y si los hiciste.</p>
                </div>
              ) : (
                <div style={{ ...cardStyle, padding: '2px 0' }}>
                  {pasadas.map((sesion, i) => {
                    const tieneDetalle = tieneEntreno(sesion.workout_steps)
                    const abierta = !!expandidas[sesion.id]
                    const estado = estadoDeSesion(sesion, asignacion.get(sesion.id), hoyMadrid(), estadoActs.desde)
                    const fb = feedbacks.get(sesion.id)
                    return (
                      <div key={sesion.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${COLORS.cardBorder}` }}>
                        {/* Siempre desplegable: dentro está el feedback (y el entreno si lo hay) */}
                        <button
                          onClick={() => toggleDetalle(sesion.id)}
                          aria-expanded={abierta}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 16px 12px 12px', cursor: 'pointer', color: COLORS.textPrimary }}
                        >
                          <BloqueFecha fecha={sesion.fecha} disciplina={sesion.disciplina} apagado={estado !== ESTADO.completada} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 17, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tituloSesion(sesion)}</span>
                            <span style={{ display: 'block', fontSize: 14, color: COLORS.textSecondary, marginTop: 3 }}>
                              {DISC_LABELS_HOME[sesion.disciplina] || sesion.disciplina}
                              {fb ? (
                                <span style={{ color: COLORS.textSoft }}> · {resumenFeedback(fb) || 'Feedback enviado'}</span>
                              ) : null}
                            </span>
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <EstadoPasada estado={estado} />
                            {estado === ESTADO.completada && <Cumplimiento sesion={sesion} actividad={asignacion.get(sesion.id)} />}
                          </span>
                        </button>
                        {/* Hecho y sin feedback: esfuerzo en un toque, sin abrir la fila */}
                        {!abierta && !fb && estado === ESTADO.completada && (
                          <div style={{ padding: '0 16px 14px 76px' }}>
                            <FeedbackRapido sesion={sesion} athleteId={userId} onCambio={actualizarFeedback} />
                          </div>
                        )}
                        {abierta && (
                          <div style={{ padding: '0 16px 16px 76px' }}>
                            {!esDescanso(sesion) && <FeedbackEditor sesion={sesion} athleteId={userId} inicial={fb} onCambio={actualizarFeedback} />}
                            {sesion.notas && esDescanso(sesion) && <p style={{ margin: 0, fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.45 }}>{sesion.notas}</p>}
                            {nutricion.disponible && !esDescanso(sesion) && (
                              <div style={{ marginTop: 12, paddingTop: 4, borderTop: `1px solid ${COLORS.cardBorder}` }}>
                                <NutricionSesion
                                  key={sesion.id}
                                  sesion={sesion}
                                  uid={userId}
                                  quien="atleta"
                                  inicial={nutricion.mapa.get(sesion.id)}
                                  onCambio={actualizarNutricion}
                                />
                              </div>
                            )}
                            {tieneDetalle && (
                              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}` }}>
                                <WorkoutDetail sesion={sesion} mostrarNotas={true} copiarStrava />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {hayMasPasadas && !errorSesiones && (
                <button onClick={cargarMasPasadas} disabled={cargandoMas} style={{ ...ghostButtonStyle, width: '100%', marginTop: 10, color: COLORS.textSecondary }}>
                  {cargandoMas ? 'Cargando…' : 'Ver entrenos anteriores'}
                </button>
              )}
            </section>

            {/* Conexiones — al fondo */}
            <section style={{ marginTop: 32 }}>
              <SectionTitle>Ajustes y conexiones</SectionTitle>
              {userId && !verAjustes && <PotenciaAjustes athleteId={userId} uid={userId} fcMax={perfil?.fc_maxima} />}
              <div style={{ ...cardStyle, padding: '4px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Strava</div>
                    <div style={{ fontSize: 13, color: stravaOk ? COLORS.accent : COLORS.textSecondary, marginTop: 2 }}>
                      {stravaOk ? 'Conectado: tus actividades llegan solas' : 'Sin conectar'}
                    </div>
                  </div>
                  {stravaOk ? (
                    <Link to="/setup/intervals" style={{ ...ghostButtonStyle, padding: '7px 12px', fontSize: 13, textDecoration: 'none' }}>
                      Ajustes
                    </Link>
                  ) : (
                    <button onClick={conectarStrava} disabled={!userId} style={{ ...buttonStyle, background: '#FC4C02', color: '#FFFFFF', padding: '8px 14px', fontSize: 13 }}>
                      Conectar
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: `1px solid ${COLORS.cardBorder}` }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>Intervals.icu</div>
                    <div style={{ fontSize: 13, color: intervalsOk ? COLORS.accent : COLORS.textSecondary, marginTop: 2 }}>
                      {intervalsOk ? 'Conectado: los entrenos van a tu reloj' : 'Conéctalo para recibir los entrenos en el reloj'}
                    </div>
                  </div>
                  <Link
                    to="/setup/intervals"
                    style={{ ...(intervalsOk ? ghostButtonStyle : buttonStyle), padding: '7px 12px', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    {intervalsOk ? 'Ajustes' : 'Configurar'}
                  </Link>
                </div>
              </div>
              {errorStrava && <p style={{ color: COLORS.error, fontSize: 13, marginTop: 8 }}>{errorStrava}</p>}
            </section>
          </>
        )}

        {/* ══ TAB: ANÁLISIS STRAVA ═════════════════════════════════════ */}
        {activeTab === 'analisis' && sinStrava && !cargandoStrava && <SinStrava onConectar={conectarStrava} />}
        {/* Si falla «Conectar Strava» el error se ve aquí también (la otra rama no se pinta) */}
        {activeTab === 'analisis' && sinStrava && errorStrava && <p style={{ color: COLORS.error, fontSize: 13, marginTop: 10 }}>{errorStrava}</p>}
        {activeTab === 'analisis' && !sinStrava && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
              <SelectorPeriodo
                periodo={periodo}
                onChange={(p) => {
                  // Solo los presets nuevos recargan los datos de base; una semana o un rango se piden aparte
                  if (esPreset(p) && p.semanas !== weeks) setDatos(null)
                  setPeriodo(p)
                }}
              />
              <button onClick={() => setComparadorAbierto(true)} style={ghostButtonStyle}>
                Comparar semanas
              </button>
            </div>
            {cargandoAnalisis && (
              <AnalisisCargando />
            )}
            {errorAnalisis && <p style={{ color: COLORS.error }}>{errorAnalisis}</p>}

            {!cargandoAnalisis && !errorAnalisis && (
              <StravaAnalysis
                actividades={datosAnalisis?.actividades || []}
                semanas={datosAnalisis?.semanas || []}
                records={datosAnalisis?.records}
                periodo={periodo}
                athleteId={userId}
                atleta={datos?.atleta}
                onFcMaxGuardada={() => { stravaClaveRef.current = null; setRefrescoStrava((r) => r + 1) }}
                buildCsvName={() => `mis_actividades_${claveArchivo(periodo)}_${hoyMadrid()}.csv`}
              />
            )}
          </>
        )}

        {/* ══ TAB: TEMPORADA ═══════════════════════════════════════════ */}
        {activeTab === 'temporada' && userId && (
          <SeasonPanel athleteId={userId} atletaNombre={perfil?.nombre} />
        )}

        {/* ══ TAB: DISPONIBILIDAD ══════════════════════════════════════ */}
        {activeTab === 'disponibilidad' && userId && <DisponibilidadEditor athleteId={userId} />}

        {/* ── Modales ─────────────────────────────────────────────────── */}
        {comparadorAbierto && (
          <WeekCompare
            key={`${weeks}-${semanas.length}`}
            semanas={semanas}
            onClose={() => setComparadorAbierto(false)}
          />
        )}
      </div>
    </div>
  )
}
