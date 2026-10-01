import { useEffect, useState } from 'react'
import { COLORS, FONTS, buttonStyle, inputStyle } from '../../lib/theme'
import { DEPORTES, ESTADOS, ORDEN_ESTADOS, eventoAFormulario, eventoVacio } from '../../lib/season'
import { guardarEvento, borrarEvento } from '../../lib/seasonApi'
import { Chip, SportDot } from './SeasonBits'

const sectionLabel = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.textPrimary,
  marginBottom: 8,
}

function Campo({ label, children, flex }) {
  return (
    <div style={{ marginBottom: 16, flex, minWidth: 0 }}>
      <label style={sectionLabel}>{label}</label>
      {children}
    </div>
  )
}

// Drawer lateral para crear/editar una prueba (mismo patrón que WorkoutBuilder).
export default function EventEditor({ athleteId, atletaNombre, evento, escenarios, onClose, onSaved }) {
  const esNuevo = !evento?.id
  const [form, setForm] = useState(() => (evento ? eventoAFormulario(evento) : eventoVacio()))
  const [guardando, setGuardando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (campo) => (e) => {
    const valor = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  async function guardar(e) {
    e.preventDefault()
    if (!form.nombre.trim()) {
      setError('Ponle nombre a la prueba')
      return
    }
    setGuardando(true)
    setError('')
    try {
      await guardarEvento(athleteId, form, evento?.id)
      onSaved()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    setError('')
    try {
      await borrarEvento(athleteId, evento.id)
      onSaved()
    } catch (err) {
      setError(err.message)
      setGuardando(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }} />
      <form
        onSubmit={guardar}
        role="dialog"
        aria-label={esNuevo ? 'Añadir prueba' : 'Editar prueba'}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100dvh',
          width: 480,
          maxWidth: '100vw',
          background: COLORS.card,
          borderLeft: `1px solid ${COLORS.cardBorder}`,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: FONTS.sans,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px 16px',
            borderBottom: `1px solid ${COLORS.cardBorder}`,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
              {esNuevo ? 'Añadir prueba' : 'Editar prueba'}
            </h2>
            {atletaNombre && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.textSecondary }}>Temporada de {atletaNombre}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{ background: 'none', border: 'none', color: COLORS.textSecondary, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <Campo label="Prueba">
            <input
              value={form.nombre}
              onChange={set('nombre')}
              placeholder="Getxo olímpico, Behobia, Bibe…"
              maxLength={120}
              autoFocus={esNuevo}
              style={inputStyle}
            />
          </Campo>

          <Campo label="Deporte">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(DEPORTES).map(([clave, d]) => (
                <Chip key={clave} activo={form.deporte === clave} onClick={() => set('deporte')(clave)}>
                  <SportDot deporte={clave} size={8} />
                  {d.label}
                </Chip>
              ))}
            </div>
          </Campo>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Campo label="Fecha" flex="1 1 160px">
              <input type="date" value={form.fecha} onChange={set('fecha')} style={{ ...inputStyle, fontFamily: FONTS.mono, colorScheme: 'dark' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: COLORS.textSecondary, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.fecha_aprox} onChange={set('fecha_aprox')} style={{ accentColor: COLORS.accent }} />
                Aproximada (aún sin publicar)
              </label>
            </Campo>
            <Campo label="Distancia" flex="1 1 160px">
              <input value={form.distancia} onChange={set('distancia')} placeholder="10 km, olímpico, 125 km…" maxLength={80} style={inputStyle} />
            </Campo>
          </div>

          <Campo label="Estado">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ORDEN_ESTADOS.map((clave) => (
                <Chip key={clave} activo={form.estado === clave} onClick={() => set('estado')(clave)}>
                  {ESTADOS[clave].label}
                </Chip>
              ))}
            </div>
          </Campo>

          <Campo label="Prioridad">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { v: '', l: 'Sin prioridad' },
                { v: 'A', l: 'A · objetivo' },
                { v: 'B', l: 'B · importante' },
                { v: 'C', l: 'C · rodaje' },
              ].map((p) => (
                <Chip key={p.v || 'none'} activo={form.prioridad === p.v} onClick={() => set('prioridad')(p.v)}>
                  {p.l}
                </Chip>
              ))}
            </div>
          </Campo>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Campo label="Inscribirse antes de" flex="1 1 160px">
              <input
                type="date"
                value={form.inscripcion_antes}
                onChange={set('inscripcion_antes')}
                style={{ ...inputStyle, fontFamily: FONTS.mono, colorScheme: 'dark' }}
              />
            </Campo>
            <Campo label="Precio" flex="1 1 160px">
              <input value={form.precio} onChange={set('precio')} placeholder="29–35 €" maxLength={60} style={inputStyle} />
            </Campo>
          </div>

          <Campo label="Escenario (opcional)">
            <input
              value={form.escenario}
              onChange={set('escenario')}
              placeholder="Media, Olímpico…"
              maxLength={40}
              list="season-escenarios"
              style={inputStyle}
            />
            <datalist id="season-escenarios">
              {escenarios.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: COLORS.textTertiary }}>
              Agrupa pruebas de un plan alternativo para compararlos con un filtro.
            </p>
          </Campo>

          <Campo label="Enlace">
            <input value={form.url} onChange={set('url')} placeholder="https://…" maxLength={500} inputMode="url" style={inputStyle} />
          </Campo>

          <Campo label="Notas">
            <textarea
              value={form.notas}
              onChange={set('notas')}
              rows={3}
              maxLength={1000}
              placeholder="Recorrido, logística, qué decidir…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Campo>

          {error && <p style={{ color: COLORS.error, fontSize: 13, margin: '0 0 8px' }}>{error}</p>}
        </div>

        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${COLORS.cardBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            {!esNuevo && !confirmarBorrado && (
              <button
                type="button"
                onClick={() => setConfirmarBorrado(true)}
                disabled={guardando}
                style={{ background: 'none', border: 'none', color: COLORS.error, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: FONTS.sans }}
              >
                Borrar prueba
              </button>
            )}
            {confirmarBorrado && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ color: COLORS.textSecondary }}>¿Seguro?</span>
                <button
                  type="button"
                  onClick={borrar}
                  disabled={guardando}
                  style={{ background: 'none', border: 'none', color: COLORS.error, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: FONTS.sans, fontSize: 13 }}
                >
                  Sí, borrar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(false)}
                  style={{ background: 'none', border: 'none', color: COLORS.textSecondary, cursor: 'pointer', padding: 0, fontFamily: FONTS.sans, fontSize: 13 }}
                >
                  No
                </button>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ ...buttonStyle, background: 'transparent', color: COLORS.textSecondary, border: `1px solid ${COLORS.cardBorder}` }}
            >
              Cancelar
            </button>
            <button type="submit" disabled={guardando} style={{ ...buttonStyle, opacity: guardando ? 0.6 : 1 }}>
              {guardando ? 'Guardando…' : esNuevo ? 'Añadir' : 'Guardar'}
            </button>
          </div>
        </div>
      </form>
    </>
  )
}
