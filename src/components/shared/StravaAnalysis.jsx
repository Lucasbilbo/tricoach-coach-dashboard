import { useEffect, useRef, useState } from 'react'
import { decimalToRitmo, formatDiaMes, hoyMadrid } from '../../lib/chartUtils'
import { authHeaders } from '../../lib/authHeaders'
import { useIsMobile } from '../../hooks/useIsMobile'
import { COLORS, FONTS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, cardStyle } from '../../lib/theme'
import { FILTROS_DISCIPLINA, descargarCsv } from '../../lib/activityFormat'
import {
  computeResumenStats,
  computeZonas,
  computePaceTrend,
  buildTransitionColumns,
} from '../../lib/athleteStats'
import { computeCargaHoy } from '../../lib/carga'

// Semanas de histórico para CALENTAR la EWMA de ATL/CTL. La carga se calcula
// SIEMPRE sobre esta ventana (independiente del selector, que solo recorta lo
// que se dibuja), para que el valor de hoy no cambie con 4/8/12/24 semanas.
const SEMANAS_CARGA = 26
import TransitionLine from './TransitionLine'
import PRsBlock from '../PRsBlock'
import ChartCard from '../charts/ChartCard'
import PowerChart from '../charts/PowerChart'
import TSSChart from '../charts/TSSChart'
import ActivityDetail from '../ActivityDetail'

// Ritmo o potencia según disciplina, para la columna RITMO / POTENCIA del spec.
function formatEffort(act) {
  if (act.disciplina === 'run') {
    return act.ritmo_min_km != null ? `${decimalToRitmo(act.ritmo_min_km)}/km` : '—'
  }
  if (act.disciplina === 'bike') {
    if (act.potencia_media != null) return `${act.potencia_media}W`
    if (act.distancia_km && act.duracion_min) return `${(act.distancia_km / (act.duracion_min / 60)).toFixed(1)} km/h`
    return '—'
  }
  if (act.disciplina === 'swim') {
    if (!act.distancia_km || !act.duracion_min) return '—'
    return `${decimalToRitmo(act.duracion_min / act.distancia_km / 10)}/100m`
  }
  return '—'
}

// TSS con marca "~" cuando es estimado sin FC (B2).
function tssTexto(act) {
  if (act.tss_estimado == null) return '—'
  return act.tss_estimado_sin_fc ? `~${act.tss_estimado}` : `${act.tss_estimado}`
}

const seccionLabel = {
  fontSize: 13,
  color: COLORS.textSecondary,
  letterSpacing: '0.03em',
  marginBottom: 16,
}

const TABLA_COLS = '100px 1.6fr 1fr 1fr 0.8fr 0.7fr 1fr'

