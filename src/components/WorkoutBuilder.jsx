import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS, inputStyle } from '../lib/theme'
import { buildIntervalsText } from '../lib/intervalsText'

// ── Constantes ───────────────────────────────────────────────────────────────

const DISCIPLINAS = [
  { value: 'swim', label: 'Natación' },
  { value: 'bike', label: 'Ciclismo' },
  { value: 'run', label: 'Running' },
  { value: 'strength', label: 'Fuerza' },
]

const MATERIAL_SWIM = ['palas', 'pull buoy', 'tubo', 'aletas', 'palas cortas', 'chapas']

const UNIDADES = {
  swim: ['mtr', 'km', 'min', 's'],
  bike: ['km', 'min', 'h'],
  run: ['km', 'mtr', 'min', 'h', 's'],
  strength: ['min', 's'],
  other: ['min', 's'],
}

const OBJETIVOS = {
  swim: [
    { value: '', label: 'Sin objetivo' },
    { value: 'ritmo', label: 'Ritmo /100m' },
    { value: 'fc', label: 'FC %' },
  ],
  bike: [
    { value: '', label: 'Sin objetivo' },
    { value: 'potencia', label: 'Potencia %' },
    { value: 'fc', label: 'FC %' },
    { value: 'zona', label: 'Zona' },
  ],
  run: [
    { value: '', label: 'Sin objetivo' },
    { value: 'ritmo', label: 'Ritmo /km' },
    { value: 'fc', label: 'FC %' },
    { value: 'zona', label: 'Zona' },
  ],
  strength: [],
  other: [],
}

const OBJETIVO_PLACEHOLDER = {
  swim: { ritmo: '1:30', fc: '70' },
  bike: { potencia: '80', fc: '75', zona: 'Z2' },
  run: { ritmo: '5:30', fc: '75', zona: 'Z2' },
}

function defaultUnidad(disciplina) {
  return disciplina === 'bike' ? 'km' : 'mtr'
}

function initForm(sesion) {
  if (!sesion) {
    return { fecha: '', disciplina: 'swim', nombre: '', material: [], bloques: [], notas: '' }
  }
  const ws = sesion.workout_steps
  // Compat: workout_steps puede ser el array plano (formato antiguo) o {bloques, material, notas}
  const bloques = Array.isArray(ws) ? ws : (ws?.bloques || [])
  const material = ws?.material || sesion.material || []
  const notas = ws?.notas ?? sesion.notas ?? ''
  return {
    fecha: sesion.fecha || '',
    disciplina: sesion.disciplina || 'swim',
    nombre: sesion.descripcion || '',
    material,
    bloques,
    notas,
  }
}

// buildIntervalsText importado desde src/lib/intervalsText.js

// ── Sub-componentes de bloque ─────────────────────────────────────────────────

