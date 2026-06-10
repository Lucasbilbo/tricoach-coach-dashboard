import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS, inputStyle, buttonStyle } from '../lib/theme'

const DISCIPLINA_OPCIONES = [
  { value: 'swim', label: 'Natación' },
  { value: 'bike', label: 'Ciclismo' },
  { value: 'run', label: 'Running' },
  { value: 'strength', label: 'Fuerza' },
  { value: 'other', label: 'Otro' },
]

const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']

// Hoy en Europe/Madrid como YYYY-MM-DD
function hoyMadrid() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  color: COLORS.textSecondary,
  marginBottom: 6,
}

const campoStyle = { marginBottom: 16 }

export default function PrescribeModal({ athleteId, coachId, onClose, onSaved, sessionToEdit }) {
  const [fecha, setFecha] = useState(sessionToEdit?.fecha || hoyMadrid())
  const [disciplina, setDisciplina] = useState(sessionToEdit?.disciplina || 'swim')
  const [descripcion, setDescripcion] = useState(sessionToEdit?.descripcion || '')
  const [duracion, setDuracion] = useState(
    sessionToEdit?.duracion_min != null ? String(sessionToEdit.duracion_min) : ''
  )
  const [zona, setZona] = useState(sessionToEdit?.intensidad || '')
  const [notas, setNotas] = useState(sessionToEdit?.notas || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function handleGuardar(e) {
    e.preventDefault()
    setError('')

    if (!fecha) {
      setError('La fecha es obligatoria')
      return
    }
    if (!descripcion.trim()) {
      setError('La descripción es obligatoria')
      return
    }
    const duracionMin = duracion === '' ? null : parseInt(duracion, 10)
    if (duracionMin != null && (Number.isNaN(duracionMin) || duracionMin <= 0)) {
      setError('La duración debe ser un número de minutos positivo')
      return
    }

    setGuardando(true)
    try {
      const registro = {
        coach_id: coachId,
        athlete_id: athleteId,
        fecha,
        disciplina,
        descripcion: descripcion.trim(),
        duracion_min: duracionMin,
        intensidad: zona || null,
        notas: notas.trim() || null,
      }

      const { error: dbError } = sessionToEdit
        ? await supabase.from('coach_sessions').upsert({ ...registro, id: sessionToEdit.id })
        : await supabase.from('coach_sessions').insert(registro)

      if (dbError) {
        setError('No se pudo guardar la sesión. Inténtalo de nuevo.')
        return
      }

      onSaved()
    } catch {
      setError('Error de conexión guardando la sesión')
    } finally {
      setGuardando(false)
    }
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
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleGuardar}
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          width: 480,
          maxWidth: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 32,
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 700, color: COLORS.textPrimary }}>
          {sessionToEdit ? 'Editar sesión' : 'Prescribir sesión'}
        </h2>

        <div style={campoStyle}>
          <label style={labelStyle}>Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={campoStyle}>
          <label style={labelStyle}>Disciplina</label>
          <select
            value={disciplina}
            onChange={(e) => setDisciplina(e.target.value)}
            style={inputStyle}
          >
            {DISCIPLINA_OPCIONES.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        <div style={campoStyle}>
          <label style={labelStyle}>Descripción</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            required
            placeholder="Describe la sesión..."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={campoStyle}>
          <label style={labelStyle}>Duración estimada</label>
          <input
            type="number"
            min="1"
            value={duracion}
            onChange={(e) => setDuracion(e.target.value)}
            placeholder="minutos"
            style={inputStyle}
          />
        </div>

        <div style={campoStyle}>
          <label style={labelStyle}>Zona objetivo</label>
          <select value={zona} onChange={(e) => setZona(e.target.value)} style={inputStyle}>
            <option value="">Sin zona</option>
            {ZONAS.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>

        <div style={{ ...campoStyle, marginBottom: 24 }}>
          <label style={labelStyle}>Notas internas</label>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            placeholder="Notas solo visibles para ti"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...buttonStyle,
              background: 'transparent',
              color: COLORS.textSecondary,
              border: `1px solid ${COLORS.cardBorder}`,
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            style={{ ...buttonStyle, opacity: guardando ? 0.6 : 1 }}
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>

        {error && (
          <p style={{ color: COLORS.error, fontSize: 13, marginTop: 16, marginBottom: 0 }}>
            {error}
          </p>
        )}
      </form>
    </div>
  )
}
