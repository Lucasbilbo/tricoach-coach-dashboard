import { useEffect, useState } from 'react'
import { useDisponibilidadConEstado } from '../hooks/useDisponibilidad'
import { evaluarDisponibilidad, formatHora, textoAviso } from '../lib/disponibilidad'
import { ahoraMadrid, disciplinasALaHora, horasPosibles } from '../lib/agenda'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { invalidarDatosAtleta } from '../lib/athleteData'
import { COLORS, DISCIPLINE_COLORS, FONTS, inputStyle } from '../lib/theme'
import { buildIntervalsText } from '../lib/intervalsText'
import { DISCIPLINAS, defaultUnidad, duracionTotalMin, initForm, proximosDias, ritmosInvalidos, usaZonaNatacion } from './workout/constants'
import { sectionLabel, separadorSection, addBtnStyle, chipStyle, chipDisciplinaStyle } from './workout/styles'
import { BloqueSimple, BloqueRepeat } from './workout/WorkoutBlocks'
import { nombrePorDefecto } from './workout/resumen'
import { Perfil } from './WorkoutDetail'
import AtajosBuilder from './workout/AtajosBuilder'
import { AdjuntoEditor } from './AdjuntoEntreno'
import { adjuntoDe } from '../lib/adjuntos'
import Icon from './ui/Icon'
import Aviso from './ui/Aviso'
import { avisoEventoAntiguo } from '../lib/avisosReloj'
import { CamposPlanNutricion } from './NutricionSesion'
import { duracionPrevista } from '../lib/tssPrevisto'
import { aplicarSugerencia, formPlanDe, normalizarNutricion, resumenNutricion, sugerirNutricion, tienePlan } from '../lib/nutricion'
import { guardarNutricion, nutricionDisponible, quitarParte } from '../lib/nutricionApi'

// ── Componente principal ──────────────────────────────────────────────────────

