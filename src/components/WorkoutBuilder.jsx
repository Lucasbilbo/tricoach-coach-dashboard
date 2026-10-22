import { useState } from 'react'
import { useDisponibilidadConEstado } from '../hooks/useDisponibilidad'
import { evaluarDisponibilidad, formatHora, textoAviso } from '../lib/disponibilidad'
import { ahoraMadrid, disciplinasALaHora, horasPosibles } from '../lib/agenda'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { invalidarDatosAtleta } from '../lib/athleteData'
import { COLORS, DISCIPLINE_COLORS, FONTS, inputStyle } from '../lib/theme'
import { buildIntervalsText } from '../lib/intervalsText'
import { DISCIPLINAS, defaultUnidad, duracionTotalMin, initForm, proximosDias, ritmosInvalidos, usaZonaNatacion } from './workout/constants'
import { sectionLabel, separadorSection, addBtnStyle, chipStyle } from './workout/styles'
import { BloqueSimple, BloqueRepeat } from './workout/WorkoutBlocks'
import AtajosBuilder from './workout/AtajosBuilder'
import { AdjuntoEditor } from './AdjuntoEntreno'
import { adjuntoDe } from '../lib/adjuntos'
import Icon from './ui/Icon'

// ── Componente principal ──────────────────────────────────────────────────────

