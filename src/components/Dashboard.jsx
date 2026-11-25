import { useEffect, useState } from 'react'
import SeasonOverview from './season/SeasonOverview'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { dashboardGuardado, datosDashboard } from '../lib/panelData'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, cardStyle, pageStyle, buttonStyle, ghostButtonStyle, iconButtonStyle, inputStyle } from '../lib/theme'
import Icon from './ui/Icon'
import { Metric, PageHeader, SectionTitle } from './ui/Layout'
import { TEXTO_NIVEL, cargaRelativa } from '../lib/cargaRelativa'
import { hoyMadrid } from '../lib/chartUtils'
import { tituloSesion } from '../lib/agenda'
import { formatHora } from '../lib/disponibilidad'
import { duracionPrevista } from '../lib/tssPrevisto'
import { esDescanso } from '../lib/descanso'

// TSS de 7 días en el violeta de carga, con una etiqueta relativa a lo
// habitual del atleta (lib/cargaRelativa). Antes: semáforo con cortes fijos y
// colores de disciplina (teal/ámbar/coral), que aquí significan deporte.
const AVISO = '#E8B84A' // mismo ámbar de aviso que la agenda (no el de bici)

function TssRelativo({ tss, semanas }) {
  const rel = cargaRelativa(tss, semanas)
  return (
    <div style={{ minWidth: 0 }}>
      <Metric value={tss} label="TSS" color={tss != null ? COLORS.loadText : undefined} />
      {rel && (
        <div
          title={`Su media de las 4 semanas anteriores: ${rel.media} TSS`}
          style={{ fontSize: 13, marginTop: 2, color: rel.nivel === 'alta' ? AVISO : COLORS.textSecondary, whiteSpace: 'nowrap' }}
        >
          {TEXTO_NIVEL[rel.nivel]}
        </div>
      )}
    </div>
  )
}

function textoUltimaActividad(dias) {
  if (dias == null) return 'Sin actividad reciente'
  if (dias === 0) return 'Última actividad hoy'
  if (dias === 1) return 'Última actividad ayer'
  return `Última actividad hace ${dias} días`
}

const DIAS_ACTIVO = 3

// Carga de las últimas semanas: barras finas con la semana debajo.
function CargaSemanas({ semanas }) {
  if (!semanas || semanas.length === 0) return null
  const maxTss = Math.max(...semanas.map((s) => s.tss_total || 0))
  if (maxTss <= 0) return null
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 48 }}>
        {semanas.map((s, i) => (
          <div
            key={s.semana}
            title={`Semana del ${s.semana}: ${s.tss_total} TSS`}
            style={{
              flex: 1,
              // Semana sin actividad: raya fina gris (no una barra mínima violeta,
              // que se confundiría con una semana floja).
              height: s.tss_total > 0 ? `${Math.max((s.tss_total / maxTss) * 100, 6)}%` : 2,
              borderRadius: 4,
              background: s.tss_total > 0 ? (i === semanas.length - 1 ? COLORS.load : '#2E2A4A') : COLORS.textTertiary,
            }}
          />
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.textSecondary }}>Carga de las últimas {semanas.length} semanas</p>
    </div>
  )
}

function Estado({ dias }) {
  const activo = dias != null && dias <= DIAS_ACTIVO
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: COLORS.textSecondary }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: activo ? COLORS.accent : COLORS.textTertiary }} />
      {textoUltimaActividad(dias)}
    </span>
  )
}

