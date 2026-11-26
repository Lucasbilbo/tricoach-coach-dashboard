import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { pedirDatosAtleta, forzarDatosAtleta } from '../lib/athleteData'
import { hoyMadrid } from '../lib/chartUtils'
import { precargarGraficos } from '../lib/precargarGraficos'
import { COLORS, pageStyle, buttonStyle, ghostButtonStyle, iconButtonStyle } from '../lib/theme'
import Icon from './ui/Icon'
import { PageHeader, Tabs } from './ui/Layout'
import SelectorPeriodo from './ui/SelectorPeriodo'
import WorkoutBuilder from './WorkoutBuilder'
import PotenciaAjustes from './PotenciaAjustes'
import SessionsList from './SessionsList'
import WeekCompare from './WeekCompare'
import StravaAnalysis from './shared/StravaAnalysis'
import SinStrava from './shared/SinStrava'
import AnalisisCargando from './shared/AnalisisCargando'
import SeasonPanel from './season/SeasonPanel'
import { SEMANAS_BASE, SEMANAS_CARGA, claveArchivo, esPreset, periodoInicial } from '../lib/periodo'
import { useDatosRango } from '../hooks/useDatosRango'

export default function AthleteView() {
  const { id } = useParams()
  const navigate = useNavigate()
  // Periodo del Análisis: últimas N semanas, una semana o un rango de fechas.
  // `weeks` (datos de base: Sesiones, comparar semanas) solo sigue a los presets;
  // con una semana o un rango el análisis pide su tramo aparte (useDatosRango).
  const [periodo, setPeriodo] = useState(periodoInicial)
  const weeks = esPreset(periodo) ? periodo.semanas : SEMANAS_BASE
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [sinStrava, setSinStrava] = useState(false) // 409: Strava sin conectar (estado normal)
  const [coachId, setCoachId] = useState(null)
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() =>
    // Por defecto Sesiones: lo que Jon hace casi siempre al abrir un atleta es
    // planificar su semana (decidido con Lucas 2026-10-29). ?tab= sigue mandando.
    ['analisis', 'sesiones', 'temporada'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'sesiones'
  )
  const [modalAbierto, setModalAbierto] = useState(false)
  const [sesionesVersion, setSesionesVersion] = useState(0)
  const [refrescos, setRefrescos] = useState(0)
  const [comparadorAbierto, setComparadorAbierto] = useState(false)

  // Al abrir Análisis (también con ?tab=analisis) se pide ya el paquete de
  // gráficos, en paralelo con los datos
  useEffect(() => {
    if (activeTab === 'analisis') precargarGraficos()
  }, [activeTab])

  useEffect(() => {
    let activo = true

    async function cargarDatos() {
      setCargando(true)
      setError('')
      setSinStrava(false)
      try {
        // Lanzar sesión y datos en paralelo: getSession lee de localStorage
        // (sin red en supabase-js v2), así que no hay coste, pero sí había
        // un await serial que retrasaba la petición al backend.
        // `carga`: si el selector está en menos de 26 semanas, la misma respuesta
        // trae la serie larga (una sola petición: Netlify pone en cola las
        // concurrentes) y StravaAnalysis la encuentra ya en caché.
        const [{ data: sessionData }, res] = await Promise.all([
          supabase.auth.getSession(),
          pedirDatosAtleta(id, weeks, { carga: SEMANAS_CARGA }),
        ])
        const usuarioId = sessionData?.session?.user?.id
        if (!usuarioId) {
          navigate('/')
          return
        }
        setCoachId(usuarioId)
        const json = res.json
        if (!activo) return

        if (res.status === 409) {
          // Sin Strava: el resto de la ficha (nombre, Sesiones) sigue funcionando
          setSinStrava(true)
          setDatos(json?.atleta ? { atleta: json.atleta, actividades: [], semanas: [] } : null)
          return
        }
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

  // Lo que dibuja el Análisis: los datos de base con un preset, el tramo con lo demás
  const rangoDatos = useDatosRango(id, periodo, refrescos)
  const datosAnalisis = rangoDatos.activo ? rangoDatos.datos : datos
  const cargandoAnalisis = rangoDatos.activo ? rangoDatos.cargando : cargando
  const errorAnalisis = rangoDatos.activo ? rangoDatos.error : error


  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <PageHeader
          onBack={() => navigate('/dashboard')}
          backLabel="Atletas"
          title={datos?.atleta?.nombre || (cargando ? ' ' : 'Atleta')}
          actions={
            <button onClick={() => setModalAbierto(true)} style={{ ...buttonStyle, minHeight: 50, padding: '0 22px', fontSize: 16 }}>
              <Icon name="plus" size={18} strokeWidth={2.4} />
              Prescribir entreno
            </button>
          }
        />

        <Tabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { clave: 'sesiones', etiqueta: 'Sesiones' },
            { clave: 'analisis', etiqueta: 'Análisis' },
            { clave: 'temporada', etiqueta: 'Temporada' },
          ]}
        />

        {activeTab === 'analisis' && sinStrava && !cargando && <SinStrava nombre={datos?.atleta?.nombre} />}

        {activeTab === 'analisis' && !sinStrava && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 16 }}>
            <SelectorPeriodo periodo={periodo} onChange={setPeriodo} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Los datos de Strava se reutilizan 5 min; esto fuerza una lectura nueva */}
              <button
                onClick={() => {
                  forzarDatosAtleta(id)
                  setRefrescos((v) => v + 1)
                }}
                disabled={cargandoAnalisis}
                aria-label="Actualizar datos de Strava"
                title="Actualizar datos de Strava"
                style={{ ...iconButtonStyle, opacity: cargandoAnalisis ? 0.5 : 1 }}
              >
                <Icon name="refresh" size={18} strokeWidth={2} />
              </button>
              <button onClick={() => setComparadorAbierto(true)} style={ghostButtonStyle}>
                Comparar semanas
              </button>
            </div>
          </div>
        )}

        {activeTab === 'sesiones' && coachId && (
          <PotenciaAjustes athleteId={id} uid={coachId} modo="plegable" esCoach fcMax={datos?.atleta?.fc_maxima} />
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

        {activeTab === 'analisis' && cargandoAnalisis && (
          <AnalisisCargando />
        )}
        {activeTab === 'analisis' && errorAnalisis && <p style={{ color: COLORS.error }}>{errorAnalisis}</p>}

        {activeTab === 'analisis' && !cargandoAnalisis && !errorAnalisis && !sinStrava && (
          <StravaAnalysis
            key={id}
            actividades={datosAnalisis?.actividades || []}
            semanas={datosAnalisis?.semanas || []}
            records={datosAnalisis?.records}
            periodo={periodo}
            athleteId={id}
            atleta={datos?.atleta}
            esCoach
            onFcMaxGuardada={() => setRefrescos((r) => r + 1)}
            buildCsvName={(filtro) => {
              const nombreAtleta = (datos?.atleta?.nombre || 'atleta').replace(/[^\p{L}\p{N}]+/gu, '_')
              return `${nombreAtleta}_${claveArchivo(periodo)}_${filtro}_${hoyMadrid()}.csv`
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
            onSaved={({ cerrar = true } = {}) => {
              // cerrar:false = aviso en el creador (reloj/nutrición): refrescar sin cerrar
              if (cerrar) {
                setModalAbierto(false)
                setActiveTab('sesiones')
              }
              setSesionesVersion((v) => v + 1)
            }}
          />
        )}
      </div>
    </div>
  )
}
