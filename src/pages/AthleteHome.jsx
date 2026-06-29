import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { decimalToRitmo, formatDiaMes, hoyMadrid, MESES_CORTOS } from '../lib/chartUtils'
import {
  COLORS,
  DISCIPLINE_COLORS,
  DISCIPLINE_LABELS,
  cardStyle,
  pageStyle,
} from '../lib/theme'
import ActivityDetail from '../components/ActivityDetail'
import WorkoutDetail from '../components/WorkoutDetail'
import WeekCompare from '../components/WeekCompare'
import PRsBlock from '../components/PRsBlock'
import ChartCard from '../components/charts/ChartCard'
import VolumeChart from '../components/charts/VolumeChart'
import ZonesChart from '../components/charts/ZonesChart'
import PaceChart from '../components/charts/PaceChart'
import PowerChart from '../components/charts/PowerChart'
import TSSChart from '../components/charts/TSSChart'

const RANGOS_SEMANAS = [4, 8, 12, 24]

const FILTROS_DISCIPLINA = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'run', etiqueta: 'Carrera' },
  { clave: 'bike', etiqueta: 'Ciclismo' },
  { clave: 'swim', etiqueta: 'Natación' },
  { clave: 'strength', etiqueta: 'Fuerza' },
  { clave: 'other', etiqueta: 'Otro' },
]

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

