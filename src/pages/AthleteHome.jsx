import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { misConexiones } from '../lib/connections'
import { ESTADO, asignarActividades, estadoDeSesion, fechaHaceSemanas, semanasNecesarias } from '../lib/estadoSesion'
import { hoyMadrid, MESES_CORTOS } from '../lib/chartUtils'
import { COLORS, DISCIPLINE_COLORS, FONTS, buttonStyle, cardStyle, ghostButtonStyle, iconButtonStyle, pageStyle, railStyle } from '../lib/theme'
import Icon from '../components/ui/Icon'
import { PageHeader, Segmented, SectionTitle, Tabs } from '../components/ui/Layout'
import WorkoutDetail from '../components/WorkoutDetail'
import WeekCompare from '../components/WeekCompare'
import StravaAnalysis from '../components/shared/StravaAnalysis'
import SeasonPanel from '../components/season/SeasonPanel'

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

const DISC_LABELS_HOME = {
  run: 'Carrera',
  bike: 'Ciclismo',
  swim: 'Natación',
  strength: 'Fuerza',
  other: 'Otro',
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

const textoBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: 'transparent',
  border: 'none',
  color: COLORS.textSecondary,
  padding: '8px 0',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  minHeight: 36,
}

const PAGINA_PASADAS = 10