const DIAS_CHIPS = proximosDias(14)
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(f) {
  const d = new Date(f + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? f : `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

export default function WorkoutBuilder({ isOpen, onClose, onSaved, athleteId, coachId, sessionExistente, atletaNombre }) {
  const [form, setForm] = useState(initForm(sessionExistente))
  const [sessionId, setSessionId] = useState(sessionExistente?.id || null)
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [exitoGarmin, setExitoGarmin] = useState(false)
  const [errorIntervals, setErrorIntervals] = useState(false)
  const [error, setError] = useState(null)
  const [mostrarInputFecha, setMostrarInputFecha] = useState(false)
  const [mostrarInputHora, setMostrarInputHora] = useState(false)
  // Con hora puesta solo se ofrecen las disciplinas que caben a esa hora;
  // "Otra disciplina" las enseña todas (el coach puede forzar).
  const [todasDisciplinas, setTodasDisciplinas] = useState(false)
  const [ahora] = useState(() => ahoraMadrid())
  const { datos: disponibilidad, cargada: disponibilidadCargada } = useDisponibilidadConEstado(athleteId, isOpen)

  // Al abrir (o cambiar la sesión a editar) se reinicia el formulario. Se hace
  // durante el render comparando con las props previas (patrón de React para
  // "ajustar estado cuando cambia una prop"), no en un efecto: así no hay un
  // render intermedio con el formulario de la sesión anterior.
  const [previo, setPrevio] = useState({ isOpen: false, sessionExistente })
  if (previo.isOpen !== isOpen || previo.sessionExistente !== sessionExistente) {
    setPrevio({ isOpen, sessionExistente })
    if (isOpen) {
      const f = initForm(sessionExistente)
      setForm(f)
      setSessionId(sessionExistente?.id || null)
      setExitoGarmin(false)
      setMostrarInputHora(false)
      setTodasDisciplinas(false)
      setErrorIntervals(false)
      setError(null)
      // Mostrar input si la fecha existente no está en los próximos 14 días
      setMostrarInputFecha(
        !!f.fecha && !DIAS_CHIPS.some((d) => d.value === f.fecha)
      )
    }
  }

  if (!isOpen) return null

  // Aviso informativo de disponibilidad del atleta (nunca bloquea el guardado)
  const avisoDisponibilidad = form.fecha && form.disciplina
    ? textoAviso(evaluarDisponibilidad(disponibilidad, form.fecha, form.disciplina, duracionTotalMin(form.bloques), form.hora ?? undefined), form.disciplina)
    : null

  // Horas de inicio que encajan en las franjas del atleta para esa disciplina y
  // día (cada 30 min). La hora es opcional: sin hora la sesión va a la fila
  // "sin hora" de la agenda y al reloj sin hora concreta.
  const horasSugeridas = form.fecha && form.disciplina
    ? horasPosibles(disponibilidad, form.fecha, form.disciplina, duracionTotalMin(form.bloques), ahora)
    : []
  const chipsHora = form.hora != null && !horasSugeridas.includes(form.hora)
    ? [...horasSugeridas, form.hora].sort((a, b) => a - b)
    : horasSugeridas

  // Combinaciones imposibles: si el atleta no puede hacer esa disciplina ese
  // día, el chip/botón no se puede elegir (devuelve el motivo, o null si encaja
  // o no hay datos). Sin duración: solo mira el día y la disciplina, no el
  // tramo. La opción YA seleccionada nunca se bloquea (sesiones antiguas,
  // cambios de disponibilidad) y "Otra fecha" permite forzarla igualmente.
  const noEncaja = (fecha, disciplina) =>
    fecha && disciplina
      ? textoAviso(evaluarDisponibilidad(disponibilidad, fecha, disciplina), disciplina)
      : null

  // Disciplinas posibles a la hora elegida (null = sin hora o sin datos).
  const alaHora = form.fecha && Number.isInteger(form.hora)
    ? disciplinasALaHora(disponibilidad, form.fecha, form.hora)
    : null
  // Con hora pero sin los datos aún: no se pintan todas para luego quitar unas.
  const esperandoDisponibilidad = Number.isInteger(form.hora) && !disponibilidadCargada && !form.disciplina
  const filtrarPorHora = !!alaHora && alaHora.length > 0 && !todasDisciplinas
  const disciplinasVisibles = DISCIPLINAS.filter((d) => !filtrarPorHora || alaHora.includes(d.value) || form.disciplina === d.value)
  // Si a esa hora solo cabe una, se elige sola (ajuste de estado en render).
  if (!form.disciplina && filtrarPorHora && alaHora.length === 1 && !sessionExistente?.id) {
    setForm((prev) => ({ ...prev, disciplina: alaHora[0] }))
  }

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

  // Solo fuerza admite el entreno "tal cual" (captura / texto, p. ej. Hyrox)
  const conAdjunto = form.disciplina === 'strength'
  const adjunto = conAdjunto ? adjuntoDe({ adjunto: form.adjunto }) : null
  const duracionBloques = duracionTotalMin(form.bloques)
  const duracionFinal = duracionBloques ?? (form.bloques.length === 0 && Number(form.duracionManual) > 0 ? Math.round(Number(form.duracionManual)) : null)

  async function buildRegistro() {
    const horaAntes = sessionExistente?.hora_inicio_min ?? null
    const horaNueva = form.hora ?? null
    return {
      coach_id: coachId,
      athlete_id: athleteId,
      fecha: form.fecha,
      disciplina: form.disciplina,
      descripcion: form.nombre,
      notas: form.notas || null,
      duracion_min: duracionFinal,
      workout_steps: form.bloques.length > 0 || adjunto
        ? { bloques: form.bloques, notas: form.notas || '', ...(form.disciplina === 'swim' ? { piscina: form.piscina } : {}), ...(adjunto ? { adjunto } : {}) }
        : null,
      // Al editar una sesión ya enviada se marca como pendiente hasta que el
      // reenvío se confirme: si falla, la lista lo muestra como "no enviado"
      // en vez de mentir con un ✅ sobre una versión vieja.
      ...(sessionId && yaEnviada ? { enviado_a_garmin: false } : {}),
      // La columna solo se manda si hay hora (o la había): así guardar sin hora
      // sigue funcionando aunque la migración 013 aún no esté aplicada.
      ...(horaNueva != null || horaAntes != null ? { hora_inicio_min: horaNueva } : {}),
      // Si el coach recoloca una sesión que había movido el atleta, la marca
      // "movida por" deja de ser cierta.
      ...(sessionExistente?.movida_por && (form.fecha !== sessionExistente.fecha || horaNueva !== horaAntes)
        ? { movida_por: null, movida_at: null }
        : {}),
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
      invalidarDatosAtleta(athleteId) // los metros de técnica salen de coach_sessions
      return sessionId
    } else {
      const { data, error: dbError } = await supabase
        .from('coach_sessions')
        .insert(registro)
        .select()
        .single()
      if (dbError) throw new Error('No se pudo guardar la sesión')
      setSessionId(data.id)
      invalidarDatosAtleta(athleteId)
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
              {sessionId ? 'Editar entrenamiento' : 'Prescribir entrenamiento'}
            </h2>
            {(atletaNombre || form.fecha) && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
                {[atletaNombre, form.fecha ? fechaCorta(form.fecha) + (form.hora != null ? ` · ${formatHora(form.hora)}` : '') : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <button
            aria-label="Cerrar"
            title="Cerrar"
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
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Disciplina */}
          <div style={{ marginBottom: 16 }}>
            <label style={sectionLabel}>Disciplina</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {esperandoDisponibilidad && (
                <span style={{ fontSize: 12.5, color: COLORS.textTertiary, minHeight: 32, display: 'inline-flex', alignItems: 'center' }}>
                  Mirando qué puede hacer a esa hora…
                </span>
              )}
              {!esperandoDisponibilidad && disciplinasVisibles.map((d) => {
                const sel = form.disciplina === d.value
                const bloqueo = sel || filtrarPorHora ? null : noEncaja(form.fecha, d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    disabled={!!bloqueo}
                    title={bloqueo || undefined}
                    aria-pressed={sel}
                    onClick={() => setForm((prev) => (prev.disciplina === d.value ? prev : { ...prev, disciplina: d.value, bloques: [] }))}
                    style={chipStyle(sel, { bloqueado: !!bloqueo })}
                  >
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: DISCIPLINE_COLORS[d.value] }} />
                    {d.label}
                  </button>
                )
              })}
            </div>
            {alaHora && alaHora.length === 0 && (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: COLORS.textTertiary }}>
                A las {formatHora(form.hora)} el atleta no tiene franjas marcadas.
              </p>
            )}
            {filtrarPorHora && DISCIPLINAS.length > disciplinasVisibles.length && (
              <button
                type="button"
                onClick={() => setTodasDisciplinas(true)}
                style={{ marginTop: 6, background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: FONTS.sans }}
              >
                Solo lo que puede hacer a las {formatHora(form.hora)} · Otra disciplina
              </button>
            )}
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
                    type="button"
                    aria-pressed={form.piscina === p.value}
                    onClick={() => setForm((prev) => ({ ...prev, piscina: p.value }))}
                    style={chipStyle(form.piscina === p.value)}
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
                const bloqueo = sel ? null : noEncaja(dia.value, form.disciplina)
                return (
                  <button
                    key={dia.value}
                    disabled={!!bloqueo}
                    title={bloqueo || undefined}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => setForm((prev) => ({ ...prev, fecha: dia.value }))}
                    style={chipStyle(sel, { bloqueado: !!bloqueo })}
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
                <p style={{ margin: '4px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
                  Fecha seleccionada: {form.fecha}
                </p>
              )}
            </div>
          </div>

          {form.fecha && (
            <div style={{ marginBottom: 14 }}>
              <label style={sectionLabel}>Hora <span style={{ textTransform: 'none', fontWeight: 400, color: COLORS.textTertiary }}>(opcional)</span></label>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none' }}>
                {[null, ...chipsHora].map((h) => {
                  const sel = (form.hora ?? null) === h
                  return (
                    <button
                      key={h ?? 'sin'}
                      type="button"
                      aria-pressed={sel}
                      onClick={() => setForm((prev) => ({ ...prev, hora: h }))}
                      style={chipStyle(sel, { mono: h != null })}
                    >
                      {h == null ? 'Sin hora' : formatHora(h)}
                    </button>
                  )
                })}
              </div>
              {form.disciplina && horasSugeridas.length === 0 && (
                <p style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.textTertiary }}>
                  {form.fecha === ahora.fecha && horasPosibles(disponibilidad, form.fecha, form.disciplina, duracionTotalMin(form.bloques), null).length > 0
                    ? 'Las franjas de hoy para esto ya han pasado.'
                    : 'El atleta no tiene franjas para esto ese día.'}
                </p>
              )}
              <div style={{ marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setMostrarInputHora((v) => !v)}
                  style={{ background: 'transparent', border: 'none', color: COLORS.textSecondary, fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: "'Archivo', sans-serif" }}
                >
                  {mostrarInputHora ? '▲ Ocultar' : '▼ Otra hora'}
                </button>
                {mostrarInputHora && (
                  <input
                    type="time"
                    step={300}
                    value={form.hora == null ? '' : `${String(Math.floor(form.hora / 60)).padStart(2, '0')}:${String(form.hora % 60).padStart(2, '0')}`}
                    onChange={(e) => {
                      const [hh, mm] = e.target.value.split(':').map(Number)
                      const m = Number.isInteger(hh) && Number.isInteger(mm) ? Math.round((hh * 60 + mm) / 5) * 5 : null
                      setForm((prev) => ({ ...prev, hora: m != null && m < 1440 ? m : null }))
                    }}
                    style={{ ...inputStyle, width: '100%', marginTop: 6 }}
                  />
                )}
              </div>
            </div>
          )}

          {avisoDisponibilidad && (
            <p role="status" style={{ margin: '0 0 14px', padding: '8px 10px', borderRadius: 8, fontSize: 12, lineHeight: 1.45, color: '#E8B84A', border: '1px solid rgba(232,184,74,0.45)', background: 'rgba(232,184,74,0.08)' }}>
              {avisoDisponibilidad} Puedes guardarla igualmente.
            </p>
          )}

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

          {/* Fuerza / Hyrox: el entreno tal cual (texto pegado o capturas) */}
          {conAdjunto && (
            <div style={{ marginBottom: 16 }}>
              <label style={sectionLabel}>Entreno tal cual <span style={{ fontWeight: 400, color: COLORS.textTertiary }}>(captura o texto, p. ej. Hyrox)</span></label>
              <AdjuntoEditor athleteId={athleteId} valor={form.adjunto} onChange={(a) => setForm((prev) => ({ ...prev, adjunto: a }))} />
              {form.bloques.length === 0 && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label htmlFor="duracion-manual" style={{ fontSize: 13, color: COLORS.textSecondary }}>Duración</label>
                  <input
                    id="duracion-manual"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={form.duracionManual ?? ''}
                    onChange={(e) => setForm((prev) => ({ ...prev, duracionManual: e.target.value === '' ? null : Number(e.target.value) }))}
                    placeholder="60"
                    style={{ ...inputStyle, width: 90, fontFamily: FONTS.mono }}
                  />
                  <span style={{ fontSize: 13, color: COLORS.textSecondary }}>min</span>
                </div>
              )}
              <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textTertiary, lineHeight: 1.45 }}>
                Al reloj llegan el nombre y la duración; el atleta ve el entreno completo en la app. Si prefieres, puedes construirlo también por bloques abajo.
              </p>
            </div>
          )}

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginBottom: 16 }}>
            {[
              { tipo: 'warmup', label: '+ Calentamiento' },
              { tipo: 'repeat', label: '+ Serie' },
              { tipo: 'step', label: '+ Paso libre' },
              { tipo: 'cooldown', label: '+ Vuelta calma' },
            ].map(({ tipo, label }) => (
              <button key={tipo} type="button" onClick={() => addBloque(tipo)} style={{ ...addBtnStyle, minHeight: 34 }}>
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
            {duracionFinal != null && (
              <span style={{ marginLeft: 8, fontFamily: "'JetBrains Mono', monospace", color: COLORS.textPrimary }}>
                · {duracionFinal} min
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
              fontFamily: FONTS.mono,
              minHeight: 80,
              marginBottom: 16,
            }}
          >
            {preview || (adjunto ? `Fuerza · ${form.nombre?.trim() || 'Entrenamiento'}${duracionFinal ? ` · ${duracionFinal} min` : ''}
(el detalle lo ve en la app)` : '(sin bloques aún)')}
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
              <Icon name="alert" size={15} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 6 }} />
              Este atleta no tiene Intervals.icu configurado. Comparte con él el link de configuración desde la sección Configuración Garmin.
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