function formatFechaLarga(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_CORTOS[date.getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}`
}

function campoCsv(valor) {
  if (valor == null) return ''
  const s = String(valor)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_CABECERAS = [
  'Fecha', 'Disciplina', 'Nombre', 'Distancia (km)', 'Duración (min)',
  'Ritmo', 'FC media', 'FC máx', 'Zona', 'Potencia (W)', 'Cadencia', 'Desnivel (m)', 'TSS',
]

function formatRitmoActividad(act) {
  if (act.disciplina === 'run') {
    return act.ritmo_min_km != null ? `${decimalToRitmo(act.ritmo_min_km)} /km` : '—'
  }
  if (act.disciplina === 'bike') {
    if (!act.distancia_km || !act.duracion_min) return '—'
    return `${(act.distancia_km / (act.duracion_min / 60)).toFixed(1)} km/h`
  }
  if (act.disciplina === 'swim') {
    if (!act.distancia_km || !act.duracion_min) return '—'
    return `${decimalToRitmo(act.duracion_min / act.distancia_km / 10)} /100m`
  }
  return '—'
}

function formatDuracion(duracionMin) {
  if (duracionMin == null) return '—'
  const h = Math.floor(duracionMin / 60)
  const m = Math.round(duracionMin % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function tituloSesion(sesion) {
  const nombre = sesion.workout_steps?.nombre
  if (nombre && nombre.trim()) return nombre.trim()
  const desc = sesion.descripcion || ''
  return desc.length > 40 ? desc.slice(0, 40) + '…' : desc || '—'
}

function resumeRepeat(bloques) {
  if (!Array.isArray(bloques)) return null
  const repeat = bloques.find((b) => b.tipo === 'repeat')
  if (!repeat) return null
  const paso = repeat.pasos?.[0]
  if (!paso) return `${repeat.repeticiones}x`
  const cant = paso.cantidad && paso.unidad ? `${paso.cantidad}${paso.unidad}` : ''
  const obj = paso.objetivo_valor ? ` · ${paso.objetivo_valor}` : ''
  return `${repeat.repeticiones}x${cant}${obj}`
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px 12px',
  fontSize: 13,
  color: COLORS.textPrimary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

const DISC_LABELS_HOME = {
  run: 'Running',
  bike: 'Ciclismo',
  swim: 'Natación',
  strength: 'Fuerza',
  other: 'Otro',
}

const badgeDisciplina = (disciplina) => ({
  background: DISCIPLINE_COLORS[disciplina] || COLORS.textSecondary,
  color: '#FFFFFF',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
})

export default function AthleteHome() {
  const navigate = useNavigate()

  // Auth / IDs
  const [userId, setUserId] = useState(null)
  const [coachId, setCoachId] = useState(null)

  // Perfil
  const [perfil, setPerfil] = useState(null)

  // Strava data
  const [weeks, setWeeks] = useState(8)
  const [datos, setDatos] = useState(null)
  const [cargandoStrava, setCargandoStrava] = useState(false)
  const [errorStrava, setErrorStrava] = useState('')
  const [filtroDisciplina, setFiltroDisciplina] = useState('todos')
  const [selectedActivityId, setSelectedActivityId] = useState(null)
  const [comparadorAbierto, setComparadorAbierto] = useState(false)

  // Sesiones prescritas
  const [proximas, setProximas] = useState([])
  const [pasadas, setPasadas] = useState([])
  const [cargandoSesiones, setCargandoSesiones] = useState(true)
  const [expandidas, setExpandidas] = useState({})
  const [enviandoGarmin, setEnviandoGarmin] = useState({})
  const [erroresGarmin, setErroresGarmin] = useState({})

  // Tabs
  const [activeTab, setActiveTab] = useState('sesiones')

  // ── Paso 1: cargar userId + perfil + coach_id ─────────────────────────
  useEffect(() => {
    let activo = true

    async function cargarPerfil() {
      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData?.session?.user?.id
      if (!uid) {
        navigate('/')
        return
      }
      if (!activo) return
      setUserId(uid)

      const [perfilRes, coachAtletaRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('nombre, intervals_api_key, intervals_athlete_id')
          .eq('id', uid)
          .maybeSingle(),
        supabase
          .from('coach_athletes')
          .select('coach_id')
          .eq('athlete_id', uid)
          .maybeSingle(),
      ])

      if (!activo) return
      setPerfil(perfilRes.data)
      // Si no tiene coach asignado usamos el propio uid como coachId
      setCoachId(coachAtletaRes.data?.coach_id ?? uid)
    }

    cargarPerfil()
    return () => { activo = false }
  }, [navigate])

  // ── Paso 2: cargar sesiones prescritas ───────────────────────────────
  useEffect(() => {
    if (!userId) return
    let activo = true

    async function cargarSesiones() {
      setCargandoSesiones(true)
      const hoy = hoyMadrid()

      const [proximasRes, pasadasRes] = await Promise.all([
        supabase
          .from('coach_sessions')
          .select('*')
          .eq('athlete_id', userId)
          .gte('fecha', hoy)
          .order('fecha', { ascending: true })
          .limit(10),
        supabase
          .from('coach_sessions')
          .select('*')
          .eq('athlete_id', userId)
          .lt('fecha', hoy)
          .order('fecha', { ascending: false })
          .limit(20),
      ])

      if (!activo) return
      setProximas(proximasRes.data || [])
      setPasadas(pasadasRes.data || [])
      setCargandoSesiones(false)
    }

    cargarSesiones()
    return () => { activo = false }
  }, [userId])

  // ── Paso 3: cargar datos Strava ───────────────────────────────────────
  useEffect(() => {
    if (!userId || !coachId || activeTab !== 'analisis') return
    if (datos && datos._weeks === weeks && datos._userId === userId) return
    let activo = true

    async function cargarStrava() {
      setCargandoStrava(true)
      setErrorStrava('')
      try {
        const res = await fetch('/.netlify/functions/coach-athlete-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-coach-secret': import.meta.env.VITE_COACH_SECRET || '',
          },
          body: JSON.stringify({ athleteId: userId, coachId, weeks }),
        })
        const json = await res.json()
        if (!activo) return
        if (!res.ok) {
          setErrorStrava(json?.error || 'No se pudieron cargar los datos de Strava')
          return
        }
        setDatos({ ...json, _weeks: weeks, _userId: userId })
      } catch {
        if (activo) setErrorStrava('Error de conexión cargando datos de Strava')
      } finally {
        if (activo) setCargandoStrava(false)
      }
    }

    cargarStrava()
    return () => { activo = false }
  }, [userId, coachId, weeks, activeTab])

  function toggleDetalle(id) {
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function marcarEnviado(id) {
    setProximas((prev) => prev.map((s) => s.id === id ? { ...s, enviado_a_garmin: true } : s))
    setPasadas((prev) => prev.map((s) => s.id === id ? { ...s, enviado_a_garmin: true } : s))
  }

  async function enviarAGarmin(sesion) {
    setEnviandoGarmin((prev) => ({ ...prev, [sesion.id]: true }))
    setErroresGarmin((prev) => ({ ...prev, [sesion.id]: null }))
    try {
      const res = await fetch('/.netlify/functions/send-to-intervals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-coach-secret': import.meta.env.VITE_COACH_SECRET || '',
        },
        body: JSON.stringify({ sessionId: sesion.id, coachId: sesion.coach_id, athleteId: userId }),
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

  const actividades = datos?.actividades || []
  const semanas = datos?.semanas || []
  const actividadesFiltradas =
    filtroDisciplina === 'todos'
      ? actividades
      : actividades.filter((a) => a.disciplina === filtroDisciplina)

  function exportarCSV() {
    const filas = actividadesFiltradas.map((act) =>
      [
        act.fecha,
        DISCIPLINE_LABELS[act.disciplina] || act.disciplina,
        act.nombre_actividad,
        act.distancia_km,
        act.duracion_min,
        act.ritmo_min_km != null ? decimalToRitmo(act.ritmo_min_km) : null,
        act.fc_media,
        act.fc_maxima_actividad,
        act.zona_fc,
        act.potencia_media,
        act.cadencia_media,
        act.desnivel_m,
        act.tss_estimado,
      ]
        .map(campoCsv)
        .join(',')
    )
    const csv = [CSV_CABECERAS.map(campoCsv).join(','), ...filas].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `mis_actividades_${weeks}sem_${hoyMadrid()}.csv`
    document.body.appendChild(enlace)
    enlace.click()
    document.body.removeChild(enlace)
    URL.revokeObjectURL(url)
  }

  const hayRuns = actividades.some((a) => a.disciplina === 'run')
  const hayZonas = actividades.some((a) => a.zona_fc && a.duracion_min)
  const hayPotencia =
    actividades.filter((a) => a.disciplina === 'bike' && a.potencia_media != null).length >= 3

  const resumen = actividades.reduce(
    (acc, act) => ({
      kmRun: acc.kmRun + (act.disciplina === 'run' ? act.distancia_km || 0 : 0),
      kmBike: acc.kmBike + (act.disciplina === 'bike' ? act.distancia_km || 0 : 0),
      kmSwim: acc.kmSwim + (act.disciplina === 'swim' ? act.distancia_km || 0 : 0),
      sesiones: acc.sesiones + 1,
    }),
    { kmRun: 0, kmBike: 0, kmSwim: 0, sesiones: 0 }
  )

  const metricas = [
    { etiqueta: 'Km carrera', valor: resumen.kmRun.toFixed(1), color: DISCIPLINE_COLORS.run },
    { etiqueta: 'Km bici', valor: resumen.kmBike.toFixed(1), color: DISCIPLINE_COLORS.bike },
    { etiqueta: 'Km natación', valor: resumen.kmSwim.toFixed(2), color: DISCIPLINE_COLORS.swim },
    { etiqueta: 'Sesiones', valor: resumen.sesiones, color: COLORS.accent },
  ]

  const intervalsOk = !!(perfil?.intervals_api_key && perfil?.intervals_athlete_id)

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
              {perfil?.nombre ? (
                <>Hola, <span style={{ color: COLORS.accent }}>{perfil.nombre}</span></>
              ) : (
                'Mi panel'
              )}
            </h1>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {activeTab === 'analisis' && RANGOS_SEMANAS.map((rango) => (
              <button
                key={rango}
                onClick={() => { setDatos(null); setWeeks(rango) }}
                style={{
                  background: weeks === rango ? COLORS.accent : 'transparent',
                  color: weeks === rango ? COLORS.background : COLORS.textSecondary,
                  border: `1px solid ${weeks === rango ? COLORS.accent : COLORS.cardBorder}`,
                  borderRadius: 8,
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {rango} sem
              </button>
            ))}
          </div>
        </header>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <nav
          style={{
            display: 'flex',
            gap: 4,
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            marginBottom: 24,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {[
            { clave: 'sesiones', etiqueta: 'Mis entrenamientos' },
            { clave: 'analisis', etiqueta: 'Análisis Strava' },
          ].map((tab) => (
            <button
              key={tab.clave}
              onClick={() => setActiveTab(tab.clave)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom:
                  activeTab === tab.clave
                    ? `2px solid ${COLORS.accent}`
                    : '2px solid transparent',
                color: activeTab === tab.clave ? COLORS.textPrimary : COLORS.textSecondary,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {tab.etiqueta}
            </button>
          ))}
        </nav>

        {/* ══ TAB: MIS ENTRENAMIENTOS ══════════════════════════════════ */}
        {activeTab === 'sesiones' && (
          <>
            {/* Próximos */}
            <section style={{ marginBottom: 32 }}>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  margin: '0 0 14px',
                }}
              >
                Próximos entrenamientos
              </h2>

              {cargandoSesiones ? (
                <p style={{ color: COLORS.textSecondary }}>Cargando…</p>
              ) : proximas.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
                  <p style={{ color: COLORS.textSecondary, margin: 0 }}>
                    No hay entrenamientos programados
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {proximas.map((sesion) => {
                    const tieneDetalle = sesion.workout_steps?.bloques?.length > 0

                    return (
                      <div
                        key={sesion.id}
                        onClick={() => tieneDetalle && toggleDetalle(sesion.id)}
                        style={{
                          ...cardStyle,
                          cursor: tieneDetalle ? 'pointer' : 'default',
                        }}
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
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                                marginBottom: 6,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: COLORS.textSecondary,
                                }}
                              >
                                {formatFechaLarga(sesion.fecha)}
                              </span>
                              <span style={badgeDisciplina(sesion.disciplina)}>
                                {DISC_LABELS_HOME[sesion.disciplina] || sesion.disciplina}
                              </span>
                              <span
                                style={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: sesion.enviado_a_garmin ? '#00E5A0' : COLORS.textSecondary,
                                }}
                              >
                                {sesion.enviado_a_garmin ? '✅ En tu Garmin' : '⏳ Pendiente Garmin'}
                              </span>
                            </div>

                            <p
                              style={{
                                margin: 0,
                                fontSize: 15,
                                fontWeight: 600,
                                color: COLORS.textPrimary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {tituloSesion(sesion)}
                            </p>

                            {sesion.notas && !expandidas[sesion.id] && (
                              <p
                                style={{
                                  margin: '4px 0 0',
                                  fontSize: 12,
                                  color: COLORS.textSecondary,
                                  fontStyle: 'italic',
                                }}
                              >
                                {sesion.notas}
                              </p>
                            )}
                          </div>

                          {tieneDetalle && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleDetalle(sesion.id) }}
                              style={{
                                background: 'transparent',
                                border: `1px solid ${COLORS.cardBorder}`,
                                borderRadius: 6,
                                color: COLORS.textSecondary,
                                padding: '5px 12px',
                                fontSize: 12,
                                cursor: 'pointer',
                                fontFamily: "'Inter', sans-serif",
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {expandidas[sesion.id] ? 'Cerrar' : 'Ver detalle'}
                            </button>
                          )}
                        </div>

                        {expandidas[sesion.id] && tieneDetalle && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <WorkoutDetail sesion={sesion} mostrarNotas={true} />

                            {perfil?.intervals_api_key && !sesion.enviado_a_garmin && (
                              <div style={{ marginTop: 8 }}>
                                {erroresGarmin[sesion.id] && (
                                  <p style={{ color: COLORS.error, fontSize: 13, margin: '0 0 6px' }}>
                                    {erroresGarmin[sesion.id]}
                                  </p>
                                )}
                                <button
                                  onClick={() => enviarAGarmin(sesion)}
                                  disabled={enviandoGarmin[sesion.id]}
                                  style={{
                                    background: COLORS.accent,
                                    color: COLORS.background,
                                    border: 'none',
                                    borderRadius: 8,
                                    padding: '8px 16px',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: enviandoGarmin[sesion.id] ? 'wait' : 'pointer',
                                    fontFamily: "'Inter', sans-serif",
                                    opacity: enviandoGarmin[sesion.id] ? 0.6 : 1,
                                  }}
                                >
                                  {enviandoGarmin[sesion.id] ? 'Enviando…' : '✈ Enviar a Garmin'}
                                </button>
                              </div>
                            )}

                            {sesion.enviado_a_garmin && (
                              <p style={{ color: '#00E5A0', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                                ✅ Enviado a Garmin
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* Historial */}
            <section>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  margin: '0 0 14px',
                }}
              >
                Entrenamientos pasados
              </h2>

              {!cargandoSesiones && pasadas.length === 0 ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
                  <p style={{ color: COLORS.textSecondary, margin: 0 }}>
                    Sin historial de entrenamientos
                  </p>
                </div>
              ) : (
                <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Fecha</th>
                        <th style={thStyle}>Disciplina</th>
                        <th style={thStyle}>Nombre</th>
                        <th style={thStyle}>Garmin</th>
                        <th style={thStyle}>Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pasadas.map((sesion) => (
                        <tr key={sesion.id}>
                          <td style={tdStyle}>{formatFechaLarga(sesion.fecha)}</td>
                          <td style={tdStyle}>
                            <span style={badgeDisciplina(sesion.disciplina)}>
                              {DISC_LABELS_HOME[sesion.disciplina] || sesion.disciplina}
                            </span>
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              maxWidth: 260,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {tituloSesion(sesion)}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              color: sesion.enviado_a_garmin ? '#00E5A0' : COLORS.textSecondary,
                              fontWeight: 600,
                              fontSize: 12,
                            }}
                          >
                            {sesion.enviado_a_garmin ? '✅' : '⏳'}
                          </td>
                          <td style={tdStyle}>
                            {sesion.workout_steps?.bloques?.length > 0 ? (
                              <button
                                onClick={() =>
                                  setExpandidas((prev) => ({
                                    ...prev,
                                    [sesion.id]: !prev[sesion.id],
                                  }))
                                }
                                style={{
                                  background: 'transparent',
                                  border: `1px solid ${COLORS.cardBorder}`,
                                  borderRadius: 6,
                                  color: COLORS.textSecondary,
                                  padding: '3px 10px',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  fontFamily: "'Inter', sans-serif",
                                }}
                              >
                                {expandidas[sesion.id] ? '▲' : '▼'}
                              </button>
                            ) : (
                              <span style={{ color: COLORS.textSecondary, fontSize: 12 }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {pasadas.map((sesion) =>
                        expandidas[sesion.id] && sesion.workout_steps?.bloques?.length > 0 ? (
                          <tr key={`detalle-${sesion.id}`}>
                            <td
                              colSpan={5}
                              style={{ padding: '0 12px 12px', borderBottom: `1px solid ${COLORS.cardBorder}` }}
                            >
                              <WorkoutDetail sesion={sesion} mostrarNotas={true} />
                            </td>
                          </tr>
                        ) : null
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Configuración Intervals — siempre al fondo, siempre opcional */}
            <section style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${COLORS.cardBorder}` }}>
              <div
                style={{
                  ...cardStyle,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                {intervalsOk ? (
                  <>
                    <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>
                      ✅ Intervals.icu conectado ·{' '}
                      <span style={{ color: COLORS.accent }}>{perfil.intervals_athlete_id}</span>
                    </p>
                    <Link
                      to="/setup/intervals"
                      style={{
                        color: COLORS.textSecondary,
                        fontSize: 12,
                        textDecoration: 'none',
                        border: `1px solid ${COLORS.cardBorder}`,
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      Reconfigurar →
                    </Link>
                  </>
                ) : (
                  <>
                    <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>
                      ⚡ Conecta Intervals.icu para recibir entrenamientos en tu Garmin
                    </p>
                    <Link
                      to="/setup/intervals"
                      style={{
                        color: COLORS.accent,
                        fontSize: 12,
                        textDecoration: 'none',
                        border: `1px solid ${COLORS.accent}`,
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontFamily: "'Inter', sans-serif",
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Configurar (opcional) →
                    </Link>
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {/* ══ TAB: ANÁLISIS STRAVA ═════════════════════════════════════ */}
        {activeTab === 'analisis' && (
          <>
            {cargandoStrava && (
              <p style={{ color: COLORS.textSecondary }}>Cargando datos de Strava…</p>
            )}
            {errorStrava && <p style={{ color: COLORS.error }}>{errorStrava}</p>}

            {!cargandoStrava && !errorStrava && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: 16,
                    marginBottom: 24,
                  }}
                >
                  {metricas.map((m) => (
                    <div key={m.etiqueta} style={cardStyle}>
                      <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: m.color }}>
                        {m.valor}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
                        {m.etiqueta} · últimas {weeks} semanas
                      </p>
                    </div>
                  ))}
                </div>

                <PRsBlock records={datos?.records} weeks={weeks} />

                {semanas.length > 0 && (
                  <ChartCard title="Volumen semanal">
                    <VolumeChart semanas={semanas} actividades={actividades} />
                  </ChartCard>
                )}

                {hayZonas && (
                  <ChartCard title="Distribución zonas FC">
                    <ZonesChart actividades={actividades} />
                  </ChartCard>
                )}

                {hayRuns && (
                  <ChartCard title="Progresión ritmo running">
                    <PaceChart actividades={actividades} />
                  </ChartCard>
                )}

                {hayPotencia && (
                  <ChartCard title="Progresión potencia ciclismo">
                    <PowerChart actividades={actividades} />
                  </ChartCard>
                )}

                {semanas.length > 0 && (
                  <ChartCard title="Carga semanal (TSS)">
                    <TSSChart actividades={actividades} semanas={semanas} />
                  </ChartCard>
                )}

                {/* Filtros + tabla actividades */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                  {FILTROS_DISCIPLINA.map((filtro) => {
                    const activo = filtroDisciplina === filtro.clave
                    return (
                      <button
                        key={filtro.clave}
                        onClick={() => setFiltroDisciplina(filtro.clave)}
                        style={{
                          background: activo ? 'rgba(0,212,255,0.1)' : 'transparent',
                          color: activo ? COLORS.textPrimary : COLORS.textSecondary,
                          border: `1px solid ${activo ? COLORS.accent : COLORS.cardBorder}`,
                          borderRadius: 8,
                          padding: '6px 14px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: "'Inter', sans-serif",
                        }}
                      >
                        {filtro.etiqueta}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setComparadorAbierto(true)}
                    style={{
                      background: 'transparent',
                      color: COLORS.textSecondary,
                      border: `1px solid ${COLORS.cardBorder}`,
                      borderRadius: 8,
                      padding: '6px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    Comparar semanas
                  </button>
                  <button
                    onClick={exportarCSV}
                    disabled={actividadesFiltradas.length === 0}
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      color: COLORS.accent,
                      border: `1px solid ${COLORS.cardBorder}`,
                      borderRadius: 8,
                      padding: '6px 14px',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: actividadesFiltradas.length === 0 ? 'default' : 'pointer',
                      opacity: actividadesFiltradas.length === 0 ? 0.4 : 1,
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    Exportar CSV
                  </button>
                </div>

                <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Fecha</th>
                        <th style={thStyle}>Tipo</th>
                        <th style={thStyle}>Nombre</th>
                        <th style={thStyle}>Distancia</th>
                        <th style={thStyle}>Duración</th>
                        <th style={thStyle}>Ritmo</th>
                        <th style={thStyle}>FC media</th>
                        <th style={thStyle}>Zona</th>
                        <th style={thStyle}>Potencia</th>
                        <th style={thStyle}>Desnivel</th>
                        <th style={thStyle}>TSS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actividadesFiltradas.length === 0 && (
                        <tr>
                          <td
                            colSpan={11}
                            style={{
                              ...tdStyle,
                              color: COLORS.textSecondary,
                              textAlign: 'center',
                            }}
                          >
                            {filtroDisciplina === 'todos'
                              ? 'Sin actividades en este rango'
                              : 'Sin actividades de esta disciplina en este rango'}
                          </td>
                        </tr>
                      )}
                      {actividadesFiltradas.map((act, i) => (
                        <tr
                          key={act.id || `${act.fecha}-${i}`}
                          onClick={() => act.id && setSelectedActivityId(act.id)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                          style={{ cursor: act.id ? 'pointer' : 'default' }}
                        >
                          <td style={tdStyle}>{act.fecha ? formatDiaMes(act.fecha) : '—'}</td>
                          <td style={tdStyle}>
                            <span
                              style={{
                                color: DISCIPLINE_COLORS[act.disciplina] || COLORS.textSecondary,
                                fontWeight: 600,
                                fontSize: 12,
                              }}
                            >
                              {DISCIPLINE_LABELS[act.disciplina] || act.tipo || '—'}
                            </span>
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {act.nombre_actividad || '—'}
                          </td>
                          <td style={tdStyle}>
                            {act.distancia_km != null ? `${act.distancia_km} km` : '—'}
                          </td>
                          <td style={tdStyle}>{formatDuracion(act.duracion_min)}</td>
                          <td style={tdStyle}>{formatRitmoActividad(act)}</td>
                          <td style={tdStyle}>
                            {act.fc_media != null ? `${act.fc_media} ppm` : '—'}
                          </td>
                          <td style={tdStyle}>{act.zona_fc || '—'}</td>
                          <td style={tdStyle}>
                            {act.potencia_media != null ? `${act.potencia_media} W` : '—'}
                          </td>
                          <td style={tdStyle}>
                            {act.desnivel_m != null ? `${act.desnivel_m} m` : '—'}
                          </td>
                          <td style={tdStyle}>
                            {act.tss_estimado != null ? act.tss_estimado : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Modales ─────────────────────────────────────────────────── */}
        {comparadorAbierto && (
          <WeekCompare
            key={`${weeks}-${semanas.length}`}
            semanas={semanas}
            onClose={() => setComparadorAbierto(false)}
          />
        )}

        {selectedActivityId && userId && coachId && (
          <ActivityDetail
            activityId={selectedActivityId}
            athleteId={userId}
            coachId={coachId}
            onClose={() => setSelectedActivityId(null)}
          />
        )}
      </div>
    </div>
  )
}
