import { useEffect, useState } from 'react'
import SeasonOverview from './season/SeasonOverview'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { COLORS, DISCIPLINE_COLORS, cardStyle, pageStyle, buttonStyle, ghostButtonStyle, iconButtonStyle, inputStyle } from '../lib/theme'
import Icon from './ui/Icon'
import { Metric, PageHeader, SectionTitle } from './ui/Layout'

const TSS_BAJO = DISCIPLINE_COLORS.swim // teal
const TSS_MEDIO = DISCIPLINE_COLORS.bike // amber
const TSS_ALTO = DISCIPLINE_COLORS.run // coral

function colorTss(tss) {
  if (tss == null) return COLORS.textSecondary
  if (tss < 300) return TSS_BAJO
  if (tss <= 450) return TSS_MEDIO
  return TSS_ALTO
}

function textoUltimaActividad(dias) {
  if (dias == null) return 'Sin actividad reciente'
  if (dias === 0) return 'Última actividad hoy'
  if (dias === 1) return 'Última actividad hace 1 día'
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
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 34 }}>
        {semanas.map((s, i) => (
          <div
            key={s.semana}
            title={`Semana del ${s.semana}: ${s.tss_total} TSS`}
            style={{
              flex: 1,
              height: `${Math.max(((s.tss_total || 0) / maxTss) * 100, 6)}%`,
              borderRadius: 3,
              background: COLORS.load,
              opacity: i === semanas.length - 1 ? 1 : 0.4,
            }}
          />
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textTertiary }}>Carga de las últimas {semanas.length} semanas</p>
    </div>
  )
}

function Estado({ dias }) {
  const activo = dias != null && dias <= DIAS_ACTIVO
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: COLORS.textSecondary }}>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: activo ? COLORS.accent : COLORS.textTertiary }} />
      {textoUltimaActividad(dias)}
    </span>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [atletas, setAtletas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [coachId, setCoachId] = useState(null)
  const [esTambienAtleta, setEsTambienAtleta] = useState(false)
  const [invitaciones, setInvitaciones] = useState([])
  const [emailInvite, setEmailInvite] = useState('')
  const [generando, setGenerando] = useState(false)
  const [copiados, setCopiados] = useState({})

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

        // El login con Google llega aquí sin pasar por la verificación de Login.jsx.
        // Comprobamos coach y perfil a la vez para enrutar correctamente (F2):
        // solo coaches usan el panel; un atleta va a su /home en vez de ser
        // deslogueado en silencio.
        const [{ data: coach, error: coachError }, { data: profile }] = await Promise.all([
          supabase.from('coaches').select('id').eq('id', userId).maybeSingle(),
          supabase.from('profiles').select('id').eq('id', userId).maybeSingle(),
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

        // Verificar si este coach también aparece como atleta en coach_athletes
        const { data: comoAtleta } = await supabase
          .from('coach_athletes')
          .select('coach_id')
          .eq('athlete_id', userId)
          .maybeSingle()
        if (activo) setEsTambienAtleta(!!comoAtleta)

        // El coach se deriva del JWT en el backend: no se manda coachId
        const res = await fetch('/.netlify/functions/coach-dashboard-data', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({}),
        })

        const json = await res.json()
        if (!activo) return

        if (!res.ok) {
          setError(json?.error || 'No se pudieron cargar los atletas')
          return
        }

        setAtletas(Array.isArray(json) ? json : [])

        // Cargar invitaciones
        const { data: invs } = await supabase
          .from('athlete_invitations')
          .select('*')
          .eq('coach_id', userId)
          .order('created_at', { ascending: false })
        if (activo) setInvitaciones(invs || [])
      } catch {
        if (activo) setError('Error de conexión cargando atletas')
      } finally {
        if (activo) setCargando(false)
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
          brandSub="· Panel del entrenador"
          title="Tus atletas"
          subtitle="Volumen y carga de los últimos 7 días"
          topActions={
            <>
              {esTambienAtleta && (
                <button onClick={() => navigate('/home')} style={{ ...ghostButtonStyle, padding: '8px 12px', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
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

        {!cargando && !error && atletas.length === 0 && (
          <div style={{ ...cardStyle, padding: 32 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Aún no tienes atletas</p>
            <p style={{ margin: 0, color: COLORS.textSecondary, fontSize: 14 }}>
              Genera un enlace de invitación más abajo y compártelo con tu atleta.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
          {cargando &&
            [1, 2].map((i) => (
              <div key={i} style={{ ...cardStyle, height: 178, opacity: 0.5 }} />
            ))}
          {!cargando &&
            atletas.map((atleta) => (
              <button
                key={atleta.athlete_id}
                onClick={() => navigate(`/athlete/${atleta.athlete_id}`)}
                style={{ ...cardStyle, textAlign: 'left', cursor: 'pointer', color: COLORS.textPrimary, width: '100%' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>{atleta.nombre}</div>
                    <div style={{ marginTop: 4 }}>
                      <Estado dias={atleta.ultima_actividad_dias} />
                    </div>
                  </div>
                  <Icon name="chevronRight" size={20} color={COLORS.textTertiary} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 20 }}>
                  <Metric value={atleta.km_semana} unit="km" label="Distancia" />
                  <Metric value={atleta.horas_semana} unit="h" label="Tiempo" />
                  <Metric value={atleta.tss_semana} label="TSS" color={colorTss(atleta.tss_semana)} />
                </div>
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
