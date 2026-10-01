import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS, FONTS, cardStyle } from '../../lib/theme'
import {
  COLOR_AVISO,
  formatFechaEvento,
  hoyMadrid,
  inscripcionesPendientes,
  proximasPruebas,
  textoAutoria,
} from '../../lib/season'
import { resumenTemporadas } from '../../lib/seasonApi'
import { EstadoPill, IconoAviso, PrioridadBadge, SportDot } from './SeasonBits'

const tituloBloque = {
  margin: '0 0 10px',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: COLORS.textSecondary,
}

const filaBoton = {
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  gap: 10,
  background: 'none',
  border: 'none',
  borderTop: `1px solid ${COLORS.cardBorder}`,
  padding: '10px 0',
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
    resumenTemporadas()
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
      <div style={{ borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 28, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Temporadas</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
          Próximas pruebas e inscripciones de tus atletas
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div style={cardStyle}>
          <h3 style={tituloBloque}>Próximas pruebas</h3>
          {proximas.length === 0 && (
            <p style={{ margin: 0, fontSize: 14, color: COLORS.textSecondary }}>
              Ningún atleta tiene pruebas futuras todavía.
            </p>
          )}
          {proximas.map((e) => (
            <button key={e.id} type="button" onClick={() => abrir(e.athlete_id)} style={filaBoton}>
              <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textSecondary, width: 82, flexShrink: 0 }}>
                {formatFechaEvento(e)}
              </span>
              <SportDot deporte={e.deporte} size={9} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.nombre}
                </span>
                <span style={{ display: 'block', fontSize: 12, color: COLORS.textSecondary }}>{nombres[e.athlete_id] || 'Atleta'}</span>
              </span>
              <PrioridadBadge prioridad={e.prioridad} />
              <EstadoPill estado={e.estado} />
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={cardStyle}>
            <h3 style={{ ...tituloBloque, color: pendientes.length ? COLOR_AVISO : COLORS.textSecondary }}>Inscripciones por cerrar</h3>
            {pendientes.length === 0 && (
              <p style={{ margin: 0, fontSize: 14, color: COLORS.textSecondary }}>Nada urgente en los próximos 30 días.</p>
            )}
            {pendientes.map(({ evento, alerta }) => {
              const color = alerta.nivel === 'vencida' ? COLORS.error : COLOR_AVISO
              return (
                <button key={evento.id} type="button" onClick={() => abrir(evento.athlete_id)} style={filaBoton}>
                  <IconoAviso color={color} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                    {evento.nombre}
                    <span style={{ color: COLORS.textSecondary }}> · {nombres[evento.athlete_id] || 'Atleta'}</span>
                  </span>
                  <span style={{ fontFamily: FONTS.mono, fontSize: 12, color, whiteSpace: 'nowrap' }}>
                    {alerta.nivel === 'vencida' ? 'pasado' : alerta.dias === 0 ? 'hoy' : `${alerta.dias} d`}
                  </span>
                </button>
              )
            })}
          </div>

          {cambios.length > 0 && (
            <div style={cardStyle}>
              <h3 style={tituloBloque}>Últimos cambios</h3>
              {cambios.map((c) => (
                <button key={c.id} type="button" onClick={() => abrir(c.athlete_id)} style={{ ...filaBoton, display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 13 }}>{c.resumen}</span>
                  <span style={{ display: 'block', fontSize: 12, color: COLORS.textTertiary, marginTop: 2 }}>
                    {textoAutoria(c.actor_id, datos.actores, datos.viewerId, c.created_at)} · temporada de {nombres[c.athlete_id] || 'atleta'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