// Lo que el atleta tiene HOY (coach_sessions, consulta directa: ~30 ms desde
// el navegador). Sin hora, sin entreno o con descanso, se dice tal cual.
function HoyAtleta({ sesiones }) {
  if (sesiones == null) return <div style={{ height: 62, marginTop: 16 }} />
  if (sesiones.length === 0) {
    return (
      <div style={{ marginTop: 16, padding: '0 14px', minHeight: 50, display: 'flex', alignItems: 'center', borderRadius: 14, background: COLORS.sunken, fontSize: 15, color: COLORS.textSecondary }}>
        Nada planificado hoy
      </div>
    )
  }
  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sesiones.map((s) => {
        const descanso = esDescanso(s)
        const color = DISCIPLINE_COLORS[s.disciplina] || DISCIPLINE_COLORS.other
        const dp = duracionPrevista(s)
        const hora = Number.isInteger(s.hora_inicio_min) ? formatHora(s.hora_inicio_min) : null
        return (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, background: COLORS.sunken }}>
            <span aria-hidden="true" style={{ width: 4, height: 34, borderRadius: 2, background: color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: COLORS.textSecondary }}>{hora ? `Hoy, ${hora}` : 'Hoy'} · {DISCIPLINE_LABELS[s.disciplina] || 'Sesión'}</div>
              <div style={{ fontSize: 16, fontWeight: 650, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {tituloSesion(s)}{dp ? ` · ${dp.estimada ? '~' : ''}${dp.min} min` : ''}
              </div>
            </div>
            {!descanso && (
              <span style={{ fontSize: 13, whiteSpace: 'nowrap', color: s.enviado_a_garmin ? COLORS.accent : AVISO }}>
                {s.enviado_a_garmin ? 'En su reloj' : 'Sin enviar'}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Avatar({ nombre }) {
  return (
    <span aria-hidden="true" style={{ width: 46, height: 46, borderRadius: 23, flexShrink: 0, background: '#1E2430', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, fontStretch: '112%' }}>
      {(nombre || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [atletas, setAtletas] = useState([])
  const [cargando, setCargando] = useState(true)
  // Pintado con la copia guardada y pidiendo la buena en segundo plano
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState('')
  const [coachId, setCoachId] = useState(null)
  const [esTambienAtleta, setEsTambienAtleta] = useState(false)
  const [invitaciones, setInvitaciones] = useState([])
  const [emailInvite, setEmailInvite] = useState('')
  const [generando, setGenerando] = useState(false)
  const [copiados, setCopiados] = useState({})
  // Sesiones de HOY por atleta (Map athlete_id → sesiones); null = cargando
  const [deHoy, setDeHoy] = useState(null)
  const idsAtletas = atletas.map((a) => a.athlete_id).sort().join(',')

  useEffect(() => {
    if (!idsAtletas) return undefined
    let vivo = true
    supabase
      .from('coach_sessions')
      .select('id, athlete_id, fecha, disciplina, hora_inicio_min, duracion_min, workout_steps, descripcion, enviado_a_garmin')
      .in('athlete_id', idsAtletas.split(','))
      .eq('fecha', hoyMadrid())
      .order('hora_inicio_min', { ascending: true, nullsFirst: true })
      .then(({ data, error: e }) => {
        if (!vivo) return
        const mapa = new Map()
        // Si falla, sin bloque «hoy» (mejor que decir «nada planificado»)
        if (e) { setDeHoy(new Map([['__error', true]])); return }
        for (const s of data || []) mapa.set(s.athlete_id, [...(mapa.get(s.athlete_id) || []), s])
        setDeHoy(mapa)
      })
    return () => { vivo = false }
  }, [idsAtletas])

  const conEntrenoHoy = deHoy && !deHoy.has('__error') ? atletas.filter((a) => (deHoy.get(a.athlete_id) || []).some((s) => !esDescanso(s))).length : null
  const subtitulo = conEntrenoHoy == null || atletas.length === 0
    ? 'Volumen y carga de los últimos 7 días'
    : conEntrenoHoy === 0
      ? 'Hoy nadie tiene entreno'
      : conEntrenoHoy === atletas.length && atletas.length > 1
        ? 'Hoy entrenan todos'
        : `Hoy ${conEntrenoHoy === 1 ? 'entrena 1' : `entrenan ${conEntrenoHoy}`} de ${atletas.length}`

  useEffect(() => {
    let activo = true

    async function cargarAtletas() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData?.session?.user?.id
        if (!userId) {
          navigate('/')
          return
        }

        // Los datos de los atletas (la petición lenta: Strava/BD por atleta) salen
        // YA, en paralelo con la comprobación de coach: el backend verifica el JWT
        // y la whitelist por su cuenta, así que lanzarla antes no abre nada. Si
        // al final no es coach se descarta (la caché nunca guarda fallos).
        // Lo último que se vio (localStorage) se pinta YA; la petición de
        // abajo lo sustituye al llegar. Solo existe si este uid ya entró como
        // coach en este navegador.
        const guardado = dashboardGuardado(userId)
        if (guardado && activo) {
          setAtletas(guardado)
          setCargando(false)
          setActualizando(true)
        }
        const atletasP = datosDashboard({ uid: userId }).then((v) => ({ ok: v }), (err) => ({ err }))
        // Las consultas de supabase-js no salen hasta que alguien las espera:
        // .then() la lanza ya, en paralelo con todo lo demás.
        const invitacionesP = supabase
          .from('athlete_invitations')
          .select('*')
          .eq('coach_id', userId)
          .order('created_at', { ascending: false })
          .then((r) => r)

        // El login con Google llega aquí sin pasar por la verificación de Login.jsx.
        // Comprobamos coach y perfil a la vez para enrutar correctamente (F2):
        // solo coaches usan el panel; un atleta va a su /home en vez de ser
        // deslogueado en silencio. "¿También es atleta?" va en el mismo lote.
        const [{ data: coach, error: coachError }, { data: profile }, { data: comoAtleta }] = await Promise.all([
          supabase.from('coaches').select('id').eq('id', userId).maybeSingle(),
          supabase.from('profiles').select('id').eq('id', userId).maybeSingle(),
          supabase.from('coach_athletes').select('coach_id').eq('athlete_id', userId).maybeSingle(),
        ])

        if (!activo) return

        if (coachError) {
          setError('Error verificando el acceso')
          return
        }

        if (!coach) {
          if (profile) {
            navigate('/home', { replace: true })
            return
          }
          // Ni coach ni atleta: desloguear con un mensaje claro en la home
          await supabase.auth.signOut()
          navigate('/', {
            replace: true,
            state: {
              authError:
                'Esta cuenta no está vinculada a ningún perfil de GetRiCoach. Pide a tu entrenador un link de invitación.',
            },
          })
          return
        }

        setCoachId(userId)
        setEsTambienAtleta(!!comoAtleta)

        const [resAtletas, { data: invs }] = await Promise.all([atletasP, invitacionesP])
        if (!activo) return
        setInvitaciones(invs || [])
        if (resAtletas.err) {
          setError(guardado ? `No se pudo actualizar (se muestran los últimos datos): ${resAtletas.err.message}` : resAtletas.err.message)
          return
        }
        setAtletas(resAtletas.ok)
      } catch {
        if (activo) setError('Error de conexión cargando atletas')
      } finally {
        if (activo) {
          setCargando(false)
          setActualizando(false)
        }
      }
    }

    cargarAtletas()
    return () => {
      activo = false
    }
  }, [navigate])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  async function generarInvitacion() {
    if (!coachId) return
    setGenerando(true)
    try {
      const registro = { coach_id: coachId }
      if (emailInvite.trim()) registro.email = emailInvite.trim()

      const { data, error: insertError } = await supabase
        .from('athlete_invitations')
        .insert(registro)
        .select()
        .single()

      if (insertError) throw insertError

      setInvitaciones((prev) => [data, ...prev])
      setEmailInvite('')
    } catch {
      setError('Error generando la invitación')
    } finally {
      setGenerando(false)
    }
  }

  async function eliminarInvitacion(invId) {
    await supabase.from('athlete_invitations').delete().eq('id', invId)
    setInvitaciones((prev) => prev.filter((i) => i.id !== invId))
  }

  function copiarLink(inv) {
    const link = `${window.location.origin}/join/${inv.token}`
    navigator.clipboard.writeText(link).then(() => {
      setCopiados((prev) => ({ ...prev, [inv.id]: true }))
      setTimeout(() => setCopiados((prev) => ({ ...prev, [inv.id]: false })), 2000)
    })
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <PageHeader
          title="Tus atletas"
          subtitle={subtitulo}
          topActions={
            <>
              {esTambienAtleta && (
                <button onClick={() => navigate('/home')} style={ghostButtonStyle}>
                  <Icon name="user" size={16} />
                  Mis entrenos
                </button>
              )}
              <button onClick={handleLogout} style={iconButtonStyle} aria-label="Cerrar sesión" title="Cerrar sesión">
                <Icon name="logout" size={17} />
              </button>
            </>
          }
        />

        {error && <p style={{ color: COLORS.error, marginBottom: 16 }}>{error}</p>}
        {actualizando && !error && (
          <p role="status" style={{ color: COLORS.textTertiary, fontSize: 13, margin: '0 0 12px' }}>Actualizando…</p>
        )}

        {!cargando && !error && atletas.length === 0 && (
          <div style={{ ...cardStyle, padding: 32 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Aún no tienes atletas</p>
            <p style={{ margin: 0, color: COLORS.textSecondary, fontSize: 14 }}>
              Genera un enlace de invitación más abajo y compártelo con tu atleta.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
          {cargando &&
            [1, 2].map((i) => (
              <div key={i} style={{ ...cardStyle, height: 300, opacity: 0.5 }} />
            ))}
          {!cargando &&
            atletas.map((atleta) => (
              <button
                key={atleta.athlete_id}
                onClick={() => navigate(`/athlete/${atleta.athlete_id}`)}
                // Columna arriba: un <button> centra su contenido en vertical y, en
                // una fila con otra tarjeta más alta (con gráfico), el nombre
                // quedaba flotando a media altura.
                style={{ ...cardStyle, borderRadius: 24, padding: 18, textAlign: 'left', cursor: 'pointer', color: COLORS.textPrimary, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar nombre={atleta.nombre} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 23, fontWeight: 800, fontStretch: '112%', letterSpacing: '-0.015em', lineHeight: 1.1 }}>{atleta.nombre}</div>
                    <div style={{ marginTop: 4 }}>
                      <Estado dias={atleta.ultima_actividad_dias} />
                    </div>
                  </div>
                  <Icon name="chevronRight" size={20} color={COLORS.textTertiary} />
                </div>
                {deHoy && !deHoy.has('__error') && <HoyAtleta sesiones={deHoy.get(atleta.athlete_id) || []} />}
                {!deHoy && <HoyAtleta sesiones={null} />}
                {atleta.km_semana == null && atleta.horas_semana == null && atleta.tss_semana == null ? (
                  <p style={{ margin: '18px 0 0', fontSize: 15, lineHeight: 1.45, color: COLORS.textSecondary }}>
                    Sin actividades de Strava en los últimos 7 días. Cuando las haya verás aquí su volumen y su carga.
                  </p>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20, paddingTop: 16, borderTop: `1px solid ${COLORS.cardBorder}` }}>
                  <Metric value={atleta.km_semana} unit="km" label="7 días" />
                  <Metric value={atleta.horas_semana} unit="h" label="en movimiento" />
                  <TssRelativo tss={atleta.tss_semana} semanas={atleta.semanas_recientes} />
                </div>
                )}
                <CargaSemanas semanas={atleta.semanas_recientes} />
              </button>
            ))}
        </div>

        {!cargando && !error && atletas.length > 0 && <SeasonOverview />}

        {/* ── Invitar atleta ─────────────────────────────────────────────── */}
        <section style={{ marginTop: 40 }}>
          <SectionTitle>Invitar a un atleta</SectionTitle>
          <div style={cardStyle}>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: COLORS.textSecondary }}>
              Crea un enlace y envíaselo. Al abrirlo se crea su cuenta y queda vinculado a ti.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="email"
                value={emailInvite}
                onChange={(e) => setEmailInvite(e.target.value)}
                placeholder="Email del atleta (opcional)"
                aria-label="Email del atleta"
                style={{ ...inputStyle, flex: '1 1 220px', width: 'auto' }}
              />
              <button
                onClick={generarInvitacion}
                disabled={generando || !coachId}
                style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: generando ? 0.7 : 1, flex: '0 0 auto' }}
              >
                <Icon name="link" size={16} />
                {generando ? 'Creando…' : 'Crear enlace'}
              </button>
            </div>

            {invitaciones.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0 }}>
                {invitaciones.map((inv) => (
                  <li
                    key={inv.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: `1px solid ${COLORS.cardBorder}` }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {inv.email || 'Sin email'}
                      </div>
                      <div style={{ fontSize: 12, color: inv.used ? COLORS.accent : COLORS.textTertiary, marginTop: 2 }}>
                        {inv.used ? 'Aceptada' : 'Pendiente de aceptar'}
                      </div>
                    </div>
                    {!inv.used && (
                      <>
                        <button
                          onClick={() => copiarLink(inv)}
                          style={{ ...ghostButtonStyle, padding: '7px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, color: copiados[inv.id] ? COLORS.accent : COLORS.textPrimary }}
                        >
                          <Icon name={copiados[inv.id] ? 'check' : 'copy'} size={15} />
                          {copiados[inv.id] ? 'Copiado' : 'Copiar enlace'}
                        </button>
                        <button
                          onClick={() => eliminarInvitacion(inv.id)}
                          style={{ ...iconButtonStyle, color: COLORS.error }}
                          aria-label="Borrar invitación"
                          title="Borrar invitación"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
