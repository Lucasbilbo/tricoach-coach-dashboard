import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { hoyMadrid } from '../lib/chartUtils'
import { COLORS, pageStyle, buttonStyle } from '../lib/theme'
import WorkoutBuilder from './WorkoutBuilder'
import SessionsList from './SessionsList'
import WeekCompare from './WeekCompare'
import StravaAnalysis from './shared/StravaAnalysis'

const RANGOS_SEMANAS = [4, 8, 12, 24]

export default function AthleteView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [weeks, setWeeks] = useState(8)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [coachId, setCoachId] = useState(null)
  const [activeTab, setActiveTab] = useState('analisis')
  const [modalAbierto, setModalAbierto] = useState(false)
  const [sesionesVersion, setSesionesVersion] = useState(0)
  const [comparadorAbierto, setComparadorAbierto] = useState(false)

  useEffect(() => {
    let activo = true

    async function cargarDatos() {
      setCargando(true)
      setError('')
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const usuarioId = sessionData?.session?.user?.id
        if (!usuarioId) {
          navigate('/')
          return
        }
        setCoachId(usuarioId)

        // El coach se deriva del JWT en el backend; athleteId se verifica
        // allí contra coach_athletes
        const res = await fetch('/.netlify/functions/coach-athlete-data', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ athleteId: id, weeks }),
        })

        const json = await res.json()
        if (!activo) return

        if (!res.ok) {
          setError(json?.error || 'No se pudieron cargar los datos del atleta')
          return
        }

        setDatos(json)
      } catch {
        if (activo) setError('Error de conexión cargando los datos del atleta')
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargarDatos()
    return () => {
      activo = false
    }
  }, [id, weeks, navigate])

  const actividades = datos?.actividades || []
  const semanas = datos?.semanas || []


  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                fontFamily: "'Archivo', sans-serif",
              }}
            >
              ← Volver al panel
            </button>
            <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {datos?.atleta?.nombre || 'Atleta'}
            </h1>
          </div>

          {/* Dos grupos: en desktop quedan en línea, en móvil cada grupo baja a su propia fila */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {RANGOS_SEMANAS.map((rango) => (
                <button
                  key={rango}
                  onClick={() => setWeeks(rango)}
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
              <button onClick={() => setModalAbierto(true)} style={buttonStyle}>
                ＋ Prescribir entrenamiento
              </button>
            </div>
          </div>
        </header>

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
            { clave: 'analisis', etiqueta: 'Análisis' },
            { clave: 'sesiones', etiqueta: 'Sesiones prescritas' },
          ].map((tab) => (
            <button
              key={tab.clave}
              onClick={() => setActiveTab(tab.clave)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom:
                  activeTab === tab.clave ? `2px solid ${COLORS.accent}` : '2px solid transparent',
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

        {activeTab === 'sesiones' && coachId && (
          <SessionsList
            key={sesionesVersion}
            coachId={coachId}
            athleteId={id}
            atletaNombre={datos?.atleta?.nombre}
            actividades={actividades}
            onNewSession={() => setSesionesVersion((v) => v + 1)}
          />
        )}

        {activeTab === 'analisis' && cargando && (
          <p style={{ color: COLORS.textSecondary }}>Cargando datos del atleta…</p>
        )}
        {activeTab === 'analisis' && error && <p style={{ color: COLORS.error }}>{error}</p>}

        {activeTab === 'analisis' && !cargando && !error && (
          <StravaAnalysis
            actividades={actividades}
            semanas={semanas}
            records={datos?.records}
            weeks={weeks}
            athleteId={id}
            buildCsvName={(filtro) => {
              const nombreAtleta = (datos?.atleta?.nombre || 'atleta').replace(/[^\p{L}\p{N}]+/gu, '_')
              return `${nombreAtleta}_${weeks}sem_${filtro}_${hoyMadrid()}.csv`
            }}
          />
        )}

        {comparadorAbierto && (
          <WeekCompare
            key={`${weeks}-${semanas.length}`}
            semanas={semanas}
            onClose={() => setComparadorAbierto(false)}
          />
        )}

        {modalAbierto && coachId && (
          <WorkoutBuilder
            isOpen={modalAbierto}
            athleteId={id}
            coachId={coachId}
            atletaNombre={datos?.atleta?.nombre}
            onClose={() => setModalAbierto(false)}
            onSaved={() => {
              setModalAbierto(false)
              setActiveTab('sesiones')
              setSesionesVersion((v) => v + 1)
            }}
          />
        )}
      </div>
    </div>
  )
}
