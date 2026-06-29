import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COLORS, cardStyle, pageStyle, buttonStyle } from '../lib/theme'

const TSS_VERDE = '#00E5A0'
const TSS_AMARILLO = '#FDE68A'
const TSS_ROJO = '#FF4D6D'

function colorTss(tss) {
  if (tss == null) return COLORS.textSecondary
  if (tss < 300) return TSS_VERDE
  if (tss <= 450) return TSS_AMARILLO
  return TSS_ROJO
}

function textoUltimaActividad(dias) {
  if (dias == null) return 'Sin actividad reciente'
  if (dias === 0) return 'Última actividad hoy'
  if (dias === 1) return 'Última actividad hace 1 día'
  return `Última actividad hace ${dias} días`
}

const DIAS_ACTIVO = 3

function BarraProgreso({ valor, max, color }) {
  const pct = max > 0 && valor != null ? Math.min((valor / max) * 100, 100) : 0
  return (
    <div
      style={{
        height: 3,
        borderRadius: 2,
        background: 'rgba(255,255,255,0.08)',
        marginTop: 6,
        overflow: 'hidden',
      }}
    >
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 2, background: color }} />
    </div>
  )
}

const SPARKLINE_ALTO = 32
const SPARKLINE_BARRA_ANCHO = 18
const SPARKLINE_COLOR = 'rgba(124,58,237,0.6)'