const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fechaCorta(f) {
  const d = new Date(f + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? f : `${DIAS_SEMANA[d.getUTCDay()]} ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

// onSaved({ cerrar }): la sesión se guardó (hay que refrescar la lista). cerrar
// es false cuando el guardado salió a medias y hay un aviso que leer (reloj sin
// actualizar, nutrición sin guardar): el padre refresca pero NO cierra.
// nutricionExistente: fila de sesion_nutricion de la sesión que se edita (o de
// la original al duplicar), para precargar el plan de nutrición.
export default function WorkoutBuilder({ isOpen, onClose, onSaved, athleteId, coachId, sessionExistente, atletaNombre, nutricionExistente }) {
  const [form, setForm] = useState(initForm(sessionExistente))
  const [sessionId, setSessionId] = useState(sessionExistente?.id || null)
  const [guardando, setGuardando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [exitoGarmin, setExitoGarmin] = useState(false)
  const [errorIntervals, setErrorIntervals] = useState(false)
  const [error, setError] = useState(null)
  // Reloj con el entreno antiguo aún puesto (no se pudo retirar): aviso ámbar
  const [avisoReloj, setAvisoReloj] = useState(null)
  const [mostrarInputFecha, setMostrarInputFecha] = useState(false)
  const [mostrarInputHora, setMostrarInputHora] = useState(false)
  // Con hora puesta solo se ofrecen las disciplinas que caben a esa hora;
  // "Otra disciplina" las enseña todas (el coach puede forzar).
  const [todasDisciplinas, setTodasDisciplinas] = useState(false)
  // Bloques desplegados (índices). Todos plegados al abrir, al generar con la
  // escritura rápida o al cargar una plantilla; el que se añade a mano, abierto.
  const [abiertos, setAbiertos] = useState(() => new Set())
  const alternarBloque = (idx) => setAbiertos((prev) => {
    const s = new Set(prev)
    if (s.has(idx)) s.delete(idx)
    else s.add(idx)
    return s
  })
  const [ahora] = useState(() => ahoraMadrid())
  // Se calculan al abrir (el creador se monta cada vez), en hora de Madrid
  const DIAS_CHIPS = proximosDias(14, ahora.fecha)
  const { datos: disponibilidad, cargada: disponibilidadCargada } = useDisponibilidadConEstado(athleteId, isOpen)
  // Plan de nutrición (opcional). Se guarda en sesion_nutricion DESPUÉS de la
  // sesión (necesita su id). Solo si la tabla existe (migración 017).
  const [nutri, setNutri] = useState(() => formPlanDe(nutricionExistente))
  const [nutriSucio, setNutriSucio] = useState(false)
  const [nutriDisponible, setNutriDisponible] = useState(false)
  // Notas y nutrición van en "Más opciones" (plegado salvo que ya tengan algo)
  const [masAbierto, setMasAbierto] = useState(() => !!initForm(sessionExistente).notas || tienePlan(nutricionExistente))
  // El texto exacto que llega al reloj, plegado (se ve el perfil de intensidad)
  const [verTexto, setVerTexto] = useState(false)
  useEffect(() => {
    let activo = true
    if (isOpen) nutricionDisponible().then((ok) => activo && setNutriDisponible(ok))
    return () => { activo = false }
  }, [isOpen])

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
      setAbiertos(new Set())
      setErrorIntervals(false)
      setError(null)
      setAvisoReloj(null)
      setNutri(formPlanDe(nutricionExistente))
      // Al duplicar, el plan copiado hay que guardarlo en la sesión nueva
      setNutriSucio(!sessionExistente?.id && tienePlan(nutricionExistente))
      setMasAbierto(!!f.notas || tienePlan(nutricionExistente))
      setVerTexto(false)
      // Mostrar input si la fecha existente no está en los próximos 14 días
      setMostrarInputFecha(
        !!f.fecha && !DIAS_CHIPS.some((d) => d.value === f.fecha)
      )
    }
  }

  if (!isOpen) return null

  // Duración para los avisos y las horas que encajan: la de los bloques por
  // tiempo o, si van por distancia, la estimada con los ritmos (antes null: el
  // aviso no saltaba justo en las sesiones largas por km).
  const duracionAviso = duracionTotalMin(form.bloques)
    ?? (form.disciplina ? duracionPrevista({ disciplina: form.disciplina, workout_steps: { bloques: form.bloques }, duracion_min: Number(form.duracionManual) || null })?.min : null)
    ?? null

  // Aviso informativo de disponibilidad del atleta (nunca bloquea el guardado)
  const avisoDisponibilidad = form.fecha && form.disciplina
    ? textoAviso(evaluarDisponibilidad(disponibilidad, form.fecha, form.disciplina, duracionAviso ?? undefined, form.hora ?? undefined), form.disciplina)
    : null

  // Horas de inicio que encajan en las franjas del atleta para esa disciplina y
  // día (cada 30 min). La hora es opcional: sin hora la sesión va a la fila
  // "sin hora" de la agenda y al reloj sin hora concreta.
  const horasSugeridas = form.fecha && form.disciplina
    ? horasPosibles(disponibilidad, form.fecha, form.disciplina, duracionAviso, ahora)
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
    // Los índices abiertos por debajo suben uno
    setAbiertos((prev) => new Set([...prev].filter((i) => i !== idx).map((i) => (i > idx ? i - 1 : i))))
  }

  function moveBloque(idx, dir) {
    const target = idx + dir
    if (target >= 0 && target < form.bloques.length) {
      // El estado abierto/plegado viaja con el bloque
      setAbiertos((prev) => {
        const s = new Set(prev)
        const a = s.has(idx)
        const b = s.has(target)
        s.delete(idx)
        s.delete(target)
        if (a) s.add(target)
        if (b) s.add(idx)
        return s
      })
    }
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

    setAbiertos((prev) => new Set([...prev, form.bloques.length]))
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
      // Sin nombre escrito, el propuesto («Carrera · 6×3′ Z4»)
      descripcion: form.nombre?.trim() || nombrePorDefecto(form.disciplina, form.bloques),
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

  // Guarda (o quita) el plan de nutrición de la sesión sid. No bloquea: si
  // falla, la sesión ya está guardada y se avisa. Devuelve true si fue bien.
  async function guardarNutri(sid) {
    if (!nutriDisponible || !nutriSucio) return true
    try {
      const fila = normalizarNutricion(nutri)
      const habia = !!sessionExistente?.id && tienePlan(nutricionExistente)
      if (fila) await guardarNutricion(sid, athleteId, coachId, fila)
      else if (habia) await quitarParte(sid, athleteId, coachId, nutricionExistente, 'plan')
      setNutriSucio(false)
      return true
    } catch {
      return false
    }
  }

  function validar() {
    if (!form.fecha) return 'Elige el día'
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
    if (res.ok) {
      // Reenvío: el evento anterior era de la fecha que tenía la sesión al abrirla
      const aviso = avisoEventoAntiguo(json, sessionExistente?.fecha, 'coach')
      setAvisoReloj(aviso)
      return aviso ? 'aviso' : true
    }
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
      const nutriOk = await guardarNutri(sid)
      if (!nutriOk) {
        setError('Sesión guardada, pero no se pudo guardar la nutrición. Vuelve a intentarlo.')
        if (onSaved) onSaved({ cerrar: false })
        return
      }
      if (yaEnviada) {
        const ok = await enviarAlReloj(sid)
        if (ok === 'aviso') {
          if (onSaved) onSaved({ cerrar: false })
          return
        }
        if (!ok) {
          // Guardado, pero el reloj sigue con la versión anterior: no cerrar,
          // que el coach lo vea. La lista la mostrará como pendiente de envío.
          setError('Cambios guardados, pero no se pudo actualizar el reloj. Queda pendiente de enviar.')
          if (onSaved) onSaved({ cerrar: false })
          return
        }
      }
      if (onSaved) onSaved({ cerrar: true })
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
      const nutriOk = await guardarNutri(sid)
      // coach/atleta se derivan de la sesión y del JWT en el backend
      const ok = await enviarAlReloj(sid)
      if (!ok) {
        // La sesión SÍ quedó guardada: refrescar la lista sin cerrar, para que
        // el coach vea el error y pueda reintentar.
        if (onSaved) onSaved({ cerrar: false })
        return
      }
      setExitoGarmin(true)
      if (!nutriOk) setError('Enviada, pero no se pudo guardar la nutrición. Vuelve a intentarlo.')
      // Todo bien → se cierra; con algún aviso se queda abierto para leerlo.
      if (onSaved) onSaved({ cerrar: nutriOk && ok !== 'aviso' })
    } catch {
      setError('Error de conexión enviando a Garmin')
    } finally {
      setEnviando(false)
    }
  }

  // Sugerencia de nutrición con lo que lleva el formulario ahora mismo
  const sugerenciaNutri = form.disciplina
    ? sugerirNutricion({ disciplina: form.disciplina, workout_steps: { bloques: form.bloques }, duracion_min: duracionFinal })
    : null

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
                    onClick={() => {
                      if (form.disciplina !== d.value) setAbiertos(new Set())
                      setForm((prev) => (prev.disciplina === d.value ? prev : { ...prev, disciplina: d.value, bloques: [] }))
                    }}
                    style={chipDisciplinaStyle(sel, DISCIPLINE_COLORS[d.value], { bloqueado: !!bloqueo })}
                  >
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
                <Icon name="chevronDown" size={13} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4, transform: mostrarInputFecha ? 'rotate(180deg)' : 'none' }} />{mostrarInputFecha ? 'Ocultar' : 'Otra fecha'}
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
                  {form.fecha === ahora.fecha && horasPosibles(disponibilidad, form.fecha, form.disciplina, duracionAviso, null).length > 0
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
                  <Icon name="chevronDown" size={13} style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4, transform: mostrarInputHora ? 'rotate(180deg)' : 'none' }} />{mostrarInputHora ? 'Ocultar' : 'Otra hora'}
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
            <label style={sectionLabel}>Nombre <span style={{ fontWeight: 400, color: COLORS.textTertiary }}>(opcional)</span></label>
            {/* Opcional: si se deja vacío se guarda el propuesto (el placeholder) */}
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder={nombrePorDefecto(form.disciplina, form.bloques)}
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
            onBloques={(bloques, nombrePlantilla) => {
              setAbiertos(new Set())
              setForm((prev) => ({ ...prev, bloques, nombre: prev.nombre?.trim() ? prev.nombre : nombrePlantilla || prev.nombre }))
            }}
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
                abierto={abiertos.has(idx)}
                onToggle={() => alternarBloque(idx)}
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
                abierto={abiertos.has(idx)}
                onToggle={() => alternarBloque(idx)}
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

          {/* Así llega al reloj: el perfil de intensidad (como lo dibuja el
              reloj) y, si se quiere, el texto exacto. Antes el texto iba
              siempre abierto en un bloque de código. */}
          {(preview || adjunto) && (
            <div style={{ marginBottom: 16 }}>
              <div style={separadorSection}>
                Así llega al reloj
                {duracionFinal != null ? (
                  <span style={{ marginLeft: 8, fontFamily: FONTS.mono, color: COLORS.textPrimary }}>· {duracionFinal} min</span>
                ) : duracionAviso != null && (
                  <span title="Estimada con los ritmos de cada paso" style={{ marginLeft: 8, fontFamily: FONTS.mono, color: COLORS.textSecondary }}>· ~{duracionAviso} min</span>
                )}
              </div>
              {form.bloques.length > 0 && <Perfil bloques={form.bloques} disciplina={form.disciplina} />}
              <button type="button" onClick={() => setVerTexto((v) => !v)} aria-expanded={verTexto} style={{ background: 'transparent', border: 'none', padding: 0, color: COLORS.textSecondary, fontSize: 12, cursor: 'pointer', fontFamily: FONTS.sans, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="chevronDown" size={14} style={{ transform: verTexto ? 'rotate(180deg)' : 'none' }} />
                {verTexto ? 'Ocultar el texto' : 'Ver el texto que recibe el reloj'}
              </button>
              {verTexto && (
                <pre
                  style={{
                    background: COLORS.background,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 12,
                    color: COLORS.textSecondary,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: FONTS.mono,
                    margin: '8px 0 0',
                  }}
                >
                  {preview || `Fuerza · ${form.nombre?.trim() || nombrePorDefecto(form.disciplina, form.bloques)}${duracionFinal ? ` · ${duracionFinal} min` : ''}
(el detalle lo ve en la app)`}
                </pre>
              )}
              {usaZonaNatacion(form.bloques, form.disciplina) && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textTertiary, lineHeight: 1.45 }}>
                  La zona de natación se manda como zona de ritmo: necesita el ritmo umbral de natación
                  configurado en Intervals. Si el atleta no lo tiene, usa ritmo /100m.
                </p>
              )}
            </div>
          )}

          {/* Más opciones: notas y nutrición. Plegado, salvo que ya tengan algo */}
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setMasAbierto((v) => !v)}
              aria-expanded={masAbierto}
              style={{ ...separadorSection, display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${COLORS.cardBorder}`, cursor: 'pointer', padding: '0 0 6px', textAlign: 'left', fontFamily: FONTS.sans }}
            >
              <Icon name="chevronDown" size={15} style={{ transform: masAbierto ? 'rotate(180deg)' : 'none' }} />
              Más opciones
              {!masAbierto && (
                <span style={{ fontWeight: 400, fontSize: 12, color: COLORS.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  · {[form.notas?.trim() ? 'Notas' : null, normalizarNutricion(nutri) ? `Nutrición ${resumenNutricion(normalizarNutricion(nutri)) || 'con notas'}` : null].filter(Boolean).join(' · ') || 'notas y nutrición'}
                </span>
              )}
            </button>
            {masAbierto && (
              <div style={{ paddingTop: 4 }}>
                <label style={{ ...sectionLabel, marginTop: 4 }}>Notas para el atleta</label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm((prev) => ({ ...prev, notas: e.target.value }))}
                  rows={3}
                  placeholder="Indicaciones técnicas, material extra..."
                  style={{ ...inputStyle, width: '100%', resize: 'vertical', marginBottom: 16 }}
                />
                {/* Nutrición (opcional): se ve en la app, no va al reloj. Dentro de
                    "Más opciones" ya no lleva su propio plegable (eran dos clics). */}
                {nutriDisponible && form.disciplina !== 'other' && (
                  <div style={{ marginBottom: 4 }}>
                    <label style={sectionLabel}>Nutrición</label>
                    <CamposPlanNutricion
                      form={nutri}
                      onCambiar={(campo, valor) => {
                        setNutri((f) => ({ ...f, [campo]: valor }))
                        setNutriSucio(true)
                      }}
                      sugerencia={sugerenciaNutri}
                      onUsarSugerencia={() => {
                        setNutri((f) => aplicarSugerencia(f, sugerenciaNutri))
                        setNutriSucio(true)
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

            </>
          )}
        </div>

        {/* Pie fijo: avisos y botones siempre a la vista. Antes estaban al final
            del contenido y había que bajar todo el formulario para guardar. */}
        {form.disciplina && (
          <div style={{ borderTop: `1px solid ${COLORS.cardBorder}`, padding: '12px 24px calc(12px + env(safe-area-inset-bottom))', background: COLORS.card, maxHeight: '45dvh', overflowY: 'auto' }}>
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

            {avisoReloj && <Aviso style={{ marginBottom: 12 }}>{avisoReloj}</Aviso>}

            {error && !errorIntervals && (
              <p style={{ color: COLORS.error, fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}

            {/* Botones principales */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleGuardar}
                disabled={guardando || enviando}
                style={{
                  flex: 1,
                  background: 'transparent',
                  // Ink, no Mist: en gris parecía un botón deshabilitado
                  color: COLORS.textPrimary,
                  border: '1px solid #2A3040',
                  borderRadius: 8,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: guardando ? 'wait' : 'pointer',
                  fontFamily: "'Archivo', sans-serif",
                  opacity: guardando || enviando ? 0.6 : 1,
                }}
              >
                {guardando ? (yaEnviada ? 'Actualizando reloj...' : 'Guardando...') : yaEnviada ? 'Guardar y actualizar reloj' : 'Guardar sin enviar'}
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
          </div>
        )}
      </div>
    </>
  )
}
