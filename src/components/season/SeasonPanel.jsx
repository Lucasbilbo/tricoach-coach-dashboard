import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, FONTS, cardStyle, ghostButtonStyle } from '../../lib/theme'
import Icon from '../ui/Icon'
import {
  COLOR_AVISO,
  DEPORTES,
  agruparPorMes,
  alertaInscripcion,
  etiquetaMes,
  filtrarEventos,
  formatFechaCorta,
  formatFechaEvento,
  hoyMadrid,
  inscripcionesPendientes,
  mesesTemporada,
  textoAlerta,
  textoAutoria,
} from '../../lib/season'
import { listarTemporada } from '../../lib/seasonApi'
import { useIsMobile } from '../../hooks/useIsMobile'
import EventEditor from './EventEditor'
import { Chip, EstadoPill, IconoAviso, PrioridadBadge, SportDot, SportRail } from './SeasonBits'

const FILTROS = [
  { clave: 'activas', label: 'Activas' },
  { clave: 'confirmada', label: 'Confirmadas' },
  { clave: 'inscrito', label: 'Inscrito' },
  { clave: 'candidata', label: 'Candidatas' },
  { clave: 'todas', label: 'Todas' },
]

// Avisar de cambios de otra persona durante 14 días.
const DIAS_AVISO_CAMBIO = 14

