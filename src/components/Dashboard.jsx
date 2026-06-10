import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COLORS, cardStyle, pageStyle, buttonStyle } from '../lib/theme'

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

        const { data, error: queryError } = await supabase
          .from('coach_athletes')
          .select('athlete_id, profiles ( id, nombre )')
          .eq('coach_id', userId)

        if (!activo) return

        if (queryError) {
          setError('No se pudieron cargar los atletas')
          return
        }

        setAtletas(data || [])
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
              Panel del entrenador
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

        {cargando && <p style={{ color: COLORS.textSecondary }}>Cargando atletas…</p>}
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
          {atletas.map((fila) => {
            const nombre = fila.profiles?.nombre || 'Atleta sin nombre'
            return (
              <div
                key={fila.athlete_id}
                onClick={() => navigate(`/athlete/${fila.athlete_id}`)}
                style={{ ...cardStyle, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      background: COLORS.accent,
                      color: COLORS.background,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    {nombre.charAt(0).toUpperCase()}
                  </div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{nombre}</h2>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  {['Km semana', 'Horas', 'TSS'].map((etiqueta) => (
                    <div key={etiqueta}>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary }}>
                        —
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary }}>
                        {etiqueta}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
