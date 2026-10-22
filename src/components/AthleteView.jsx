import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { pedirDatosAtleta, forzarDatosAtleta } from '../lib/athleteData'
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
  const [refrescos, setRefrescos] = useState(0)
  const [comparadorAbierto, setComparadorAbierto] = useState(false)

  useEffect(() => {
    let activo = true

    async function cargarDatos() {
      setCargando(true)
      setError('')
      try {
        // Lanzar sesión y datos en paralelo: getSession lee de localStorage
        // (sin red en supabase-js v2), así que no hay coste, pero sí había
        // un await serial que retrasaba la petición al backend.
        // Si el selector está en menos de 26 semanas, pre-calentar la serie
        // larga en paralelo: cuando StravaAnalysis la pida, estará en caché.
        const peticiones = [
          supabase.auth.getSession(),
          pedirDatosAtleta(id, weeks),
        ]
        if (weeks < 26) peticiones.push(pedirDatosAtleta(id, 26, { records: false }))
        const [{ data: sessionData }, res] = await Promise.all(peticiones)
        const usuarioId = sessionData?.session?.user?.id
        if (!usuarioId) {
          navigate('/')
          return
        }
        setCoachId(usuarioId)
        const json = res.json
        if (!activo) return

        if (!res.ok || !json) {
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
  }, [id, weeks, navigate, refrescos])

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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Los datos de Strava se reutilizan 5 min; esto fuerza una lectura nueva */}
              <button
                onClick={() => {
                  forzarDatosAtleta(id)
                  setRefrescos((v) => v + 1)
                }}
                disabled={cargando}
                aria-label="Actualizar datos de Strava"
                style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: cargando ? 0.5 : 1 }}
              >
                <Icon name="refresh" size={15} strokeWidth={2} />
                Actualizar
              </button>
              <button onClick={() => setComparadorAbierto(true)} style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13 }}>
                Comparar semanas
              </button>
            </div>
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