function SeasonStrip({ eventos, hoy }) {
  const meses = mesesTemporada(hoy)
  const porMes = {}
  for (const e of eventos) {
    if (!e.fecha || e.estado === 'descartada') continue
    const k = e.fecha.slice(0, 7)
    ;(porMes[k] = porMes[k] || []).push(e)
  }
  const mesActual = hoy.slice(0, 7)

  return (
    <div style={{ ...cardStyle, padding: '14px 12px 12px', marginBottom: 20, overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(40px, 1fr))', minWidth: 480 }}>
        {meses.map((m, i) => {
          const items = porMes[m.clave] || []
          const esActual = m.clave === mesActual
          const cambioAnio = i > 0 && m.corto === 'ene'
          return (
            <a
              key={m.clave}
              href={items.length ? `#mes-${m.clave}` : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                padding: '0 2px',
                borderLeft: cambioAnio ? `1px solid ${COLORS.cardBorder}` : '1px solid transparent',
                textDecoration: 'none',
                cursor: items.length ? 'pointer' : 'default',
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  textTransform: 'uppercase',
                  color: esActual ? COLORS.accent : COLORS.textSecondary,
                  fontWeight: esActual ? 700 : 400,
                }}
              >
                {m.corto}
                <span style={{ display: 'block', fontSize: 9, color: COLORS.textTertiary, textAlign: 'center', minHeight: 11 }}>
                  {i === 0 || cambioAnio ? String(m.anio).slice(2) : ''}
                </span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minHeight: 34 }}>
                {items.length === 0 && <span style={{ width: 4, height: 4, borderRadius: '50%', background: COLORS.cardBorder, marginTop: 4 }} />}
                {items.slice(0, 4).map((e) => (
                  <span key={e.id} title={`${e.nombre} · ${formatFechaEvento(e)}`} style={{ opacity: e.estado === 'candidata' ? 0.55 : 1, display: 'flex' }}>
                    <SportDot deporte={e.deporte} size={e.prioridad === 'A' ? 12 : 9} ring={e.prioridad === 'A'} />
                  </span>
                ))}
                {items.length > 4 && (
                  <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary }}>+{items.length - 4}</span>
                )}
              </span>
            </a>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${COLORS.cardBorder}`, fontSize: 11, color: COLORS.textTertiary }}>
        {['run', 'tri', 'bike', 'swim'].map((d) => (
          <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <SportDot deporte={d} size={7} /> {DEPORTES[d].label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SportDot deporte="other" size={9} ring /> Prioridad A
        </span>
        <span>Atenuado = candidata</span>
      </div>
    </div>
  )
}

function EventRow({ evento, hoy, onClick, isMobile }) {
  const alerta = alertaInscripcion(evento, hoy)
  const descartada = evento.estado === 'descartada'
  const detalles = [evento.distancia, evento.precio].filter(Boolean)
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        width: '100%',
        textAlign: 'left',
        alignItems: 'flex-start',
        gap: isMobile ? 10 : 14,
        background: 'none',
        border: 'none',
        borderTop: `1px solid ${COLORS.cardBorder}`,
        padding: '14px 4px',
        cursor: 'pointer',
        color: COLORS.textPrimary,
        fontFamily: FONTS.sans,
        opacity: descartada ? 0.45 : 1,
      }}
    >
      <span
        style={{
          fontFamily: FONTS.mono,
          fontSize: 13,
          color: evento.fecha_aprox ? COLORS.textTertiary : COLORS.textSecondary,
          width: isMobile ? 46 : 58,
          flexShrink: 0,
          paddingTop: 1,
        }}
      >
        {evento.fecha ? (evento.fecha_aprox ? `~${formatFechaCorta(evento.fecha).split(' ')[1]}` : formatFechaCorta(evento.fecha)) : '—'}
      </span>
      <SportRail deporte={evento.deporte} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 15,
            fontWeight: 600,
            textDecoration: descartada ? 'line-through' : 'none',
            overflowWrap: 'anywhere',
          }}
        >
          {evento.nombre}
        </span>
        {(detalles.length > 0 || evento.escenario) && (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 3, fontSize: 13, color: COLORS.textSecondary }}>
            {detalles.length > 0 && <span>{detalles.join(' · ')}</span>}
            {evento.escenario && (
              <span style={{ fontSize: 11, color: COLORS.load, border: `1px solid ${COLORS.load}55`, borderRadius: 4, padding: '1px 6px' }}>
                {evento.escenario}
              </span>
            )}
          </span>
        )}
        {alerta && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, fontWeight: 600, color: alerta.nivel === 'vencida' ? COLORS.error : COLOR_AVISO }}>
            <IconoAviso color={alerta.nivel === 'vencida' ? COLORS.error : COLOR_AVISO} />
            {textoAlerta(alerta)} · {formatFechaCorta(evento.inscripcion_antes)}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexDirection: isMobile ? 'column-reverse' : 'row', alignSelf: isMobile ? 'flex-start' : 'center' }}>
        <EstadoPill estado={evento.estado} />
        <PrioridadBadge prioridad={evento.prioridad} />
      </span>
    </button>
  )
}

// Temporada de UN atleta. La usan el propio atleta (/home) y el coach (/athlete/:id).
export default function SeasonPanel({ athleteId, atletaNombre, esCoach = false }) {
  const isMobile = useIsMobile()
  const hoy = hoyMadrid()
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('activas')
  const [escenario, setEscenario] = useState('')
  const [editando, setEditando] = useState(null) // null | {} (nuevo) | evento
  const [verHistorial, setVerHistorial] = useState(false)
  const [version, setVersion] = useState(0)
  const [ahora] = useState(() => Date.now())

  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let activo = true
    listarTemporada(athleteId)
      .then((json) => {
        if (!activo) return
        setDatos(json)
        setError('')
      })
      .catch((err) => activo && setError(err.message))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [athleteId, version])

  const eventos = useMemo(() => datos?.eventos || [], [datos])
  const escenarios = useMemo(
    () => [...new Set(eventos.map((e) => e.escenario).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [eventos]
  )
  const visibles = useMemo(() => {
    const base = filtrarEventos(eventos, filtro)
    // Un escenario muestra sus pruebas + las comunes (sin escenario).
    return escenario ? base.filter((e) => !e.escenario || e.escenario === escenario) : base
  }, [eventos, filtro, escenario])
  const grupos = useMemo(() => agruparPorMes(visibles), [visibles])
  const pendientes = useMemo(() => inscripcionesPendientes(eventos, hoy), [eventos, hoy])

  const cambios = datos?.cambios || []
  const ultimoAjeno = cambios.find((c) => c.actor_id !== datos?.viewerId)
  const avisoCambio =
    ultimoAjeno && cambios[0]?.id === ultimoAjeno.id &&
    ahora - new Date(ultimoAjeno.created_at).getTime() < DIAS_AVISO_CAMBIO * 86400000
      ? ultimoAjeno
      : null

  const nConfirmadas = eventos.filter((e) => ['confirmada', 'inscrito'].includes(e.estado)).length
  const nActivas = eventos.filter((e) => e.estado !== 'descartada').length

  if (cargando && !datos) return <p style={{ color: COLORS.textSecondary }}>Cargando temporada…</p>
  if (error && !datos) return <p style={{ color: COLORS.error }}>{error}</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: COLORS.textSecondary }}>
            <span style={{ fontFamily: FONTS.mono }}>{nActivas}</span> pruebas en juego ·{' '}
            <span style={{ fontFamily: FONTS.mono }}>{nConfirmadas}</span> confirmadas
            {esCoach ? '' : ' · tu entrenador también puede editarla'}
          </p>
        </div>
        <button onClick={() => setEditando({})} style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px' }}>
          <Icon name="plus" size={16} strokeWidth={2.2} />
          Añadir prueba
        </button>
      </div>

      {avisoCambio && (
        <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 16, borderLeft: `3px solid ${COLORS.accent}` }}>
          <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 }}>
            Último cambio · {textoAutoria(avisoCambio.actor_id, datos.actores, datos.viewerId, avisoCambio.created_at)}
          </div>
          <div style={{ fontSize: 14 }}>{avisoCambio.resumen}</div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div style={{ ...cardStyle, padding: '12px 16px', marginBottom: 16, borderColor: `${COLOR_AVISO}55` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>
            Inscripciones por cerrar
          </div>
          {pendientes.map(({ evento, alerta }) => (
            <button
              key={evento.id}
              type="button"
              onClick={() => setEditando(evento)}
              style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'center', background: 'none', border: 'none', padding: '5px 0', color: COLORS.textPrimary, cursor: 'pointer', fontFamily: FONTS.sans, fontSize: 14, textAlign: 'left' }}
            >
              <SportDot deporte={evento.deporte} size={8} />
              <span style={{ flex: 1, minWidth: 0 }}>{evento.nombre}</span>
              <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: alerta.nivel === 'vencida' ? COLORS.error : COLOR_AVISO, whiteSpace: 'nowrap' }}>
                {alerta.nivel === 'vencida' ? 'pasado' : alerta.dias === 0 ? 'hoy' : `${alerta.dias} d`}
              </span>
            </button>
          ))}
        </div>
      )}

      <SeasonStrip eventos={eventos} hoy={hoy} />

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: escenarios.length ? 8 : 4, scrollbarWidth: 'none' }}>
        {FILTROS.map((f) => (
          <Chip key={f.clave} activo={filtro === f.clave} onClick={() => setFiltro(f.clave)}>
            {f.label}
          </Chip>
        ))}
      </div>
      {escenarios.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 4, marginBottom: 4, scrollbarWidth: 'none' }}>
          <span style={{ fontSize: 12, color: COLORS.textTertiary, marginRight: 2, whiteSpace: 'nowrap' }}>Escenario</span>
          <Chip activo={!escenario} onClick={() => setEscenario('')}>Todos</Chip>
          {escenarios.map((e) => (
            <Chip key={e} activo={escenario === e} onClick={() => setEscenario(e)} title="Muestra estas pruebas más las comunes">
              {e}
            </Chip>
          ))}
        </div>
      )}

      {eventos.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: 36, marginTop: 12 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Aún no hay pruebas en la temporada</p>
          <p style={{ margin: 0, color: COLORS.textSecondary, fontSize: 14 }}>
            Añade las carreras que tengas en mente, aunque no estén decididas: márcalas como candidatas.
          </p>
        </div>
      )}
      {eventos.length > 0 && visibles.length === 0 && (
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginTop: 16 }}>No hay pruebas con este filtro.</p>
      )}

      {grupos.map((g) => (
        <section key={g.clave} id={`mes-${g.clave}`} style={{ marginTop: 20, scrollMarginTop: 16 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>
            {etiquetaMes(g.clave)}
          </h2>
          {g.items.map((e) => (
            <EventRow key={e.id} evento={e} hoy={hoy} isMobile={isMobile} onClick={() => setEditando(e)} />
          ))}
        </section>
      ))}

      {cambios.length > 0 && (
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${COLORS.cardBorder}` }}>
          <button
            type="button"
            onClick={() => setVerHistorial((v) => !v)}
            aria-expanded={verHistorial}
            style={{ background: 'none', border: 'none', color: COLORS.textSecondary, cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600, fontFamily: FONTS.sans }}
          >
            {verHistorial ? '▾' : '▸'} Historial de cambios ({cambios.length})
          </button>
          {verHistorial && (
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {cambios.map((c) => (
                <li key={c.id} style={{ padding: '8px 0', borderTop: `1px solid ${COLORS.cardBorder}`, fontSize: 13 }}>
                  <div style={{ color: COLORS.textPrimary }}>{c.resumen}</div>
                  <div style={{ color: COLORS.textTertiary, fontSize: 12, marginTop: 2 }}>
                    {textoAutoria(c.actor_id, datos.actores, datos.viewerId, c.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editando && (
        <EventEditor
          key={editando.id || 'nuevo'}
          athleteId={athleteId}
          atletaNombre={atletaNombre}
          evento={editando.id ? editando : null}
          escenarios={escenarios}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null)
            recargar()
          }}
        />
      )}
    </div>
  )
}
