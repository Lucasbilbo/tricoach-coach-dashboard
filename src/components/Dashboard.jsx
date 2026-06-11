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

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
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
        </header>

        {cargando && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ ...cardStyle, opacity: 0.5 }}>
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
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
                    style={{ ...cardStyle, cursor: 'pointer', transition: 'all 0.15s ease' }}
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
                  </div>
                )
              })
            })()}
        </div>
      </div>
    </div>
  )
}
