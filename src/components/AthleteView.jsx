import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { hoyMadrid } from '../lib/chartUtils'
import { COLORS, pageStyle, buttonStyle, ghostButtonStyle } from '../lib/theme'
import Icon from './ui/Icon'
import { PageHeader, Segmented, Tabs } from './ui/Layout'
import WorkoutBuilder from './WorkoutBuilder'
import SessionsList from './SessionsList'
import WeekCompare from './WeekCompare'
import StravaAnalysis from './shared/StravaAnalysis'
import SeasonPanel from './season/SeasonPanel'

const RANGOS_SEMANAS = [4, 8, 12, 24]

export default function AthleteView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [weeks, setWeeks] = useState(8)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [coachId, setCoachId] = useState(null)
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() =>
    ['analisis', 'sesiones', 'temporada'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'analisis'
  )
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
        <PageHeader
          onBack={() => navigate('/dashboard')}
          backLabel="Atletas"
          title={datos?.atleta?.nombre || (cargando ? ' ' : 'Atleta')}
          actions={
            <button onClick={() => setModalAbierto(true)} style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={16} strokeWidth={2.2} />
              Prescribir entreno
            </button>
          }
        />

        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { clave: 'analisis', etiqueta: 'Análisis' },
            { clave: 'sesiones', etiqueta: 'Sesiones' },
            { clave: 'temporada', etiqueta: 'Temporada' },
          ]}
        />

        {activeTab === 'analisis' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
            <Segmented
              ariaLabel="Semanas a mostrar"
              value={weeks}
              onChange={setWeeks}
              options={RANGOS_SEMANAS.map((r) => ({ value: r, label: `${r} sem` }))}
            />
            <button onClick={() => setComparadorAbierto(true)} style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13 }}>
              Comparar semanas
            </button>
          </div>
        )}

        {activeTab === 'sesiones' && coachId && (
          <SessionsList
            key={sesionesVersion}
            coachId={coachId}
            athleteId={id}
            atletaNombre={datos?.atleta?.nombre}
            actividades={actividades}
            weeks={weeks}
            onNewSession={() => setSesionesVersion((v) => v + 1)}
          />
        )}

        {activeTab === 'temporada' && (
          <SeasonPanel athleteId={id} atletaNombre={datos?.atleta?.nombre} esCoach />
        )}

        {activeTab === 'analisis' && cargando && (
          <p style={{ color: COLORS.textSecondary }}>Cargando datos del atleta…</p>
        )}
        {activeTab === 'analisis' && error && <p style={{ color: COLORS.error }}>{error}</p>}

        {activeTab === 'analisis' && !cargando && !error && (
          <StravaAnalysis
            key={id}
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