// Bloque de análisis Strava compartido por AthleteView (coach) y AthleteHome
// (atleta), con la dirección visual del handoff (paleta por disciplina, mono
// para números, Línea de Transición). Datos ya resueltos; el padre decide el
// nombre del CSV (buildCsvName) e inyecta acciones extra (accionesFiltro).
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
  // Serie de 26 semanas SOLO para calentar la carga (ATL/CTL/TSB). Cacheada por
  // atleta. Si aún no llegó o falla, se usa `actividades` (comportamiento previo).
  const [actividadesCarga, setActividadesCarga] = useState(null)
  const cargaRef = useRef(null)
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!athleteId || cargaRef.current === athleteId) return
    let activo = true
    async function cargarSerie() {
      try {
        const res = await fetch('/.netlify/functions/coach-athlete-data', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ athleteId, weeks: SEMANAS_CARGA }),
        })
        if (!res.ok) return
        const json = await res.json().catch(() => null)
        if (activo && json?.actividades) {
          cargaRef.current = athleteId
          setActividadesCarga(json.actividades)
        }
      } catch {
        /* silencioso: cae en `actividades` del rango del selector */
      }
    }
    cargarSerie()
    return () => { activo = false }
  }, [athleteId])

  const actsCarga = actividadesCarga || actividades

  const actividadesFiltradas =
    filtroDisciplina === 'todos'
      ? actividades
      : actividades.filter((a) => a.disciplina === filtroDisciplina)

  const stats = computeResumenStats(actividades)
  // CTL/ATL/TSB de hoy sobre la serie de 26 semanas (no sobre el rango dibujado).
  const carga = computeCargaHoy(actsCarga, hoyMadrid())
  const zonas = computeZonas(actividades)
  const paceTrend = computePaceTrend(actividades)
  const columnas = buildTransitionColumns(actividades, semanas)

  const hayPotencia =
    actividades.filter((a) => a.disciplina === 'bike' && a.potencia_media != null).length >= 3

  const statCards = [
    { label: 'Volumen', valor: stats.volumen, color: COLORS.textPrimary, nota: `últimas ${weeks} semanas` },
    { label: 'Ritmo running (últ.)', valor: stats.ritmoUltima, color: DISCIPLINE_COLORS.run, nota: 'min/km' },
    { label: 'TSS acumulado', valor: `${stats.tssAcum}`, color: COLORS.load, nota: `últimas ${weeks} semanas` },
    { label: 'CTL / ATL', valor: `${carga.ctl ?? '—'} / ${carga.atl ?? '—'}`, color: COLORS.textPrimary, nota: 'carga crónica / aguda' },
    { label: 'TSB', valor: carga.tsb != null ? (carga.tsb > 0 ? `+${carga.tsb}` : `${carga.tsb}`) : '—', color: COLORS.textPrimary, nota: 'forma actual' },
  ]

  function exportarCSV() {
    descargarCsv(actividadesFiltradas, buildCsvName(filtroDisciplina), decimalToRitmo, DISCIPLINE_LABELS)
  }

  return (
    <>
      {/* Fila de stats — desktop: 5 en fila; móvil: 2×2 con los 4 principales */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 14 : 24,
        }}
      >
        {(isMobile ? statCards.slice(0, 4) : statCards).map((s) => (
          <div
            key={s.label}
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: isMobile ? 10 : 12,
              padding: isMobile ? 14 : '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: isMobile ? 4 : 6,
            }}
          >
            <span style={{ fontSize: isMobile ? 10.5 : 12, color: COLORS.textSecondary, letterSpacing: '0.03em' }}>{s.label}</span>
            <span style={{ fontFamily: FONTS.mono, fontSize: isMobile ? 19 : 26, fontWeight: 600, color: s.color }}>{s.valor}</span>
            {!isMobile && <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{s.nota}</span>}
          </div>
        ))}
      </div>

      {/* Línea de Transición (volumen semanal segmentado por disciplina) */}
      {columnas.length > 0 && (
        <div style={{ marginBottom: isMobile ? 14 : 24 }}>
          <TransitionLine
            columns={columnas}
            titulo={isMobile ? 'LÍNEA DE TRANSICIÓN' : 'LÍNEA DE TRANSICIÓN — volumen y disciplina por semana'}
            barsHeight={isMobile ? 110 : 180}
            gap={isMobile ? 6 : 14}
            maxBarWidth={isMobile ? null : 52}
            barRadius={isMobile ? 4 : 6}
            showLegend={!isMobile}
            showStatusLabel={!isMobile}
            dowFontSize={isMobile ? 10 : 11}
          />
        </div>
      )}

      <PRsBlock records={records} weeks={weeks} />

      {/* Fila de 2 gráficos: zonas FC + progresión ritmo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        {zonas.length > 0 && (
          <div style={cardStyle}>
            <div style={seccionLabel}>DISTRIBUCIÓN DE ZONAS FC</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 8 : 10 }}>
              {zonas.map((z) => (
                <div key={z.label} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
                  <span style={{ width: isMobile ? 22 : 26, fontSize: isMobile ? 11 : 12, color: COLORS.textSecondary, fontFamily: FONTS.mono }}>{z.label}</span>
                  <div style={{ flex: 1, background: COLORS.background, borderRadius: 4, height: isMobile ? 12 : 16, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${z.pct}%`, background: z.color, borderRadius: 4, transition: 'width 180ms ease' }} />
                  </div>
                  <span style={{ width: isMobile ? 42 : 52, textAlign: 'right', fontFamily: FONTS.mono, fontSize: isMobile ? 11 : 13, color: COLORS.textPrimary }}>
                    {z.minutesLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {paceTrend.length > 0 && (
          <div style={cardStyle}>
            <div style={seccionLabel}>PROGRESIÓN RITMO RUNNING — últimas {paceTrend.length} semanas</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${paceTrend.length}, 1fr)`,
                gap: 10,
                alignItems: 'end',
                height: 120,
              }}
            >
              {paceTrend.map((p, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 6 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textSecondary }}>{p.pace}</span>
                  <div style={{ width: '100%', maxWidth: 28, height: `${p.heightPct}%`, background: DISCIPLINE_COLORS.run, borderRadius: '4px 4px 0 0', opacity: p.opacity, transition: 'height 180ms ease' }} />
                  <span style={{ fontSize: 10, color: COLORS.textTertiary }}>{p.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {hayPotencia && (
        <ChartCard title="Progresión potencia ciclismo">
          <PowerChart actividades={actividades} />
        </ChartCard>
      )}

      {semanas.length > 0 && (
        <ChartCard title="Carga semanal (TSS · ATL · CTL)">
          <TSSChart actividades={actividades} actividadesCarga={actsCarga} semanas={semanas} />
        </ChartCard>
      )}

      {/* Filtros + CSV */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTROS_DISCIPLINA.map((filtro) => {
          const activo = filtroDisciplina === filtro.clave
          return (
            <button
              key={filtro.clave}
              onClick={() => setFiltroDisciplina(filtro.clave)}
              style={{
                background: activo ? 'rgba(47,191,175,0.12)' : 'transparent',
                color: activo ? COLORS.textPrimary : COLORS.textSecondary,
                border: `1px solid ${activo ? COLORS.accent : COLORS.cardBorder}`,
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: FONTS.sans,
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
            fontFamily: FONTS.sans,
          }}
        >
          Exportar CSV
        </button>
      </div>

      {/* Sesiones — desktop: tabla de 7 columnas; móvil: lista de cards */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {actividadesFiltradas.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', color: COLORS.textSecondary, fontSize: 13 }}>
              {filtroDisciplina === 'todos'
                ? 'Sin actividades en este rango'
                : 'Sin actividades de esta disciplina en este rango'}
            </div>
          )}
          {actividadesFiltradas.map((act, i) => {
            const color = DISCIPLINE_COLORS[act.disciplina] || COLORS.textSecondary
            return (
              <div
                key={act.id || `${act.fecha}-${i}`}
                onClick={() => act.id && setSelectedActivityId(act.id)}
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.cardBorder}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  cursor: act.id ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textSecondary }}>
                    {act.fecha ? formatDiaMes(act.fecha) : '—'}
                  </span>
                  <span style={{ fontSize: 11, color, border: `1px solid ${color}`, borderRadius: 20, padding: '2px 9px', fontFamily: FONTS.sans }}>
                    {DISCIPLINE_LABELS[act.disciplina] || 'Sesión'}
                  </span>
                </div>
                <span style={{ fontSize: 14, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {act.nombre_actividad || DISCIPLINE_LABELS[act.disciplina] || '—'}
                </span>
                <div style={{ display: 'flex', gap: 16 }}>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.textPrimary }}>
                    {act.distancia_km != null ? `${act.distancia_km} km` : '—'}
                  </span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.textPrimary }}>{formatEffort(act)}</span>
                  <span
                    title={act.tss_estimado_sin_fc ? 'TSS estimado (sin FC)' : undefined}
                    style={{ fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.load }}
                  >
                    TSS {tssTexto(act)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ ...cardStyle, padding: '8px 0' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: TABLA_COLS,
              gap: 10,
              padding: '12px 24px',
              fontSize: 11,
              color: COLORS.textTertiary,
              letterSpacing: '0.04em',
            }}
          >
            <span>FECHA</span><span>SESIÓN</span><span>DISTANCIA</span><span>RITMO / POTENCIA</span><span>FC MEDIA</span><span>TSS</span><span>ESTADO</span>
          </div>

          {actividadesFiltradas.length === 0 && (
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${COLORS.cardBorder}`, color: COLORS.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {filtroDisciplina === 'todos'
                ? 'Sin actividades en este rango'
                : 'Sin actividades de esta disciplina en este rango'}
            </div>
          )}

          {actividadesFiltradas.map((act, i) => {
            const color = DISCIPLINE_COLORS[act.disciplina] || COLORS.textSecondary
            return (
              <div
                key={act.id || `${act.fecha}-${i}`}
                onClick={() => act.id && setSelectedActivityId(act.id)}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: TABLA_COLS,
                  gap: 10,
                  padding: '14px 24px',
                  alignItems: 'center',
                  borderTop: `1px solid ${COLORS.cardBorder}`,
                  cursor: act.id ? 'pointer' : 'default',
                }}
              >
                <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textSecondary }}>
                  {act.fecha ? formatDiaMes(act.fecha) : '—'}
                </span>
                <span style={{ fontSize: 14, color: COLORS.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {act.nombre_actividad || DISCIPLINE_LABELS[act.disciplina] || '—'}
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textPrimary }}>
                  {act.distancia_km != null ? `${act.distancia_km} km` : '—'}
                </span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textPrimary }}>{formatEffort(act)}</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textSecondary }}>
                  {act.fc_media != null ? `${act.fc_media}` : '—'}
                </span>
                <span
                  title={act.tss_estimado_sin_fc ? 'TSS estimado (sin FC)' : undefined}
                  style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.load }}
                >
                  {tssTexto(act)}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color,
                    border: `1px solid ${color}`,
                    borderRadius: 20,
                    padding: '3px 10px',
                    textAlign: 'center',
                    width: 'fit-content',
                    fontFamily: FONTS.sans,
                  }}
                >
                  {DISCIPLINE_LABELS[act.disciplina] || 'Sesión'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {actividadesFiltradas.some((a) => a.tss_estimado_sin_fc) && (
        <p style={{ margin: '8px 2px 0', fontSize: 11, color: COLORS.textTertiary, fontFamily: FONTS.sans }}>
          ~ TSS estimado por duración y disciplina (actividad sin frecuencia cardiaca).
        </p>
      )}

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
