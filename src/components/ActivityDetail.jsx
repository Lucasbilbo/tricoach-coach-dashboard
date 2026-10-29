import { useEffect, useState } from 'react'
import Icon from './ui/Icon'
import { authHeaders } from '../lib/authHeaders'
import { COLORS, DISCIPLINE_LABELS, FONTS, railStyle } from '../lib/theme'
import { formatDiaMes } from '../lib/chartUtils'
import { useIsMobile } from '../hooks/useIsMobile'
import PolylineMap from './PolylineMap'

// Ritmo de cada split: del más rápido (Ink, #EDEEF2) al más lento (Mist
// oscuro, #7A808F). Antes iba de teal a coral, que son natación y carrera.
const COLOR_RAPIDO = [237, 238, 242]
const COLOR_LENTO = [122, 128, 143]

// t=0 → más rápido, t=1 → más lento
function colorRitmo(t) {
  const rgb = COLOR_RAPIDO.map((c, i) => Math.round(c + (COLOR_LENTO[i] - c) * t))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

// '2026-10-29' → '29 Oct 2026'
function fechaLarga(fecha) {
  if (!fecha) return ''
  return `${formatDiaMes(fecha)} ${fecha.slice(0, 4)}`
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

// Vueltas de natación cortas en metros; el resto en km
function formatDistanciaVuelta(vuelta, disciplina) {
  if (disciplina === 'swim') {
    const metros = vuelta.distancia_m ?? (vuelta.distancia_km != null ? Math.round(vuelta.distancia_km * 1000) : null)
    if (metros == null) return '—'
    if (metros < 1000) return `${metros} m`
  }
  return vuelta.distancia_km != null ? `${vuelta.distancia_km} km` : '—'
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
  fontFamily: FONTS.mono, // números (la columna Nombre lo sobrescribe)
}

const seccionTituloStyle = {
  color: COLORS.textPrimary,
  fontSize: 14,
  margin: '24px 0 8px',
  fontWeight: 600,
}

export default function ActivityDetail({ activityId, athleteId, onClose }) {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const isMobile = useIsMobile()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let activo = true

    async function cargarDetalle() {
      try {
        // La identidad (coach o el propio atleta) va en el JWT; el backend
        // verifica el acceso a athleteId contra coach_athletes
        const res = await fetch('/.netlify/functions/coach-activity-detail', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ activityId, athleteId }),
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
  }, [activityId, athleteId])

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

  // Columnas de vueltas que no tienen ningún dato (p. ej. potencia sin
  // potenciómetro) no se pintan: una columna entera de "—" no dice nada.
  const hayEnVueltas = (campo) => vueltas.some((v) => v[campo] != null)
  const colFc = hayEnVueltas('fc_media')
  const colPotencia = hayEnVueltas('potencia_media')
  const colCadencia = hayEnVueltas('cadencia_media')
  const colDesnivel = hayEnVueltas('desnivel_m')

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
        padding: isMobile ? 0 : 16,
      }}
    >
      {/* En móvil, pantalla completa (antes una caja al 90 % con 32 px de
          margen interior que dejaba media pantalla para el contenido). */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={act?.nombre || 'Detalle de la actividad'}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.card,
          border: isMobile ? 'none' : `1px solid ${COLORS.cardBorder}`,
          borderRadius: isMobile ? 0 : 12,
          width: isMobile ? '100%' : 'min(1000px, 92vw)',
          height: isMobile ? '100%' : '90vh',
          overflowY: 'auto',
          padding: isMobile ? '20px 16px 32px' : 32,
          fontFamily: FONTS.sans,
          position: 'relative',
          boxSizing: 'border-box',
        }}
      >
        <button
          aria-label="Cerrar"
          title="Cerrar"
          onClick={onClose}
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
          <Icon name="close" size={16} style={{ margin: '0 auto' }} />
        </button>

        {cargando && <p style={{ color: COLORS.textSecondary }}>Cargando detalle…</p>}
        {error && <p style={{ color: COLORS.error }}>{error}</p>}

        {!cargando && !error && act && (
          <>
            <header style={{ marginBottom: 20, paddingRight: 48, paddingLeft: 14, ...railStyle(act.disciplina) }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? 18 : 20, fontWeight: 700, color: COLORS.textPrimary, lineHeight: 1.25 }}>
                {act.nombre || 'Actividad'}
              </h2>
              {/* Deporte en texto + filo de color (sin pastilla rellena) */}
              <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
                {DISCIPLINE_LABELS[act.disciplina] || act.tipo}
                {act.fecha && <> · <span style={{ fontFamily: FONTS.mono }}>{fechaLarga(act.fecha)}</span></>}
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
                // En móvil 3 por fila: antes salía una tarjeta por fila (11 de alto)
                gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: isMobile ? 8 : 12,
              }}
            >
              {metricas.map((m) => (
                <div
                  key={m.etiqueta}
                  style={{
                    background: COLORS.background,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 8,
                    padding: isMobile ? '10px 10px' : 12,
                    minWidth: 0,
                  }}
                >
                  <p style={{ margin: 0, fontSize: isMobile ? 14 : 17, fontWeight: 600, color: COLORS.textPrimary, fontFamily: FONTS.mono, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                        {colFc && <th style={thStyle}>FC</th>}
                        {colPotencia && <th style={thStyle}>Potencia</th>}
                        {colCadencia && <th style={thStyle}>Cadencia</th>}
                        {colDesnivel && <th style={thStyle}>Desnivel</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {vueltas.map((v) => (
                        <tr key={v.indice}>
                          <td style={tdStyle}>{v.indice}</td>
                          <td style={{ ...tdStyle, fontFamily: FONTS.sans }}>{v.nombre}</td>
                          <td style={tdStyle}>{formatDistanciaVuelta(v, act.disciplina)}</td>
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
                          {colFc && <td style={tdStyle}>{v.fc_media != null ? `${v.fc_media} ppm` : '—'}</td>}
                          {colPotencia && <td style={tdStyle}>{v.potencia_media != null ? `${v.potencia_media} W` : '—'}</td>}
                          {colCadencia && <td style={tdStyle}>{v.cadencia_media != null ? v.cadencia_media : '—'}</td>}
                          {colDesnivel && <td style={tdStyle}>{v.desnivel_m != null ? `${v.desnivel_m} m` : '—'}</td>}
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
