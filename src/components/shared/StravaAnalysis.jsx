import { useState } from 'react'
import { decimalToRitmo, formatDiaMes } from '../../lib/chartUtils'
import {
  COLORS,
  DISCIPLINE_COLORS,
  DISCIPLINE_LABELS,
  cardStyle,
} from '../../lib/theme'
import {
  FILTROS_DISCIPLINA,
  formatRitmoActividad,
  formatDuracion,
  thStyle,
  tdStyle,
  descargarCsv,
} from '../../lib/activityFormat'
import PRsBlock from '../PRsBlock'
import ChartCard from '../charts/ChartCard'
import VolumeChart from '../charts/VolumeChart'
import ZonesChart from '../charts/ZonesChart'
import PaceChart from '../charts/PaceChart'
import PowerChart from '../charts/PowerChart'
import TSSChart from '../charts/TSSChart'
import ActivityDetail from '../ActivityDetail'

// Bloque de análisis Strava compartido por AthleteView (coach) y AthleteHome
// (atleta): métricas resumen, PRs, los 5 charts, filtros + tabla + export CSV,
// y el modal de detalle de actividad. Los datos ya vienen resueltos; el padre
// decide el nombre del CSV (buildCsvName) y puede inyectar acciones extra en la
// fila de filtros (accionesFiltro, p.ej. el botón "Comparar semanas").
export default function StravaAnalysis({
  actividades = [],
  semanas = [],
  records,
  weeks,
  athleteId,
  buildCsvName,
  accionesFiltro = null,
}) {
  const [filtroDisciplina, setFiltroDisciplina] = useState('todos')
  const [selectedActivityId, setSelectedActivityId] = useState(null)

  const actividadesFiltradas =
    filtroDisciplina === 'todos'
      ? actividades
      : actividades.filter((a) => a.disciplina === filtroDisciplina)

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

  function exportarCSV() {
    descargarCsv(actividadesFiltradas, buildCsvName(filtroDisciplina), decimalToRitmo, DISCIPLINE_LABELS)
  }

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        {metricas.map((m) => (
          <div key={m.etiqueta} style={cardStyle}>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: m.color }}>{m.valor}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
              {m.etiqueta} · últimas {weeks} semanas
            </p>
          </div>
        ))}
      </div>

      <PRsBlock records={records} weeks={weeks} />

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

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTROS_DISCIPLINA.map((filtro) => {
          const activo = filtroDisciplina === filtro.clave
          return (
            <button
              key={filtro.clave}
              onClick={() => setFiltroDisciplina(filtro.clave)}
              style={{
                background: activo ? 'rgba(0,212,255,0.1)' : 'transparent',
                color: activo ? COLORS.textPrimary : COLORS.textSecondary,
                border: `1px solid ${activo ? COLORS.accent : COLORS.cardBorder}`,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {filtro.etiqueta}
            </button>
          )
        })}
        {accionesFiltro}
        <button
          onClick={exportarCSV}
          disabled={actividadesFiltradas.length === 0}
          style={{
            marginLeft: 'auto',
            background: 'transparent',
            color: COLORS.accent,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            cursor: actividadesFiltradas.length === 0 ? 'default' : 'pointer',
            opacity: actividadesFiltradas.length === 0 ? 0.4 : 1,
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Exportar CSV
        </button>
      </div>

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
            {actividadesFiltradas.length === 0 && (
              <tr>
                <td colSpan={11} style={{ ...tdStyle, color: COLORS.textSecondary, textAlign: 'center' }}>
                  {filtroDisciplina === 'todos'
                    ? 'Sin actividades en este rango'
                    : 'Sin actividades de esta disciplina en este rango'}
                </td>
              </tr>
            )}
            {actividadesFiltradas.map((act, i) => (
              <tr
                key={act.id || `${act.fecha}-${i}`}
                onClick={() => act.id && setSelectedActivityId(act.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
                style={{ cursor: act.id ? 'pointer' : 'default' }}
              >
                <td style={tdStyle}>{act.fecha ? formatDiaMes(act.fecha) : '—'}</td>
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
                <td style={tdStyle}>{formatRitmoActividad(act)}</td>
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

      {selectedActivityId && athleteId && (
        <ActivityDetail
          activityId={selectedActivityId}
          athleteId={athleteId}
          onClose={() => setSelectedActivityId(null)}
        />
      )}
    </>
  )
}
