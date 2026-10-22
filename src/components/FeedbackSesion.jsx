// Feedback del atleta tras una sesión: editor (atleta) y vista (coach).
// Datos en sesion_feedback (migración 015). Lógica pura en lib/feedback.js.
import { useState } from 'react'
import { COLORS, FONTS, RADIUS, buttonStyle, ghostButtonStyle, inputStyle } from '../lib/theme'
import {
  LIMITE_COMENTARIO, LIMITE_MOLESTIAS, SENSACIONES, etiquetaRpe, etiquetaSensacion, normalizarFeedback,
} from '../lib/feedback'
import { borrarFeedback, guardarFeedback } from '../lib/feedbackApi'
import Icon from './ui/Icon'

const etiqueta = { fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }

function chip(sel, color = COLORS.textPrimary) {
  return {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderRadius: RADIUS.sm,
    border: `1px solid ${sel ? color : COLORS.cardBorder}`,
    background: sel ? 'rgba(237,238,242,0.08)' : 'transparent',
    color: sel ? color : COLORS.textSecondary,
    fontSize: 13,
    fontWeight: sel ? 600 : 500,
    cursor: 'pointer',
    padding: 0,
  }
}

// ── Editor del atleta ────────────────────────────────────────────────────
export function FeedbackEditor({ sesion, athleteId, inicial, onCambio }) {
  const [form, setForm] = useState(() => ({
    rpe: inicial?.rpe ?? null,
    sensacion: inicial?.sensacion ?? null,
    comentario: inicial?.comentario ?? '',
    molestias: !!inicial?.molestias,
    molestias_texto: inicial?.molestias_texto ?? '',
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [sucio, setSucio] = useState(false)

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }))
    setSucio(true)
    setError('')
  }
  const fila = normalizarFeedback(form)

  async function guardar() {
    if (!fila) return
    setGuardando(true)
    setError('')
    try {
      const guardado = await guardarFeedback(sesion.id, athleteId, fila)
      setSucio(false)
      onCambio?.(sesion.id, guardado)
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    setGuardando(true)
    setError('')
    try {
      await borrarFeedback(sesion.id)
      setForm({ rpe: null, sensacion: null, comentario: '', molestias: false, molestias_texto: '' })
      setSucio(false)
      onCambio?.(sesion.id, null)
    } catch {
      setError('No se pudo borrar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={etiqueta}>
          Esfuerzo percibido
          {form.rpe ? <span style={{ color: COLORS.load, fontWeight: 600 }}> · {etiquetaRpe(form.rpe)}</span> : null}
        </p>
        <div role="radiogroup" aria-label="Esfuerzo percibido de 1 a 10" style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={form.rpe === n}
              aria-label={`${n} — ${etiquetaRpe(n)}`}
              onClick={() => cambiar('rpe', form.rpe === n ? null : n)}
              style={{ ...chip(form.rpe === n, COLORS.load), fontFamily: FONTS.mono }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p style={etiqueta}>Sensaciones</p>
        <div role="radiogroup" aria-label="Sensaciones" style={{ display: 'flex', gap: 4 }}>
          {SENSACIONES.map((s) => (
            <button
              key={s.value}
              role="radio"
              aria-checked={form.sensacion === s.value}
              onClick={() => cambiar('sensacion', form.sensacion === s.value ? null : s.value)}
              style={chip(form.sensacion === s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', minHeight: 32 }}>
          <input
            type="checkbox"
            checked={form.molestias}
            onChange={(e) => cambiar('molestias', e.target.checked)}
            style={{ width: 18, height: 18, accentColor: COLORS.error, margin: 0 }}
          />
          Tuve molestias o dolor
        </label>
        {form.molestias && (
          <input
            value={form.molestias_texto}
            onChange={(e) => cambiar('molestias_texto', e.target.value)}
            maxLength={LIMITE_MOLESTIAS}
            placeholder="¿Dónde? Ej.: gemelo derecho al final"
            aria-label="Dónde tuviste molestias"
            style={{ ...inputStyle, marginTop: 6 }}
          />
        )}
      </div>

      <div>
        <p style={etiqueta}>Comentario para tu entrenador</p>
        <textarea
          value={form.comentario}
          onChange={(e) => cambiar('comentario', e.target.value)}
          maxLength={LIMITE_COMENTARIO}
          rows={2}
          placeholder="Opcional"
          aria-label="Comentario para tu entrenador"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56, lineHeight: 1.4 }}
        />
      </div>

      {error && <p style={{ color: COLORS.error, fontSize: 13, margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={guardar}
          disabled={!fila || !sucio || guardando}
          style={{ ...buttonStyle, padding: '8px 16px', opacity: !fila || !sucio || guardando ? 0.5 : 1, cursor: !fila || !sucio ? 'default' : 'pointer' }}
        >
          {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Enviar a tu entrenador'}
        </button>
        {!sucio && inicial && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: COLORS.accent }}>
            <Icon name="check" size={14} strokeWidth={2.2} />
            Enviado
          </span>
        )}
        {inicial && (
          <button onClick={borrar} disabled={guardando} style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13, color: COLORS.textSecondary, marginLeft: 'auto' }}>
            Borrar
          </button>
        )}
      </div>
    </div>
  )
}

// ── Vista del coach ───────────────────────────────────────────────────────
// Línea compacta para la tarjeta: esfuerzo, sensaciones y aviso de molestias.
export function FeedbackLinea({ feedback, nombre }) {
  if (!feedback) return null
  const sens = etiquetaSensacion(feedback.sensacion)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13 }}>
      {feedback.rpe ? (
        <span title={`Esfuerzo percibido de ${nombre || 'el atleta'}: ${etiquetaRpe(feedback.rpe)}`} style={{ color: COLORS.load, fontWeight: 600 }}>
          RPE <span style={{ fontFamily: FONTS.mono }}>{feedback.rpe}</span>
        </span>
      ) : null}
      {sens && <span style={{ color: COLORS.textPrimary }}>{sens}</span>}
      {feedback.molestias && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: COLORS.error, fontWeight: 600 }}>
          <Icon name="alert" size={14} strokeWidth={2.2} />
          Molestias
        </span>
      )}
    </span>
  )
}

// Texto del atleta (comentario y dónde le duele), si lo hay.
export function FeedbackTexto({ feedback }) {
  if (!feedback || (!feedback.comentario && !feedback.molestias_texto)) return null
  return (
    <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: RADIUS.sm, background: 'rgba(237,238,242,0.04)', fontSize: 14, lineHeight: 1.45 }}>
      {feedback.molestias && feedback.molestias_texto && (
        <p style={{ margin: 0, color: COLORS.error }}>Molestias: {feedback.molestias_texto}</p>
      )}
      {feedback.comentario && (
        <p style={{ margin: feedback.molestias_texto ? '4px 0 0' : 0, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          “{feedback.comentario}”
        </p>
      )}
    </div>
  )
}
