import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { useIsMobile } from '../hooks/useIsMobile'
import { hoyMadrid, MESES_CORTOS } from '../lib/chartUtils'
import {
  COLORS,
  DISCIPLINE_COLORS,
  cardStyle,
  pageStyle,
} from '../lib/theme'
import WorkoutDetail from '../components/WorkoutDetail'
import WeekCompare from '../components/WeekCompare'
import StravaAnalysis from '../components/shared/StravaAnalysis'

const RANGOS_SEMANAS = [4, 8, 12, 24]

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
  const isMobile = useIsMobile()

  // Auth / IDs
  const [userId, setUserId] = useState(null)

  // Perfil
  const [perfil, setPerfil] = useState(null)

  // Strava data
  const [weeks, setWeeks] = useState(8)
  const [datos, setDatos] = useState(null)
  const [cargandoStrava, setCargandoStrava] = useState(false)
  const [errorStrava, setErrorStrava] = useState('')
  const [comparadorAbierto, setComparadorAbierto] = useState(false)

  // Sesiones prescritas
  const [proximas, setProximas] = useState([])
  const [pasadas, setPasadas] = useState([])
  const [cargandoSesiones, setCargandoSesiones] = useState(true)
  const [errorSesiones, setErrorSesiones] = useState(false)
  const [expandidas, setExpandidas] = useState({})
  const [enviandoGarmin, setEnviandoGarmin] = useState({})
  const [erroresGarmin, setErroresGarmin] = useState({})

  // Tabs
  const [activeTab, setActiveTab] = useState('sesiones')

  // ── Paso 1: cargar userId + perfil ────────────────────────────────────
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

      const perfilRes = await supabase
        .from('profiles')
        .select('nombre, intervals_api_key, intervals_athlete_id, strava_token')
        .eq('id', uid)
        .maybeSingle()

      if (!activo) return
      setPerfil(perfilRes.data)
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
      // Distinguir un error de carga de un "no hay entrenamientos" legítimo (F4b)
      if (proximasRes.error || pasadasRes.error) {
        setErrorSesiones(true)
        setProximas([])
        setPasadas([])
      } else {
        setErrorSesiones(false)
        setProximas(proximasRes.data || [])
        setPasadas(pasadasRes.data || [])
      }
      setCargandoSesiones(false)
    }

    cargarSesiones()
    return () => { activo = false }
  }, [userId])

  // ── Paso 3: cargar datos Strava ───────────────────────────────────────
  useEffect(() => {
    if (!userId || activeTab !== 'analisis') return
    if (datos && datos._weeks === weeks && datos._userId === userId) return
    let activo = true

    async function cargarStrava() {
      setCargandoStrava(true)
      setErrorStrava('')
      try {
        // El atleta pide SUS datos: el backend lo autoriza porque el uid del
        // JWT coincide con athleteId
        const res = await fetch('/.netlify/functions/coach-athlete-data', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ athleteId: userId, weeks }),
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
  }, [userId, weeks, activeTab])

  function toggleDetalle(id) {
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }))
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

  const actividades = datos?.actividades || []
  const semanas = datos?.semanas || []
  const intervalsOk = !!(perfil?.intervals_api_key && perfil?.intervals_athlete_id)
  const stravaOk = !!perfil?.strava_token

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: COLORS.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: COLORS.textSecondary, letterSpacing: '0.03em' }}>GetRiCoach</span>
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: isMobile ? 24 : 34,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: COLORS.textPrimary,
              }}
            >
              {perfil?.nombre || 'Mi panel'}
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
                  fontFamily: "'Archivo', sans-serif",
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
                fontFamily: "'Archivo', sans-serif",
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
              ) : errorSesiones ? (
                <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
                  <p style={{ color: COLORS.error, margin: 0 }}>
                    No se pudieron cargar tus entrenamientos. Recarga la página o inténtalo más tarde.
                  </p>
                </div>
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
                                  color: sesion.enviado_a_garmin ? '#2FBFAF' : COLORS.textSecondary,
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
                                fontFamily: "'Archivo', sans-serif",
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
                                    fontFamily: "'Archivo', sans-serif",
                                    opacity: enviandoGarmin[sesion.id] ? 0.6 : 1,
                                  }}
                                >
                                  {enviandoGarmin[sesion.id] ? 'Enviando…' : '✈ Enviar a Garmin'}
                                </button>
                              </div>
                            )}

                            {sesion.enviado_a_garmin && (
                              <p style={{ color: '#2FBFAF', fontSize: 13, fontWeight: 600, marginTop: 8 }}>
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

              {errorSesiones ? null : !cargandoSesiones && pasadas.length === 0 ? (
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
                              color: sesion.enviado_a_garmin ? '#2FBFAF' : COLORS.textSecondary,
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
                                  fontFamily: "'Archivo', sans-serif",
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

            {/* Configuración Strava + Intervals — siempre al fondo */}
            <section style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${COLORS.cardBorder}` }}>
              <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 0 }}>
                {/* Strava */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  {stravaOk ? (
                    <>
                      <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>
                        ✅ Strava conectado
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
                          fontFamily: "'Archivo', sans-serif",
                        }}
                      >
                        Reconfigurar →
                      </Link>
                    </>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>
                        ❌ Strava no conectado
                      </p>
                      <button
                        onClick={conectarStrava}
                        disabled={!userId}
                        style={{
                          background: '#FC4C02',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: "'Archivo', sans-serif",
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Conectar →
                      </button>
                    </>
                  )}
                </div>

                {/* Divisor */}
                <div style={{ borderTop: `1px solid ${COLORS.cardBorder}`, margin: '12px 0' }} />

                {/* Intervals */}
                <div
                  style={{
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
                          fontFamily: "'Archivo', sans-serif",
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
                          fontFamily: "'Archivo', sans-serif",
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Configurar (opcional) →
                      </Link>
                    </>
                  )}
                </div>
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
              <StravaAnalysis
                actividades={actividades}
                semanas={semanas}
                records={datos?.records}
                weeks={weeks}
                athleteId={userId}
                buildCsvName={() => `mis_actividades_${weeks}sem_${hoyMadrid()}.csv`}
                accionesFiltro={
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
                      fontFamily: "'Archivo', sans-serif",
                    }}
                  >
                    Comparar semanas
                  </button>
                }
              />
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
      </div>
    </div>
  )
}
