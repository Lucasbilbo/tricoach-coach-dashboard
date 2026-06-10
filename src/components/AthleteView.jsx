import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  COLORS,
  DISCIPLINE_COLORS,
  DISCIPLINE_LABELS,
  cardStyle,
  pageStyle,
  buttonStyle,
} from '../lib/theme'
import PrescribeModal from './PrescribeModal'
import SessionsList from './SessionsList'
import ChartCard from './charts/ChartCard'
import VolumeChart from './charts/VolumeChart'
import ZonesChart from './charts/ZonesChart'
import PaceChart from './charts/PaceChart'
import PowerChart from './charts/PowerChart'
import TSSChart from './charts/TSSChart'

const RANGOS_SEMANAS = [4, 8, 12, 24]

function formatRitmo(ritmoMinKm) {
  if (ritmoMinKm == null) return '—'
  const min = Math.floor(ritmoMinKm)
  const seg = Math.round((ritmoMinKm - min) * 60)
  return `${min}:${String(seg).padStart(2, '0')} /km`
}

function formatDuracion(duracionMin) {
  if (duracionMin == null) return '—'
  const h = Math.floor(duracionMin / 60)
  const m = Math.round(duracionMin % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px 12px',
  fontSize: 13,
  color: COLORS.textPrimary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

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

        const res = await fetch('/.netlify/functions/coach-athlete-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-coach-secret': import.meta.env.VITE_COACH_SECRET || '',
          },
          body: JSON.stringify({ athleteId: id, coachId: usuarioId, weeks }),
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

  const hayRuns = actividades.some((a) => a.disciplina === 'run')
  const hayZonas = actividades.some((a) => a.zona_fc && a.duracion_min)
  const hayPotencia =
    actividades.filter((a) => a.disciplina === 'bike' && a.potencia_media != null).length >= 3

  const resumen = actividades.reduce(
    (acc, act) => ({
      kmRun: acc.kmRun + (act.disciplina === 'run' ? act.distancia_km || 0 : 0),
      kmBike: acc.kmBike + (act.disciplina === 'bike' ? act.distancia_km || 0 : 0),
      kmSwim: acc.kmSwim + (act.disciplina === 'swim' ? act.distancia_km || 0 : 0),
      sesiones: acc.sesiones + 1,
    }),
    { kmRun: 0, kmBike: 0, kmSwim: 0, sesiones: 0 }
  )

  const metricas = [
    { etiqueta: 'Km carrera', valor: resumen.kmRun.toFixed(1), color: DISCIPLINE_COLORS.run },
    { etiqueta: 'Km bici', valor: resumen.kmBike.toFixed(1), color: DISCIPLINE_COLORS.bike },
    { etiqueta: 'Km natación', valor: resumen.kmSwim.toFixed(2), color: DISCIPLINE_COLORS.swim },
    { etiqueta: 'Sesiones', valor: resumen.sesiones, color: COLORS.accent },
  ]

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.textSecondary,
                cursor: 'pointer',
                fontSize: 13,
                padding: 0,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              ← Volver al panel
            </button>
            <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700 }}>
              {datos?.atleta?.nombre || 'Atleta'}
            </h1>
          </div>

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
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {rango} sem
              </button>
            ))}
            <button
              onClick={() => setModalAbierto(true)}
              style={{ ...buttonStyle, marginLeft: 8 }}
            >
              Prescribir sesión
            </button>
          </div>
        </header>

        <nav
          style={{
            display: 'flex',
            gap: 4,
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            marginBottom: 24,
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
                fontFamily: "'Inter', sans-serif",
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
            actividades={actividades}
            onNewSession={() => setSesionesVersion((v) => v + 1)}
          />
        )}

        {activeTab === 'analisis' && cargando && (
          <p style={{ color: COLORS.textSecondary }}>Cargando datos del atleta…</p>
        )}
        {activeTab === 'analisis' && error && <p style={{ color: COLORS.error }}>{error}</p>}

        {activeTab === 'analisis' && !cargando && !error && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
                marginBottom: 24,
              }}
            >
              {metricas.map((m) => (
                <div key={m.etiqueta} style={cardStyle}>
                  <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: m.color }}>
                    {m.valor}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
                    {m.etiqueta} · últimas {weeks} semanas
                  </p>
                </div>
              ))}
            </div>

            {semanas.length > 0 && (
              <ChartCard title="Volumen semanal">
                <VolumeChart semanas={semanas} actividades={actividades} />
              </ChartCard>
            )}

            {hayZonas && (
              <ChartCard title="Distribución zonas FC">
                <ZonesChart actividades={actividades} />
              </ChartCard>
            )}

            {hayRuns && (
              <ChartCard title="Progresión ritmo running">
                <PaceChart actividades={actividades} />
              </ChartCard>
            )}

            {hayPotencia && (
              <ChartCard title="Progresión potencia ciclismo">
                <PowerChart actividades={actividades} />
              </ChartCard>
            )}

            {semanas.length > 0 && (
              <ChartCard title="Carga semanal (TSS)">
                <TSSChart actividades={actividades} semanas={semanas} />
              </ChartCard>
            )}

            <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Fecha</th>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Nombre</th>
                    <th style={thStyle}>Distancia</th>
                    <th style={thStyle}>Duración</th>
                    <th style={thStyle}>Ritmo</th>
                    <th style={thStyle}>FC media</th>
                    <th style={thStyle}>Zona</th>
                    <th style={thStyle}>Potencia</th>
                    <th style={thStyle}>Desnivel</th>
                    <th style={thStyle}>TSS</th>
                  </tr>
                </thead>
                <tbody>
                  {actividades.length === 0 && (
                    <tr>
                      <td colSpan={11} style={{ ...tdStyle, color: COLORS.textSecondary, textAlign: 'center' }}>
                        Sin actividades en este rango
                      </td>
                    </tr>
                  )}
                  {actividades.map((act, i) => (
                    <tr key={`${act.fecha}-${i}`}>
                      <td style={tdStyle}>{act.fecha || '—'}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            color: DISCIPLINE_COLORS[act.disciplina] || COLORS.textSecondary,
                            fontWeight: 600,
                            fontSize: 12,
                          }}
                        >
                          {DISCIPLINE_LABELS[act.disciplina] || act.tipo || '—'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {act.nombre_actividad || '—'}
                      </td>
                      <td style={tdStyle}>{act.distancia_km != null ? `${act.distancia_km} km` : '—'}</td>
                      <td style={tdStyle}>{formatDuracion(act.duracion_min)}</td>
                      <td style={tdStyle}>{formatRitmo(act.ritmo_min_km)}</td>
                      <td style={tdStyle}>{act.fc_media != null ? `${act.fc_media} ppm` : '—'}</td>
                      <td style={tdStyle}>{act.zona_fc || '—'}</td>
                      <td style={tdStyle}>{act.potencia_media != null ? `${act.potencia_media} W` : '—'}</td>
                      <td style={tdStyle}>{act.desnivel_m != null ? `${act.desnivel_m} m` : '—'}</td>
                      <td style={tdStyle}>{act.tss_estimado != null ? act.tss_estimado : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {modalAbierto && coachId && (
          <PrescribeModal
            athleteId={id}
            coachId={coachId}
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
