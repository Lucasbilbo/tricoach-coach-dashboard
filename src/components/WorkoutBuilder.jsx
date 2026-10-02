import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { COLORS, inputStyle } from '../lib/theme'
import { buildIntervalsText } from '../lib/intervalsText'
import { DISCIPLINAS, defaultUnidad, duracionTotalMin, initForm, proximosDias, ritmosInvalidos, usaZonaNatacion } from './workout/constants'
import { sectionLabel, separadorSection, addBtnStyle } from './workout/styles'
import { BloqueSimple, BloqueRepeat } from './workout/WorkoutBlocks'
import AtajosBuilder from './workout/AtajosBuilder'

// ── Componente principal ──────────────────────────────────────────────────────

const DIAS_CHIPS = proximosDias(14)

export default function WorkoutBuilder({ isOpen, onClose, onSaved, athleteId, coachId, sessionExistente, atletaNombre }) {
  const [form, setForm] = useState(initForm(sessionExistente))
  const [sessionId, setSessionId] = useState(sessionExistente?.id || null)
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [exitoGarmin, setExitoGarmin] = useState(false)
  const [errorIntervals, setErrorIntervals] = useState(false)
  const [error, setError] = useState(null)
  const [mostrarInputFecha, setMostrarInputFecha] = useState(false)

  useEffect(() => {
    if (isOpen) {
      const f = initForm(sessionExistente)
      setForm(f)
      setSessionId(sessionExistente?.id || null)
      setExitoGarmin(false)
      setErrorIntervals(false)
      setError(null)
      // Mostrar input si la fecha existente no está en los próximos 14 días
      setMostrarInputFecha(
        !!f.fecha && !DIAS_CHIPS.some((d) => d.value === f.fecha)
      )
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
                { cantidad: 100, unidad: defaultUnidad(prev.disciplina), objetivo_tipo: null, objetivo_valor: null, nombre: null, material: [] },
              ],
            }
          : b
      ),
    }))
  }

  function addBloque(tipo) {
    const unidad = defaultUnidad(form.disciplina)
    const base = { objetivo_tipo: null, objetivo_valor: null, nombre: null, material: [] }

    const nuevoBloque =
      tipo === 'repeat'
        ? {
            tipo: 'repeat',
            nombre: '',
            repeticiones: 4,
            pasos: [
              { cantidad: 100, unidad, objetivo_tipo: null, objetivo_valor: null, nombre: null, material: [] },
              { cantidad: 30, unidad: 's', objetivo_tipo: null, objetivo_valor: null, nombre: 'Descanso', material: [] },
            ],
          }
        : { tipo, cantidad: 200, unidad, ...base }

    setForm((prev) => ({ ...prev, bloques: [...prev.bloques, nuevoBloque] }))
  }

  // ── Guardar / Enviar ────────────────────────────────────────────────────

  // Sesión que ya está en el reloj: al guardarla hay que reenviarla, o el
  // atleta entrenaría la versión vieja.
  const yaEnviada = !!sessionExistente?.intervals_event_id

  async function buildRegistro() {
    return {
      coach_id: coachId,
      athlete_id: athleteId,
      fecha: form.fecha,
      disciplina: form.disciplina,
      descripcion: form.nombre,
      notas: form.notas || null,
      duracion_min: duracionTotalMin(form.bloques),
      workout_steps: form.bloques.length > 0
        ? { bloques: form.bloques, notas: form.notas || '', ...(form.disciplina === 'swim' ? { piscina: form.piscina } : {}) }
        : null,
      // Al editar una sesión ya enviada se marca como pendiente hasta que el
      // reenvío se confirme: si falla, la lista lo muestra como "no enviado"
      // en vez de mentir con un ✅ sobre una versión vieja.
      ...(sessionId && yaEnviada ? { enviado_a_garmin: false } : {}),
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

  function validar() {
    if (!form.fecha || !form.nombre?.trim()) return 'La fecha y el nombre son obligatorios'
    const malos = ritmosInvalidos(form.bloques)
    if (malos.length) return `Ritmo mal escrito: ${malos.join(', ')}. Usa 5:00 o un rango 4:50-5:10`
    return null
  }

  // Envía (o reenvía) la sesión a Intervals → reloj. Devuelve true si se confirmó.
  async function enviarAlReloj(sid) {
    const res = await fetch('/.netlify/functions/send-to-intervals', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ sessionId: sid }),
    })
    const json = await res.json().catch(() => ({}))
    if (res.ok) return true
    if (json.code === 'NO_INTERVALS') setErrorIntervals(true)
    else setError(json.error || 'Error enviando a Garmin')
    return false
  }

  async function handleGuardar() {
    const invalido = validar()
    if (invalido) {
      setError(invalido)
      return
    }
    setGuardando(true)
    setError(null)
    try {
      const sid = await saveToSupabase()
      if (yaEnviada) {
        const ok = await enviarAlReloj(sid)
        if (!ok) {
          // Guardado, pero el reloj sigue con la versión anterior: no cerrar,
          // que el coach lo vea. La lista la mostrará como pendiente de envío.
          setError('Cambios guardados, pero no se pudo actualizar el reloj. Queda pendiente de enviar.')
          if (onSaved) onSaved()
          return
        }
      }
      if (onSaved) onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function handleEnviarGarmin() {
    const invalido = validar()
    if (invalido) {
      setError(invalido)
      return
    }
    setEnviando(true)
    setError(null)
    setExitoGarmin(false)
    setErrorIntervals(false)
    try {
      const sid = await saveToSupabase()
      // coach/atleta se derivan de la sesión y del JWT en el backend
      const ok = await enviarAlReloj(sid)
      if (!ok) return
      setExitoGarmin(true)
      if (onSaved) onSaved()
    } catch {
      setError('Error de conexión enviando a Garmin')
    } finally {
      setEnviando(false)
    }
  }

  // incluirNotas:true SOLO aquí (el coach debe ver que las escribió). El envío
  // real a Garmin las omite siempre — ver send-to-intervals.js.
  const preview = buildIntervalsText(
    {
      disciplina: form.disciplina,
      workout_steps: { bloques: form.bloques, notas: form.notas },
    },
    { incluirNotas: true }
  )

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 }}
      />

      {/* Drawer lateral derecho */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100dvh',
          width: 520,
          maxWidth: '100vw',
          background: '#12151C',
          borderLeft: `1px solid ${COLORS.cardBorder}`,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: "'Archivo', sans-serif",
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
                  onClick={() => setForm((prev) => ({ ...prev, disciplina: d.value, bloques: [] }))}
                  style={{
                    background: form.disciplina === d.value ? COLORS.accent : 'transparent',
                    color: form.disciplina === d.value ? '#0B0D12' : COLORS.textSecondary,
                    border: `1px solid ${form.disciplina === d.value ? COLORS.accent : COLORS.cardBorder}`,
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: "'Archivo', sans-serif",
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sin disciplina elegida: no se muestra ningún campo específico */}
          {!form.disciplina && (
            <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: '0 0 8px' }}>
              Elige una disciplina para empezar a construir el entrenamiento.
            </p>
          )}

          {form.disciplina && (
            <>
          {/* Piscina — solo natación */}
          {form.disciplina === 'swim' && (
            <div style={{ marginBottom: 14 }}>
              <label style={sectionLabel}>Piscina</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ value: '25', label: '25m' }, { value: '50', label: '50m' }, { value: 'open', label: 'Aguas abiertas' }].map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setForm((prev) => ({ ...prev, piscina: p.value }))}
                    style={{
                      background: form.piscina === p.value ? COLORS.accent : 'transparent',
                      color: form.piscina === p.value ? '#0B0D12' : COLORS.textSecondary,
                      border: `1px solid ${form.piscina === p.value ? COLORS.accent : COLORS.cardBorder}`,
                      borderRadius: 6,
                      padding: '5px 14px',
                      fontSize: 13,
                      fontWeight: form.piscina === p.value ? 700 : 400,
                      cursor: 'pointer',
                      fontFamily: "'Archivo', sans-serif",
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Fecha — chips de próximos 14 días */}
          <div style={{ marginBottom: 14 }}>
            <label style={sectionLabel}>Fecha</label>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                paddingBottom: 6,
                scrollbarWidth: 'none',
              }}
            >
              {DIAS_CHIPS.map((dia) => {
                const sel = form.fecha === dia.value
                return (
                  <button
                    key={dia.value}
                    onClick={() => setForm((prev) => ({ ...prev, fecha: dia.value }))}
                    style={{
                      background: sel ? COLORS.accent : 'transparent',
                      color: sel ? COLORS.background : COLORS.textSecondary,
                      border: `1px solid ${sel ? COLORS.accent : COLORS.cardBorder}`,
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: sel ? 700 : 400,
                      cursor: 'pointer',
                      fontFamily: "'Archivo', sans-serif",
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {dia.label}
                  </button>
                )
              })}
            </div>
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => setMostrarInputFecha((v) => !v)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.textSecondary,
                  fontSize: 12,
                  cursor: 'pointer',
                  padding: 0,
                  fontFamily: "'Archivo', sans-serif",
                }}
              >
                {mostrarInputFecha ? '▲ Ocultar' : '▼ Otra fecha'}
              </button>
              {mostrarInputFecha && (
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
                  style={{ ...inputStyle, width: '100%', marginTop: 6 }}
                />
              )}
              {form.fecha && !DIAS_CHIPS.some((d) => d.value === form.fecha) && !mostrarInputFecha && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.accent }}>
                  Fecha seleccionada: {form.fecha}
                </p>
              )}
            </div>
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

          {/* Atajos: escritura rápida y plantillas */}
          <AtajosBuilder
            key={form.disciplina}
            disciplina={form.disciplina}
            bloques={form.bloques}
            nombre={form.nombre}
            piscina={form.piscina}
            onBloques={(bloques, nombrePlantilla) =>
              setForm((prev) => ({ ...prev, bloques, nombre: prev.nombre?.trim() ? prev.nombre : nombrePlantilla || prev.nombre }))
            }
          />

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
          <div style={separadorSection}>
            Así llega al reloj
            {duracionTotalMin(form.bloques) != null && (
              <span style={{ marginLeft: 8, fontFamily: "'JetBrains Mono', monospace", color: COLORS.textPrimary }}>
                · {duracionTotalMin(form.bloques)} min
              </span>
            )}
          </div>
          <pre
            style={{
              background: '#0B0D12',
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
          {usaZonaNatacion(form.bloques, form.disciplina) && (
            <p style={{ margin: '-8px 0 16px', fontSize: 12, color: COLORS.textTertiary, lineHeight: 1.45 }}>
              La zona de natación se manda como zona de ritmo: necesita el ritmo umbral de natación
              configurado en Intervals. Si el atleta no lo tiene, usa ritmo /100m.
            </p>
          )}

          {/* Mensajes de estado */}
          {exitoGarmin && (
            <div
              style={{
                background: 'rgba(47,191,175,0.1)',
                border: '1px solid rgba(47,191,175,0.3)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
                fontSize: 13,
                color: '#2FBFAF',
              }}
            >
              Enviado al reloj de {atletaNombre || 'el atleta'}
            </div>
          )}

          {errorIntervals && (
            <div
              style={{
                background: 'rgba(232,93,93,0.1)',
                border: '1px solid rgba(232,93,93,0.3)',
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
                fontFamily: "'Archivo', sans-serif",
                opacity: guardando || enviando ? 0.6 : 1,
              }}
            >
              {guardando ? (yaEnviada ? 'Actualizando reloj...' : 'Guardando...') : yaEnviada ? 'Guardar y actualizar reloj' : 'Guardar borrador'}
            </button>
            <button
              onClick={handleEnviarGarmin}
              disabled={guardando || enviando}
              style={{
                flex: 1,
                background: COLORS.accent,
                color: '#0B0D12',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: enviando ? 'wait' : 'pointer',
                fontFamily: "'Archivo', sans-serif",
                opacity: guardando || enviando ? 0.6 : 1,
              }}
            >
              {enviando ? 'Enviando…' : 'Guardar y enviar al reloj'}
            </button>
          </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