function BloqueSimple({ bloque, idx, disciplina, total, onUpdate, onRemove, onMove }) {
  const unidades = UNIDADES[disciplina] || UNIDADES.other
  const objetivos = OBJETIVOS[disciplina] || []

  const titulo = bloque.tipo === 'warmup' ? '🌊 Calentamiento'
    : bloque.tipo === 'cooldown' ? '🌊 Vuelta calma'
    : '▸ Paso libre'

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent }}>{titulo}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onMove(idx, -1)} disabled={idx === 0} style={miniBtn}>↑</button>
          <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1} style={miniBtn}>↓</button>
          <button onClick={() => onRemove(idx)} style={{ ...miniBtn, color: COLORS.error }}>🗑</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <label style={labelSm}>Cantidad</label>
          <input
            type="number"
            min="1"
            value={bloque.cantidad || ''}
            onChange={(e) => onUpdate(idx, { cantidad: Number(e.target.value) })}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <div>
          <label style={labelSm}>Unidad</label>
          <select
            value={bloque.unidad || unidades[0]}
            onChange={(e) => onUpdate(idx, { unidad: e.target.value })}
            style={{ ...inputStyle, width: 80 }}
          >
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {objetivos.length > 0 && (
          <>
            <div>
              <label style={labelSm}>Objetivo</label>
              <select
                value={bloque.objetivo_tipo || ''}
                onChange={(e) => onUpdate(idx, { objetivo_tipo: e.target.value || null, objetivo_valor: null })}
                style={{ ...inputStyle, width: 110 }}
              >
                {objetivos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {bloque.objetivo_tipo && (
              <div>
                <label style={labelSm}>Valor</label>
                <input
                  type="text"
                  value={bloque.objetivo_valor || ''}
                  onChange={(e) => onUpdate(idx, { objetivo_valor: e.target.value })}
                  placeholder={OBJETIVO_PLACEHOLDER[disciplina]?.[bloque.objetivo_tipo] || ''}
                  style={{ ...inputStyle, width: 80 }}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={labelSm}>Nombre / cue (opcional)</label>
        <input
          type="text"
          value={bloque.nombre || ''}
          onChange={(e) => onUpdate(idx, { nombre: e.target.value })}
          placeholder="ej: Progresivo"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>
    </div>
  )
}

function PasoRepeat({ paso, pasoIdx, repeatIdx, disciplina, totalPasos, onUpdatePaso, onRemovePaso }) {
  const unidades = UNIDADES[disciplina] || UNIDADES.other
  const objetivos = OBJETIVOS[disciplina] || []

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        marginBottom: 6,
        paddingLeft: 12,
        borderLeft: `2px solid rgba(255,255,255,0.1)`,
      }}
    >
      <span style={{ fontSize: 11, color: COLORS.textSecondary, minWidth: 14 }}>
        {pasoIdx === 0 ? '├' : pasoIdx === totalPasos - 1 ? '└' : '├'}
      </span>
      <div>
        <input
          type="number"
          min="1"
          value={paso.cantidad || ''}
          onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { cantidad: Number(e.target.value) })}
          style={{ ...inputStyle, width: 70 }}
        />
      </div>
      <div>
        <select
          value={paso.unidad || unidades[0]}
          onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { unidad: e.target.value })}
          style={{ ...inputStyle, width: 70 }}
        >
          {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>
      {objetivos.length > 0 && (
        <>
          <select
            value={paso.objetivo_tipo || ''}
            onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { objetivo_tipo: e.target.value || null, objetivo_valor: null })}
            style={{ ...inputStyle, width: 100 }}
          >
            {objetivos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {paso.objetivo_tipo && (
            <input
              type="text"
              value={paso.objetivo_valor || ''}
              onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { objetivo_valor: e.target.value })}
              placeholder={OBJETIVO_PLACEHOLDER[disciplina]?.[paso.objetivo_tipo] || ''}
              style={{ ...inputStyle, width: 70 }}
            />
          )}
        </>
      )}
      <input
        type="text"
        value={paso.nombre || ''}
        onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { nombre: e.target.value || null })}
        placeholder="etiqueta"
        style={{ ...inputStyle, width: 80 }}
      />
      <button onClick={() => onRemovePaso(repeatIdx, pasoIdx)} style={{ ...miniBtn, color: COLORS.error }}>🗑</button>
    </div>
  )
}

function BloqueRepeat({ bloque, idx, disciplina, total, onUpdate, onRemove, onMove, onUpdatePaso, onRemovePaso, onAddPaso }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#7C3AED' }}>🔁 Serie</span>
          <input
            type="text"
            value={bloque.nombre || ''}
            onChange={(e) => onUpdate(idx, { nombre: e.target.value })}
            placeholder="Serie principal"
            style={{ ...inputStyle, width: 160, fontSize: 12 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ ...labelSm, marginBottom: 0 }}>Reps</label>
            <input
              type="number"
              min="1"
              value={bloque.repeticiones || 4}
              onChange={(e) => onUpdate(idx, { repeticiones: Number(e.target.value) })}
              style={{ ...inputStyle, width: 60, fontSize: 12 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onMove(idx, -1)} disabled={idx === 0} style={miniBtn}>↑</button>
          <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1} style={miniBtn}>↓</button>
          <button onClick={() => onRemove(idx)} style={{ ...miniBtn, color: COLORS.error }}>🗑</button>
        </div>
      </div>

      {(bloque.pasos || []).map((paso, pi) => (
        <PasoRepeat
          key={pi}
          paso={paso}
          pasoIdx={pi}
          repeatIdx={idx}
          disciplina={disciplina}
          totalPasos={(bloque.pasos || []).length}
          onUpdatePaso={onUpdatePaso}
          onRemovePaso={onRemovePaso}
        />
      ))}

      <button onClick={() => onAddPaso(idx)} style={{ ...addBtnStyle, marginTop: 6 }}>
        + Añadir paso
      </button>
    </div>
  )
}