// Actividades de Strava que cubren las sesiones pasadas mostradas (tope 26
// semanas). Devuelve el nuevo estado, o null si no hace falta pedir más o si no
// hay Strava (entonces el estado se muestra "—").
async function pedirActividadesEstado(userId, lista, actual) {
  const hoy = hoyMadrid()
  const semanas = semanasNecesarias(lista.map((x) => x.fecha), hoy)
  if (!semanas || !userId) return null
  if (actual?.actividades && actual.semanas >= semanas) return null
  try {
    const res = await fetch('/.netlify/functions/coach-athlete-data', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ athleteId: userId, weeks: semanas }),
    })
    if (!res.ok) return null
    const json = await res.json().catch(() => null)
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
  // Historial paginado + estado Hecha/Pendiente (misma lógica que ve el coach)
  const [hayMasPasadas, setHayMasPasadas] = useState(false)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [estadoActs, setEstadoActs] = useState({ actividades: null, desde: null, semanas: 0 })

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

      // Solo el nombre desde el cliente; las conexiones llegan como booleanos
      // del backend (los tokens de Strava/Intervals no salen del servidor).
      const [perfilRes, conexiones] = await Promise.all([
        supabase.from('profiles').select('nombre').eq('id', uid).maybeSingle(),
        misConexiones(),
      ])

      if (!activo) return
      setPerfil({ ...(perfilRes.data || {}), conexiones })
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
          .range(0, PAGINA_PASADAS),
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
        // Se pide una de más para saber si hay otra página
        const lista = pasadasRes.data || []
        setHayMasPasadas(lista.length > PAGINA_PASADAS)
        const visibles = lista.slice(0, PAGINA_PASADAS)
        setPasadas(visibles)
      }
      setCargandoSesiones(false)
      if (!proximasRes.error && !pasadasRes.error) {
        const r = await pedirActividadesEstado(userId, (pasadasRes.data || []).slice(0, PAGINA_PASADAS), null)
        if (activo && r) setEstadoActs(r)
      }
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
  const asignacion = asignarActividades(pasadas, estadoActs.actividades)
  const intervalsOk = !!perfil?.conexiones?.intervals
  const stravaOk = !!perfil?.conexiones?.strava

  async function cerrarSesion() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <PageHeader
          title={perfil?.nombre ? `Hola, ${perfil.nombre}` : 'Tus entrenos'}
          subtitle="Lo que te ha preparado tu entrenador"
          topActions={
            <button onClick={cerrarSesion} style={iconButtonStyle} aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icon name="logout" size={17} />
            </button>
          }
        />

        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { clave: 'sesiones', etiqueta: 'Entrenos' },
            { clave: 'analisis', etiqueta: 'Análisis' },
            { clave: 'temporada', etiqueta: 'Temporada' },
          ]}
        />

        {/* ══ TAB: ENTRENOS ══════════════════════════════════════════════ */}
        {activeTab === 'sesiones' && (
          <>
            <section style={{ marginBottom: 32 }}>
              <SectionTitle>Próximos</SectionTitle>

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
                  {proximas.map((sesion) => {
                    const tieneDetalle = sesion.workout_steps?.bloques?.length > 0
                    const abierta = !!expandidas[sesion.id]
                    const relativo = diaRelativo(sesion.fecha)
                    const enviada = !!sesion.enviado_a_garmin
                    return (
                      <article key={sesion.id} style={{ ...cardStyle, padding: '14px 14px 10px 18px', ...railStyle(sesion.disciplina) }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13, color: COLORS.textSecondary }}>
                          {relativo && <span style={{ color: relativo === 'Hoy' ? COLORS.accent : COLORS.textPrimary, fontWeight: 600 }}>{relativo}</span>}
                          <span style={{ fontFamily: FONTS.mono }}>{formatFechaLarga(sesion.fecha)}</span>
                          <span>{DISC_LABELS_HOME[sesion.disciplina] || sesion.disciplina}</span>
                          {sesion.duracion_min ? <span style={{ fontFamily: FONTS.mono }}>{sesion.duracion_min} min</span> : null}
                        </div>
                        <h3 style={{ margin: '6px 0 0', fontSize: 17, fontWeight: 600, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{tituloSesion(sesion)}</h3>
                        {sesion.notas && (
                          <p style={{ margin: '6px 0 0', fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.45 }}>{sesion.notas}</p>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: enviada ? COLORS.textSecondary : DISCIPLINE_COLORS.bike }}>
                            <Icon name="watch" size={15} />
                            {enviada ? 'En tu reloj' : 'Aún no está en tu reloj'}
                          </span>
                          {tieneDetalle && (
                            <button onClick={() => toggleDetalle(sesion.id)} style={textoBtn} aria-expanded={abierta}>
                              <Icon name="chevronDown" size={16} style={{ transform: abierta ? 'rotate(180deg)' : 'none' }} />
                              {abierta ? 'Ocultar' : 'Ver entreno'}
                            </button>
                          )}
                        </div>

                        {abierta && tieneDetalle && (
                          <div style={{ marginTop: 6, paddingBottom: 4 }}>
                            <WorkoutDetail sesion={sesion} mostrarNotas={false} />
                            {intervalsOk && !enviada && (
                              <div style={{ marginTop: 10 }}>
                                {erroresGarmin[sesion.id] && (
                                  <p style={{ color: COLORS.error, fontSize: 13, margin: '0 0 6px' }}>{erroresGarmin[sesion.id]}</p>
                                )}
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
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </section>

            <section>
              <SectionTitle>Hechos y pendientes</SectionTitle>
              {errorSesiones ? null : !cargandoSesiones && pasadas.length === 0 ? (
                <div style={{ ...cardStyle, padding: 20 }}>
                  <p style={{ color: COLORS.textSecondary, margin: 0, fontSize: 14 }}>Aquí verás tus entrenos pasados y si los hiciste.</p>
                </div>
              ) : (
                <div style={{ ...cardStyle, padding: '2px 0' }}>
                  {pasadas.map((sesion, i) => {
                    const tieneDetalle = sesion.workout_steps?.bloques?.length > 0
                    const abierta = !!expandidas[sesion.id]
                    return (
                      <div key={sesion.id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${COLORS.cardBorder}` }}>
                        <button
                          onClick={() => tieneDetalle && toggleDetalle(sesion.id)}
                          aria-expanded={tieneDetalle ? abierta : undefined}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 16px', cursor: tieneDetalle ? 'pointer' : 'default', color: COLORS.textPrimary }}
                        >
                          <span aria-hidden="true" style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: DISCIPLINE_COLORS[sesion.disciplina] || DISCIPLINE_COLORS.other }} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tituloSesion(sesion)}</span>
                            <span style={{ display: 'block', fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                              <span style={{ fontFamily: FONTS.mono }}>{formatFechaLarga(sesion.fecha)}</span> · {DISC_LABELS_HOME[sesion.disciplina] || sesion.disciplina}
                            </span>
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                            <EstadoPasada estado={estadoDeSesion(sesion, asignacion.get(sesion.id), hoyMadrid(), estadoActs.desde)} />
                          </span>
                        </button>
                        {abierta && tieneDetalle && (
                          <div style={{ padding: '0 16px 14px 31px' }}>
                            <WorkoutDetail sesion={sesion} mostrarNotas={true} />
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
              <SectionTitle>Conexiones</SectionTitle>
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
        {activeTab === 'analisis' && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
              <Segmented
                ariaLabel="Semanas a mostrar"
                value={weeks}
                onChange={(r) => { setDatos(null); setWeeks(r) }}
                options={RANGOS_SEMANAS.map((r) => ({ value: r, label: `${r} sem` }))}
              />
              <button onClick={() => setComparadorAbierto(true)} style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13 }}>
                Comparar semanas
              </button>
            </div>
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
              />
            )}
          </>
        )}

        {/* ══ TAB: TEMPORADA ═══════════════════════════════════════════ */}
        {activeTab === 'temporada' && userId && (
          <SeasonPanel athleteId={userId} atletaNombre={perfil?.nombre} />
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
