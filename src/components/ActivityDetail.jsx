import { useEffect, useState } from 'react'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS } from '../lib/theme'
import PolylineMap from './PolylineMap'

const COLOR_RAPIDO = [0, 229, 160] // #00E5A0
const COLOR_LENTO = [255, 77, 109] // #FF4D6D

// t=0 → más rápido (verde), t=1 → más lento (rojo)
function colorRitmo(t) {
  const rgb = COLOR_RAPIDO.map((c, i) => Math.round(c + (COLOR_LENTO[i] - c) * t))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

function formatTiempo(segundos) {
  if (segundos == null) return '—'
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  const s = Math.round(segundos % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDuracionMin(minutos) {
  if (minutos == null) return null
  const h = Math.floor(minutos / 60)
  const m = Math.round(minutos % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const thStyle = {
  textAlign: 'left',
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '8px 12px',
  fontSize: 13,
  color: COLORS.textPrimary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

const seccionTituloStyle = {
  color: COLORS.textSecondary,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 1,
  margin: '24px 0 8px',
  fontWeight: 600,
}

export default function ActivityDetail({ activityId, athleteId, coachId, onClose }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true

    async function cargarDetalle() {
      try {
        const res = await fetch('/.netlify/functions/coach-activity-detail', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-coach-secret': import.meta.env.VITE_COACH_SECRET || '',
          },
          body: JSON.stringify({ activityId, athleteId, coachId }),
        })
        const json = await res.json()
        if (!activo) return
        if (!res.ok) {
          setError(json?.error || 'No se pudo cargar el detalle de la actividad')
          return
        }
        setDatos(json)
      } catch {
        if (activo) setError('Error de conexión cargando el detalle')
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargarDetalle()
    return () => {
      activo = false
    }
  }, [activityId, athleteId, coachId])

  const act = datos?.actividad
  const vueltas = datos?.vueltas || []
  const splits = act?.splits_km || []

  const metricas = act
    ? [
        { etiqueta: 'Distancia', valor: act.distancia_km != null ? `${act.distancia_km} km` : null },
        { etiqueta: 'Duración', valor: formatDuracionMin(act.duracion_mov_min ?? act.duracion_min) },
        act.disciplina === 'run'
          ? { etiqueta: 'Ritmo', valor: act.ritmo_min_km ? `${act.ritmo_min_km} /km` : null }
          : act.disciplina === 'swim'
            ? { etiqueta: 'Ritmo', valor: act.ritmo_min_100m ? `${act.ritmo_min_100m} /100m` : null }
            : { etiqueta: 'Vel. media', valor: act.velocidad_media_kmh != null ? `${act.velocidad_media_kmh} km/h` : null },
        { etiqueta: 'FC media', valor: act.fc_media != null ? `${act.fc_media} ppm` : null },
        { etiqueta: 'FC máx', valor: act.fc_maxima_actividad != null ? `${act.fc_maxima_actividad} ppm` : null },
        { etiqueta: 'Potencia media', valor: act.potencia_media != null ? `${act.potencia_media} W` : null },
        { etiqueta: 'Potencia norm.', valor: act.potencia_normalizada != null ? `${act.potencia_normalizada} W` : null },
        { etiqueta: 'Cadencia', valor: act.cadencia_media != null ? `${act.cadencia_media}` : null },
        { etiqueta: 'Desnivel +', valor: act.desnivel_pos_m != null ? `${act.desnivel_pos_m} m` : null },
        { etiqueta: 'Desnivel −', valor: act.desnivel_neg_m != null ? `${act.desnivel_neg_m} m` : null },
        { etiqueta: 'Calorías', valor: act.calorias != null ? `${act.calorias} kcal` : null },
        { etiqueta: 'TSS', valor: act.tss_estimado != null ? `${act.tss_estimado}` : null },
      ].filter((m) => m.valor != null)
    : []

  // Rango de velocidades de splits para el gradiente de ritmo
  const velocidades = splits.map((s) => s.velocidad_ms).filter((v) => v != null && v > 0)
  const velMin = velocidades.length > 0 ? Math.min(...velocidades) : null
  const velMax = velocidades.length > 0 ? Math.max(...velocidades) : null

  function colorSplit(velocidadMs) {
    if (velocidadMs == null || velMin == null || velMax === velMin) return COLORS.textPrimary
    const t = (velMax - velocidadMs) / (velMax - velMin) // 0 = más rápido
    return colorRitmo(t)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          width: '90vw',
          height: '90vh',
          overflowY: 'auto',
          padding: 32,
          fontFamily: "'Inter', sans-serif",
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'transparent',
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            color: COLORS.textSecondary,
            width: 32,
            height: 32,
            fontSize: 16,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        {cargando && <p style={{ color: COLORS.textSecondary }}>Cargando detalle…</p>}
        {error && <p style={{ color: COLORS.error }}>{error}</p>}

        {!cargando && !error && act && (
          <>
            <header style={{ marginBottom: 20, paddingRight: 48 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: COLORS.textPrimary }}>
                  {act.nombre || 'Actividad'}
                </h2>
                <span
                  style={{
                    background: DISCIPLINE_COLORS[act.disciplina] || DISCIPLINE_COLORS.other,
                    color: '#FFFFFF',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {DISCIPLINE_LABELS[act.disciplina] || act.tipo}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
                {act.fecha}
              </p>
              {act.descripcion && (
                <p style={{ margin: '8px 0 0', fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' }}>
                  {act.descripcion}
                </p>
              )}
            </header>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                gap: 12,
              }}
            >
              {metricas.map((m) => (
                <div
                  key={m.etiqueta}
                  style={{
                    background: COLORS.background,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 8,
                    padding: 12,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: COLORS.textPrimary }}>
                    {m.valor}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: COLORS.textSecondary }}>
                    {m.etiqueta}
                  </p>
                </div>
              ))}
            </div>

            {act.polyline && (
              <>
                <p style={seccionTituloStyle}>Recorrido</p>
                <PolylineMap polyline={act.polyline} />
              </>
            )}

            {splits.length > 0 && (
              <>
                <p style={seccionTituloStyle}>Splits por km</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Km</th>
                        <th style={thStyle}>Tiempo</th>
                        <th style={thStyle}>Ritmo</th>
                        <th style={thStyle}>FC</th>
                        <th style={thStyle}>Desnivel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splits.map((s) => (
                        <tr key={s.km}>
                          <td style={tdStyle}>{s.km}</td>
                          <td style={tdStyle}>{formatTiempo(s.moving_time_s)}</td>
                          <td style={{ ...tdStyle, color: colorSplit(s.velocidad_ms), fontWeight: 600 }}>
                            {act.disciplina === 'swim'
                              ? s.ritmo_min_100m
                                ? `${s.ritmo_min_100m} /100m`
                                : '—'
                              : s.ritmo_min_km
                                ? `${s.ritmo_min_km} /km`
                                : '—'}
                          </td>
                          <td style={tdStyle}>{s.fc_media != null ? `${s.fc_media} ppm` : '—'}</td>
                          <td style={tdStyle}>{s.desnivel_m != null ? `${s.desnivel_m} m` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {vueltas.length > 1 && (
              <>
                <p style={seccionTituloStyle}>Vueltas</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Nombre</th>
                        <th style={thStyle}>Distancia</th>
                        <th style={thStyle}>Tiempo</th>
                        <th style={thStyle}>
                          {act.disciplina === 'run' || act.disciplina === 'swim' ? 'Ritmo' : 'Vel.'}
                        </th>
                        <th style={thStyle}>FC</th>
                        <th style={thStyle}>Potencia</th>
                        <th style={thStyle}>Cadencia</th>
                        <th style={thStyle}>Desnivel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vueltas.map((v) => (
                        <tr key={v.indice}>
                          <td style={tdStyle}>{v.indice}</td>
                          <td style={tdStyle}>{v.nombre}</td>
                          <td style={tdStyle}>{v.distancia_km != null ? `${v.distancia_km} km` : '—'}</td>
                          <td style={tdStyle}>{formatTiempo(v.moving_time_s)}</td>
                          <td style={tdStyle}>
                            {act.disciplina === 'run'
                              ? v.ritmo_min_km
                                ? `${v.ritmo_min_km} /km`
                                : '—'
                              : act.disciplina === 'swim'
                                ? v.ritmo_min_100m
                                  ? `${v.ritmo_min_100m} /100m`
                                  : '—'
                                : v.velocidad_media_kmh != null
                                  ? `${v.velocidad_media_kmh} km/h`
                                  : '—'}
                          </td>
                          <td style={tdStyle}>{v.fc_media != null ? `${v.fc_media} ppm` : '—'}</td>
                          <td style={tdStyle}>{v.potencia_media != null ? `${v.potencia_media} W` : '—'}</td>
                          <td style={tdStyle}>{v.cadencia_media != null ? v.cadencia_media : '—'}</td>
                          <td style={tdStyle}>{v.desnivel_m != null ? `${v.desnivel_m} m` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