function SparklineTss({ semanas }) {
  if (!semanas || semanas.length === 0) return null
  const maxTss = Math.max(...semanas.map((s) => s.tss_total || 0))
  if (maxTss <= 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 4,
        height: SPARKLINE_ALTO,
        marginTop: 16,
      }}
    >
      {semanas.map((s) => (
        <div
          key={s.semana}
          style={{
            width: SPARKLINE_BARRA_ANCHO,
            height: Math.max(((s.tss_total || 0) / maxTss) * SPARKLINE_ALTO, 2),
            background: SPARKLINE_COLOR,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  )
}

function MetricaConBarra({ etiqueta, valor, max, color }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color }}>
        {valor != null ? valor : '—'}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary }}>{etiqueta}</p>
      <BarraProgreso valor={valor} max={max} color={color} />
    </div>
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

        // El login con Google llega aquí sin pasar por la verificación de Login.jsx:
        // solo usuarios presentes en `coaches` pueden usar el panel
        const { data: coach, error: coachError } = await supabase
          .from('coaches')
          .select('id')
          .eq('id', userId)
          .maybeSingle()

        if (!activo) return

        if (coachError) {
          setError('Error verificando el acceso')
          return
        }

        if (!coach) {
          await supabase.auth.signOut()
          navigate('/')
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

        const res = await fetch('/.netlify/functions/coach-dashboard-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-coach-secret': import.meta.env.VITE_COACH_SECRET || '',
          },
          body: JSON.stringify({ coachId: userId }),
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
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 32,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
              Mis <span style={{ color: COLORS.accent }}>atletas</span>
            </h1>
            <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: '4px 0 0' }}>
              Panel del entrenador · últimos 7 días
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {esTambienAtleta && (
              <button
                onClick={() => navigate('/home')}
                style={{
                  ...buttonStyle,
                  background: 'transparent',
                  color: COLORS.textSecondary,
                  border: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                👤 Mis entrenamientos
              </button>
            )}
            <button
              onClick={handleLogout}
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.cardBorder}`,
              }}
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        {cargando && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 20,
            }}
          >
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...cardStyle, padding: 28, opacity: 0.5 }}>
                <div
                  style={{
                    height: 16,
                    width: '60%',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    marginBottom: 12,
                  }}
                />
                <div
                  style={{
                    height: 12,
                    width: '40%',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    marginBottom: 20,
                  }}
                />
                <div
                  style={{
                    height: 24,
                    width: '80%',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4,
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: COLORS.error }}>{error}</p>}

        {!cargando && !error && atletas.length === 0 && (
          <div style={{ ...cardStyle, textAlign: 'center', padding: 48 }}>
            <p style={{ color: COLORS.textSecondary, margin: 0 }}>
              Todavía no tienes atletas asignados.
            </p>
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {!cargando &&
            (() => {
              const maxKm = Math.max(...atletas.map((a) => a.km_semana || 0), 0)
              const maxHoras = Math.max(...atletas.map((a) => a.horas_semana || 0), 0)
              const maxTss = Math.max(...atletas.map((a) => a.tss_semana || 0), 0)

              return atletas.map((atleta) => {
                const activo =
                  atleta.ultima_actividad_dias != null &&
                  atleta.ultima_actividad_dias <= DIAS_ACTIVO
                return (
                  <div
                    key={atleta.athlete_id}
                    onClick={() => navigate(`/athlete/${atleta.athlete_id}`)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(0,212,255,0.3)'
                      e.currentTarget.style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = COLORS.cardBorder
                      e.currentTarget.style.transform = 'none'
                    }}
                    style={{ ...cardStyle, padding: 28, cursor: 'pointer', transition: 'all 0.15s ease' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                      }}
                    >
                      <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                          {atleta.nombre}
                        </h2>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
                          {textoUltimaActividad(atleta.ultima_actividad_dias)}
                        </p>
                      </div>
                      <span
                        style={{
                          color: activo ? TSS_VERDE : COLORS.textSecondary,
                          background: activo ? 'rgba(0,229,160,0.1)' : 'rgba(255,255,255,0.06)',
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 20, marginTop: 20 }}>
                      <MetricaConBarra
                        etiqueta="Km semana"
                        valor={atleta.km_semana}
                        max={maxKm}
                        color={COLORS.textPrimary}
                      />
                      <MetricaConBarra
                        etiqueta="Horas"
                        valor={atleta.horas_semana}
                        max={maxHoras}
                        color={COLORS.textPrimary}
                      />
                      <MetricaConBarra
                        etiqueta="TSS"
                        valor={atleta.tss_semana}
                        max={maxTss}
                        color={colorTss(atleta.tss_semana)}
                      />
                    </div>

                    <SparklineTss semanas={atleta.semanas_recientes} />
                  </div>
                )
              })
            })()}
        </div>

        {/* ── Invitar atleta ─────────────────────────────────────────────── */}
        <div style={{ marginTop: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderTop: `1px solid ${COLORS.cardBorder}`,
              paddingTop: 28,
              marginBottom: 20,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
              Invitar nuevo atleta
            </h2>
          </div>

          <div
            style={{
              background: '#0F1729',
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: COLORS.textSecondary,
                    marginBottom: 6,
                  }}
                >
                  Email del atleta (opcional)
                </label>
                <input
                  type="email"
                  value={emailInvite}
                  onChange={(e) => setEmailInvite(e.target.value)}
                  placeholder="atleta@email.com"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: COLORS.background,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 8,
                    padding: '10px 12px',
                    color: COLORS.textPrimary,
                    fontSize: 14,
                    fontFamily: "'Inter', sans-serif",
                    outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={generarInvitacion}
                disabled={generando || !coachId}
                style={{
                  background: COLORS.accent,
                  color: COLORS.background,
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: generando ? 'wait' : 'pointer',
                  fontFamily: "'Inter', sans-serif",
                  opacity: generando ? 0.7 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {generando ? 'Generando...' : 'Generar link de invitación'}
              </button>
            </div>

            {invitaciones.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: COLORS.textSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: 10,
                  }}
                >
                  Invitaciones enviadas
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {invitaciones.map((inv) => {
                    const link = `${window.location.origin}/join/${inv.token}`
                    return (
                      <div
                        key={inv.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          flexWrap: 'wrap',
                          padding: '10px 12px',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 8,
                          border: `1px solid ${COLORS.cardBorder}`,
                        }}
                      >
                        <span style={{ fontSize: 13, color: COLORS.textPrimary, flex: 1, minWidth: 120 }}>
                          {inv.email || <span style={{ color: COLORS.textSecondary }}>Sin email</span>}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: inv.used ? '#00E5A0' : COLORS.textSecondary,
                          }}
                        >
                          {inv.used ? '✅ Usada' : 'Pendiente'}
                        </span>
                        {!inv.used && (
                          <>
                            <code
                              style={{
                                fontSize: 11,
                                color: COLORS.accent,
                                background: '#0A0F1E',
                                padding: '3px 8px',
                                borderRadius: 4,
                                flex: 1,
                                minWidth: 0,
                                maxWidth: 220,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'block',
                              }}
                            >
                              {link}
                            </code>
                            <button
                              onClick={() => copiarLink(inv)}
                              style={{
                                background: 'transparent',
                                color: copiados[inv.id] ? '#00E5A0' : COLORS.textSecondary,
                                border: `1px solid ${COLORS.cardBorder}`,
                                borderRadius: 6,
                                padding: '4px 10px',
                                fontSize: 12,
                                cursor: 'pointer',
                                fontFamily: "'Inter', sans-serif",
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {copiados[inv.id] ? '✓ Copiado' : '📋 Copiar'}
                            </button>
                            <button
                              onClick={() => eliminarInvitacion(inv.id)}
                              style={{
                                background: 'transparent',
                                color: COLORS.error,
                                border: `1px solid ${COLORS.cardBorder}`,
                                borderRadius: 6,
                                padding: '4px 8px',
                                fontSize: 12,
                                cursor: 'pointer',
                                fontFamily: "'Inter', sans-serif",
                              }}
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
