import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS, FONTS, cardStyle, sectionTitleStyle } from '../../lib/theme'
import {
  COLOR_AVISO,
  formatFechaEvento,
  hoyMadrid,
  inscripcionesPendientes,
  proximasPruebas,
  textoAutoria,
} from '../../lib/season'
import { resumenTemporadasCache } from '../../lib/panelData'
import { CuentaAtras, EstadoPill, IconoAviso, PrioridadBadge } from './SeasonBits'

const tituloBloque = {
  margin: '0 0 8px',
  fontSize: 16,
  fontWeight: 700,
  color: COLORS.textPrimary,
}

const filaBoton = {
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  gap: 10,
  background: 'none',
  border: 'none',
  borderTop: `1px solid ${COLORS.cardBorder}`,
  padding: '12px 0',
  minHeight: 48,
  color: COLORS.textPrimary,
  cursor: 'pointer',
  fontFamily: FONTS.sans,
  textAlign: 'left',
}

// Resumen de las temporadas de todos los atletas del coach (panel principal).
export default function SeasonOverview() {
  const navigate = useNavigate()
  const hoy = hoyMadrid()
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let activo = true
    resumenTemporadasCache()
      .then((json) => activo && setDatos(json))
      .catch((err) => activo && setError(err.message))
    return () => {
      activo = false
    }
  }, [])

  const nombres = useMemo(() => Object.fromEntries((datos?.atletas || []).map((a) => [a.id, a.nombre])), [datos])
  const eventos = useMemo(() => datos?.eventos || [], [datos])
  const proximas = useMemo(() => proximasPruebas(eventos, hoy, 8), [eventos, hoy])
  const pendientes = useMemo(() => inscripcionesPendientes(eventos, hoy), [eventos, hoy])
  const cambios = (datos?.cambios || []).slice(0, 5)

  const abrir = (athleteId) => navigate(`/athlete/${athleteId}?tab=temporada`)

  if (error) return null // el resumen es secundario: no rompe el panel
  if (!datos) return null

  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={sectionTitleStyle}>Próximas pruebas</h2>

      {/* Inscripciones que cierran: aviso arriba, lo único urgente aquí */}
      {pendientes.map(({ evento, alerta }) => {
        const color = alerta.nivel === 'vencida' ? COLORS.error : COLOR_AVISO
        const cuando = alerta.nivel === 'vencida' ? 'ya ha cerrado' : alerta.dias === 0 ? 'cierra hoy' : alerta.dias === 1 ? 'cierra mañana' : `cierra en ${alerta.dias} días`
        return (
          <button
            key={evento.id}
            type="button"
            onClick={() => abrir(evento.athlete_id)}
            style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, marginBottom: 8, padding: '14px 16px', minHeight: 52, border: 'none', borderRadius: 16, background: alerta.nivel === 'vencida' ? 'rgba(232,93,93,0.12)' : 'rgba(232,184,74,0.11)', color: COLORS.textPrimary, fontFamily: FONTS.sans, textAlign: 'left', cursor: 'pointer' }}
          >
            <IconoAviso color={color} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: alerta.nivel === 'vencida' ? '#F2A3A3' : '#F1D79A' }}>
              La inscripción a {evento.nombre} ({nombres[evento.athlete_id] || 'atleta'}) {cuando}
            </span>
          </button>
        )
      })}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
        <div style={{ ...cardStyle, padding: '6px 18px' }}>
          {proximas.length === 0 && (
            <p style={{ margin: '12px 0', fontSize: 15, color: COLORS.textSecondary }}>
              Ningún atleta tiene pruebas futuras todavía.
            </p>
          )}
          {proximas.map((e, i) => (
            <button key={e.id} type="button" onClick={() => abrir(e.athlete_id)} style={{ ...filaBoton, gap: 14, borderTop: i === 0 ? 'none' : filaBoton.borderTop }}>
              <CuentaAtras evento={e} hoy={hoy} destacada={e.prioridad === 'A'} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 650, lineHeight: 1.25 }}>{e.nombre}</span>
                <span style={{ display: 'block', fontSize: 14, color: COLORS.textSecondary, marginTop: 3 }}>
                  {nombres[e.athlete_id] || 'Atleta'} · {formatFechaEvento(e)}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <PrioridadBadge prioridad={e.prioridad} />
                <EstadoPill estado={e.estado} />
              </span>
            </button>
          ))}
        </div>

        {cambios.length > 0 && (
            <div style={{ ...cardStyle, alignSelf: 'start' }}>
              <h3 style={tituloBloque}>Últimos cambios</h3>
              {cambios.map((c) => (
                <button key={c.id} type="button" onClick={() => abrir(c.athlete_id)} style={{ ...filaBoton, display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 15 }}>{c.resumen}</span>
                  <span style={{ display: 'block', fontSize: 13, color: COLORS.textTertiary, marginTop: 3 }}>
                    {textoAutoria(c.actor_id, datos.actores, datos.viewerId, c.created_at)} · temporada de {nombres[c.athlete_id] || 'atleta'}
                  </span>
                </button>
              ))}
            </div>
        )}
      </div>
    </section>
  )
}