// ── Estilos base ─────────────────────────────────────────────────────────────

const labelSm = {
  display: 'block',
  fontSize: 11,
  color: COLORS.textSecondary,
  marginBottom: 3,
}

const miniBtn = {
  background: 'transparent',
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 4,
  color: COLORS.textSecondary,
  padding: '3px 7px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
}

const addBtnStyle = {
  background: 'transparent',
  border: `1px dashed rgba(255,255,255,0.15)`,
  borderRadius: 6,
  color: COLORS.textSecondary,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
  width: '100%',
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function WorkoutBuilder({ isOpen, onClose, onSaved, athleteId, coachId, sessionExistente, atletaNombre }) {
  const [form, setForm] = useState(initForm(sessionExistente))
  const [sessionId, setSessionId] = useState(sessionExistente?.id || null)
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [exitoGarmin, setExitoGarmin] = useState(false)
  const [errorIntervals, setErrorIntervals] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (isOpen) {
      setForm(initForm(sessionExistente))
      setSessionId(sessionExistente?.id || null)
      setExitoGarmin(false)
      setErrorIntervals(false)
      setError(null)
    }
  }, [isOpen, sessionExistente])

  if (!isOpen) return null

  // ── Manipulación de bloques ─────────────────────────────────────────────

  function updateBloque(idx, changes) {
    setForm((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b, i) => (i === idx ? { ...b, ...changes } : b)),
    }))
  }

  function removeBloque(idx) {
    setForm((prev) => ({ ...prev, bloques: prev.bloques.filter((_, i) => i !== idx) }))
  }

  function moveBloque(idx, dir) {
    const target = idx + dir
    setForm((prev) => {
      if (target < 0 || target >= prev.bloques.length) return prev
      const bloques = [...prev.bloques]
      ;[bloques[idx], bloques[target]] = [bloques[target], bloques[idx]]
      return { ...prev, bloques }
    })
  }

  function updatePaso(repeatIdx, pasoIdx, changes) {
    setForm((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b, i) =>
        i === repeatIdx
          ? { ...b, pasos: b.pasos.map((p, pi) => (pi === pasoIdx ? { ...p, ...changes } : p)) }
          : b
      ),
    }))
  }

  function removePaso(repeatIdx, pasoIdx) {
    setForm((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b, i) =>
        i === repeatIdx ? { ...b, pasos: b.pasos.filter((_, pi) => pi !== pasoIdx) } : b
      ),
    }))
  }

  function addPaso(repeatIdx) {
    setForm((prev) => ({
      ...prev,
      bloques: prev.bloques.map((b, i) =>
        i === repeatIdx
          ? {
              ...b,
              pasos: [
                ...(b.pasos || []),
                { cantidad: 100, unidad: defaultUnidad(prev.disciplina), objetivo_tipo: null, objetivo_valor: null, nombre: null },
              ],
            }
          : b
      ),
    }))
  }

  function addBloque(tipo) {
    const unidad = defaultUnidad(form.disciplina)
    const base = { objetivo_tipo: null, objetivo_valor: null, nombre: null }

    const nuevoBloque =
      tipo === 'repeat'
        ? { tipo: 'repeat', nombre: '', repeticiones: 4, pasos: [
            { cantidad: 100, unidad, ...base },
            { cantidad: 30, unidad: 's', objetivo_tipo: null, objetivo_valor: null, nombre: 'Descanso' },
          ] }
        : { tipo, nombre: null, cantidad: tipo === 'swim' ? 200 : 1, unidad, ...base }

    setForm((prev) => ({ ...prev, bloques: [...prev.bloques, nuevoBloque] }))
  }

  function toggleMaterial(item) {
    setForm((prev) => ({
      ...prev,
      material: prev.material.includes(item)
        ? prev.material.filter((m) => m !== item)
        : [...prev.material, item],
    }))
  }

  // ── Guardar / Enviar ────────────────────────────────────────────────────

  async function buildRegistro() {
    return {
      coach_id: coachId,
      athlete_id: athleteId,
      fecha: form.fecha,
      disciplina: form.disciplina,
      descripcion: form.nombre,
      // Columnas legacy mantenidas para compatibilidad con SessionsList
      notas: form.notas || null,
      material: form.disciplina === 'swim' && form.material.length > 0 ? form.material : null,
      // workout_steps en formato objeto {bloques, material, notas}
      workout_steps: form.bloques.length > 0
        ? { bloques: form.bloques, material: form.material, notas: form.notas || '' }
        : null,
    }
  }

  async function saveToSupabase() {
    const registro = await buildRegistro()
    if (sessionId) {
      const { error: dbError } = await supabase
        .from('coach_sessions')
        .update(registro)
        .eq('id', sessionId)
      if (dbError) throw new Error('No se pudo actualizar la sesión')
      return sessionId
    } else {
      const { data, error: dbError } = await supabase
        .from('coach_sessions')
        .insert(registro)
        .select()
        .single()
      if (dbError) throw new Error('No se pudo guardar la sesión')
      setSessionId(data.id)
      return data.id
    }
  }

  async function handleGuardar() {
    if (!form.fecha || !form.nombre?.trim()) {
      setError('La fecha y el nombre son obligatorios')
      return
    }
    setGuardando(true)
    setError(null)
    try {
      await saveToSupabase()
      if (onSaved) onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function handleEnviarGarmin() {
    if (!form.fecha || !form.nombre?.trim()) {
      setError('La fecha y el nombre son obligatorios')
      return
    }
    setEnviando(true)
    setError(null)
    setExitoGarmin(false)
    setErrorIntervals(false)
    try {
      const sid = await saveToSupabase()

      const res = await fetch('/.netlify/functions/send-to-intervals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-coach-secret': import.meta.env.VITE_COACH_SECRET || '',
        },
        body: JSON.stringify({ sessionId: sid, coachId, athleteId }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        if (json.error === 'El atleta no tiene Intervals.icu configurado') {
          setErrorIntervals(true)
        } else {
          setError(json.error || 'Error enviando a Garmin')
        }
        return
      }

      setExitoGarmin(true)
      if (onSaved) onSaved()
    } catch {
      setError('Error de conexión enviando a Garmin')
    } finally {
      setEnviando(false)
    }
  }

  const preview = buildIntervalsText({
    disciplina: form.disciplina,
    workout_steps: { bloques: form.bloques, material: form.material, notas: form.notas },
  })

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 199,
        }}
      />

      {/* Drawer lateral derecho */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 520,
          maxWidth: '100vw',
          background: '#0F1729',
          borderLeft: `1px solid ${COLORS.cardBorder}`,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        {/* Header */}
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
              Prescribir entrenamiento
            </h2>
            {atletaNombre && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
                {atletaNombre}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: COLORS.textSecondary,
              fontSize: 20,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Contenido con scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Disciplina */}
          <div style={{ marginBottom: 16 }}>
            <label style={sectionLabel}>Disciplina</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DISCIPLINAS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setForm((prev) => ({ ...prev, disciplina: d.value, bloques: [], material: [] }))}
                  style={{
                    background: form.disciplina === d.value ? COLORS.accent : 'transparent',
                    color: form.disciplina === d.value ? '#0A0F1E' : COLORS.textSecondary,
                    border: `1px solid ${form.disciplina === d.value ? COLORS.accent : COLORS.cardBorder}`,
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'Inter', sans-serif",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Fecha */}
          <div style={{ marginBottom: 14 }}>
            <label style={sectionLabel}>Fecha</label>
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          {/* Nombre */}
          <div style={{ marginBottom: 14 }}>
            <label style={sectionLabel}>Nombre del entrenamiento</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="ej: Series umbrales piscina"
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          {/* Material (solo natación) */}
          {form.disciplina === 'swim' && (
            <div style={{ marginBottom: 16 }}>
              <label style={sectionLabel}>Material</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MATERIAL_SWIM.map((item) => {
                  const activo = form.material.includes(item)
                  return (
                    <button
                      key={item}
                      onClick={() => toggleMaterial(item)}
                      style={{
                        background: activo ? 'rgba(0,212,255,0.1)' : 'transparent',
                        color: activo ? COLORS.accent : COLORS.textSecondary,
                        border: `1px solid ${activo ? COLORS.accent : COLORS.cardBorder}`,
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {activo ? '☑' : '☐'} {item}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Separador Bloques */}
          <div style={separadorSection}>Bloques</div>

          {/* Lista de bloques */}
          {form.bloques.map((bloque, idx) =>
            bloque.tipo === 'repeat' ? (
              <BloqueRepeat
                key={idx}
                bloque={bloque}
                idx={idx}
                disciplina={form.disciplina}
                total={form.bloques.length}
                onUpdate={updateBloque}
                onRemove={removeBloque}
                onMove={moveBloque}
                onUpdatePaso={updatePaso}
                onRemovePaso={removePaso}
                onAddPaso={addPaso}
              />
            ) : (
              <BloqueSimple
                key={idx}
                bloque={bloque}
                idx={idx}
                disciplina={form.disciplina}
                total={form.bloques.length}
                onUpdate={updateBloque}
                onRemove={removeBloque}
                onMove={moveBloque}
              />
            )
          )}

          {/* Botones de añadir bloque */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              { tipo: 'warmup', label: '+ Calentamiento' },
              { tipo: 'repeat', label: '+ Serie' },
              { tipo: 'step', label: '+ Paso libre' },
              { tipo: 'cooldown', label: '+ Vuelta calma' },
            ].map(({ tipo, label }) => (
              <button key={tipo} onClick={() => addBloque(tipo)} style={addBtnStyle}>
                {label}
              </button>
            ))}
          </div>

          {/* Notas */}
          <div style={separadorSection}>Notas para el atleta</div>
          <textarea
            value={form.notas}
            onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
            rows={3}
            placeholder="Indicaciones técnicas, material extra..."
            style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 16 }}
          />

          {/* Preview Intervals */}
          <div style={separadorSection}>Preview Intervals.icu</div>
          <pre
            style={{
              background: '#0A0F1E',
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
              color: COLORS.textSecondary,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'monospace',
              minHeight: 80,
              marginBottom: 16,
            }}
          >
            {preview || '(sin bloques aún)'}
          </pre>

          {/* Mensajes de estado */}
          {exitoGarmin && (
            <div
              style={{
                background: 'rgba(0,229,160,0.1)',
                border: '1px solid rgba(0,229,160,0.3)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                fontSize: 13,
                color: '#00E5A0',
              }}
            >
              ✅ Entrenamiento enviado al Garmin de {atletaNombre || 'el atleta'}
            </div>
          )}

          {errorIntervals && (
            <div
              style={{
                background: 'rgba(255,77,109,0.1)',
                border: '1px solid rgba(255,77,109,0.3)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                fontSize: 13,
                color: COLORS.error,
              }}
            >
              ⚠️ Este atleta no tiene Intervals.icu configurado. Comparte con él el link de configuración desde la sección Configuración Garmin.
            </div>
          )}

          {error && !errorIntervals && (
            <p style={{ color: COLORS.error, fontSize: 13, marginBottom: 12 }}>{error}</p>
          )}

          {/* Botones principales */}
          <div style={{ display: 'flex', gap: 10, paddingBottom: 24 }}>
            <button
              onClick={handleGuardar}
              disabled={guardando || enviando}
              style={{
                flex: 1,
                background: 'transparent',
                color: COLORS.textSecondary,
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: guardando ? 'wait' : 'pointer',
                fontFamily: "'Inter', sans-serif",
                opacity: guardando || enviando ? 0.6 : 1,
              }}
            >
              {guardando ? 'Guardando...' : 'Guardar borrador'}
            </button>
            <button
              onClick={handleEnviarGarmin}
              disabled={guardando || enviando}
              style={{
                flex: 1,
                background: COLORS.accent,
                color: '#0A0F1E',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: enviando ? 'wait' : 'pointer',
                fontFamily: "'Inter', sans-serif",
                opacity: guardando || enviando ? 0.6 : 1,
              }}
            >
              {enviando ? 'Enviando...' : '✈ Enviar a Garmin'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const sectionLabel = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: 8,
}

const separadorSection = {
  fontSize: 11,
  fontWeight: 600,
  color: COLORS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  paddingBottom: 6,
  marginBottom: 12,
  marginTop: 4,
}
