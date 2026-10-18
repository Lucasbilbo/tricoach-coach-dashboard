// Editor de disponibilidad del atleta: calendario semanal donde marcas, con dos
// toques (inicio y fin), a qué horas puedes nadar, ir en bici, correr o hacer
// fuerza. Más «días especiales» (viaje, día corto…). Solo el atleta lo edita; el
// coach lo ve en su panel.
import { useEffect, useMemo, useState } from 'react'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS, buttonStyle, cardStyle, ghostButtonStyle, inputStyle } from '../lib/theme'
import { SectionTitle } from './ui/Layout'
import { hoyMadrid } from '../lib/chartUtils'
import {
  DISCIPLINAS_DISPONIBILIDAD, MIN_POR_SLOT, claveSlot, filasExcepcion, formatHora, formatTramo, mismaPlantilla,
  pintarRango, slotsAVentanas, ventanasASlots,
} from '../lib/disponibilidad'
import { borrarExcepcion, cargarDisponibilidad, guardarExcepcion, guardarPlantilla } from '../lib/disponibilidadApi'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const INICIAL = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const SLOT_PRIMERO = 10 // 5:00
const SLOT_ULTIMO = 45 // 22:30–23:00
const SLOTS_VISIBLES = Array.from({ length: SLOT_ULTIMO - SLOT_PRIMERO + 1 }, (_, i) => SLOT_PRIMERO + i)
const BORRAR = 'borrar'
const HORAS_OPCIONES = Array.from({ length: (23 - 5) * 2 + 1 }, (_, i) => (5 * 60) + i * MIN_POR_SLOT) // 5:00 … 23:00

function formatFecha(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][dia]} ${d}/${m}`
}

// Fondo de una celda con una o varias disciplinas (franjas verticales).
function fondoCelda(discs) {
  if (discs.length === 0) return 'transparent'
  if (discs.length === 1) return `${DISCIPLINE_COLORS[discs[0]]}CC`
  const paso = 100 / discs.length
  return `linear-gradient(90deg, ${discs.map((d, i) => `${DISCIPLINE_COLORS[d]}CC ${i * paso}% ${(i + 1) * paso}%`).join(', ')})`
}

function BotonPincel({ clave, activo, onClick }) {
  const color = clave === BORRAR ? COLORS.textSecondary : DISCIPLINE_COLORS[clave]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      style={{
        padding: '7px 14px', borderRadius: 999, fontSize: 13, fontFamily: FONTS.sans, cursor: 'pointer',
        border: `1px solid ${activo ? color : COLORS.cardBorder}`,
        background: activo ? (clave === BORRAR ? COLORS.cardBorder : `${color}33`) : 'transparent',
        color: activo ? COLORS.textPrimary : COLORS.textSecondary, fontWeight: activo ? 600 : 400,
      }}
    >
      {clave === BORRAR ? 'Borrar' : DISCIPLINE_LABELS[clave]}
    </button>
  )
}

function SelectHora({ valor, onChange, etiqueta }) {
  return (
    <select aria-label={etiqueta} value={valor} onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...inputStyle, width: 'auto', padding: '8px 10px', fontFamily: FONTS.mono }}>
      {HORAS_OPCIONES.map((m) => <option key={m} value={m}>{formatHora(m)}</option>)}
    </select>
  )
}

export default function DisponibilidadEditor({ athleteId }) {
  const [guardada, setGuardada] = useState({ plantilla: [], excepciones: [] })
  const [slots, setSlots] = useState(() => new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [pincel, setPincel] = useState('swim')
  const [ancla, setAncla] = useState(null) // { dia, slot } del primer toque

  useEffect(() => {
    let activo = true
    cargarDisponibilidad(athleteId)
      .then((datos) => {
        if (!activo) return
        setGuardada(datos)
        setSlots(ventanasASlots(datos.plantilla))
      })
      .catch((e) => activo && setError(e?.message || 'No se pudo cargar tu disponibilidad'))
      .finally(() => activo && setCargando(false))
    return () => { activo = false }
  }, [athleteId])

  async function recargar() {
    const datos = await cargarDisponibilidad(athleteId)
    setGuardada(datos)
    setSlots(ventanasASlots(datos.plantilla))
    return datos
  }

  const hayCambios = !mismaPlantilla(guardada.plantilla, slots)
  const configurada = guardada.plantilla.length > 0

  function tocarCelda(dia, slot) {
    setAviso('')
    if (!ancla || ancla.dia !== dia) {
      setAncla({ dia, slot })
      return
    }
    setSlots((prev) => (pincel === BORRAR
      ? pintarRango(prev, dia, ancla.slot, slot, null, true)
      : pintarRango(prev, dia, ancla.slot, slot, pincel)))
    setAncla(null)
  }

  async function guardar() {
    setGuardando(true); setError(''); setAviso('')
    try {
      await guardarPlantilla(athleteId, slotsAVentanas(slots), guardada.plantilla.map((f) => f.id))
      await recargar()
      setAncla(null)
      setAviso('Guardado. Tu entrenador ya ve tus horas.')
    } catch (e) {
      setError(e?.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  // ── Días especiales ───────────────────────────────────────────────────
  const hoy = hoyMadrid()
  const [fechaEx, setFechaEx] = useState('')
  const [tipoEx, setTipoEx] = useState('no_disponible')
  const [tramosEx, setTramosEx] = useState([])
  const [nuevoTramo, setNuevoTramo] = useState({ disciplina: 'run', inicio_min: 18 * 60, fin_min: 19 * 60 })
  const [notaEx, setNotaEx] = useState('')
  const [guardandoEx, setGuardandoEx] = useState(false)

  const filasNuevas = filasExcepcion({ fecha: fechaEx, tipo: tipoEx, tramos: tramosEx, nota: notaEx })
  const tramoValido = nuevoTramo.fin_min > nuevoTramo.inicio_min
  const proximas = useMemo(() => {
    const porFecha = new Map()
    for (const e of guardada.excepciones) {
      if (e.fecha < hoy) continue
      if (!porFecha.has(e.fecha)) porFecha.set(e.fecha, [])
      porFecha.get(e.fecha).push(e)
    }
    return [...porFecha.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
  }, [guardada.excepciones, hoy])

  async function anadirExcepcion() {
    setGuardandoEx(true); setError(''); setAviso('')
    try {
      await guardarExcepcion(athleteId, fechaEx, filasNuevas)
      await recargar()
      setFechaEx(''); setTramosEx([]); setNotaEx('')
      setAviso('Día especial guardado.')
    } catch (e) {
      setError(e?.message || 'No se pudo guardar el día especial')
    } finally {
      setGuardandoEx(false)
    }
  }
  async function quitarExcepcion(fecha) {
    setError(''); setAviso('')
    try {
      await borrarExcepcion(athleteId, fecha)
      await recargar()
    } catch (e) {
      setError(e?.message || 'No se pudo borrar')
    }
  }

  if (cargando) return <p style={{ color: COLORS.textSecondary }}>Cargando tu disponibilidad…</p>

  return (
    <>
      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Tu semana tipo</SectionTitle>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
          Elige una disciplina y toca la hora de inicio y la de fin en el día que quieras.
          {!configurada && ' Mientras no marques nada, tu entrenador no recibe ningún aviso.'}
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {DISCIPLINAS_DISPONIBILIDAD.map((d) => <BotonPincel key={d} clave={d} activo={pincel === d} onClick={() => { setPincel(d); setAncla(null) }} />)}
          <BotonPincel clave={BORRAR} activo={pincel === BORRAR} onClick={() => { setPincel(BORRAR); setAncla(null) }} />
        </div>
        <p role="status" style={{ fontSize: 12, margin: '0 0 8px', minHeight: 18, color: ancla ? COLORS.accent : COLORS.textTertiary }}>
          {ancla
            ? `${DIAS[ancla.dia - 1]} desde ${formatHora(ancla.slot * MIN_POR_SLOT)}: toca la hora donde termina (en el mismo día).`
            : 'Toca la hora donde empieza.'}
        </p>

        <div style={{ ...cardStyle, padding: 8, overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(7, minmax(40px, 1fr))', gap: 2, minWidth: 340 }}>
            <div />
            {INICIAL.map((l, i) => (
              <div key={l} title={DIAS[i]} style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, padding: '4px 0' }}>{l}</div>
            ))}
            {SLOTS_VISIBLES.map((slot) => (
              <Fila key={slot} slot={slot} slots={slots} ancla={ancla} onTocar={tocarCelda} />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={guardar} disabled={!hayCambios || guardando} style={{ ...buttonStyle, opacity: !hayCambios || guardando ? 0.5 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar semana'}
          </button>
          {hayCambios && (
            <button onClick={() => { setSlots(ventanasASlots(guardada.plantilla)); setAncla(null) }} disabled={guardando} style={ghostButtonStyle}>
              Descartar cambios
            </button>
          )}
          {hayCambios && <span style={{ fontSize: 12, color: COLORS.textSecondary }}>Cambios sin guardar</span>}
        </div>
        {error && <p role="alert" style={{ color: COLORS.error, fontSize: 13, marginTop: 10 }}>{error}</p>}
        {aviso && <p role="status" style={{ color: COLORS.accent, fontSize: 13, marginTop: 10 }}>{aviso}</p>}
      </section>

      <section style={{ marginBottom: 32 }}>
        <SectionTitle>Días especiales</SectionTitle>
        <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          Un viaje, una cena, un día corto… Ese día manda lo que pongas aquí en vez de tu semana tipo.
        </p>

        {proximas.length > 0 && (
          <div style={{ ...cardStyle, padding: 0, marginBottom: 14 }}>
            {proximas.map(([fecha, filas], i) => (
              <div key={fecha} style={{
                display: 'flex', gap: 12, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap',
                borderTop: i === 0 ? 'none' : `1px solid ${COLORS.cardBorder}`,
              }}>
                <div style={{ width: 84, fontFamily: FONTS.mono, fontSize: 13 }}>{formatFecha(fecha)}</div>
                <div style={{ flex: 1, fontSize: 13, color: COLORS.textSecondary }}>
                  {filas[0].tipo === 'no_disponible'
                    ? 'No puedo entrenar'
                    : filas.map((f) => `${DISCIPLINE_LABELS[f.disciplina]} ${formatTramo(f)}`).join(' · ')}
                  {filas.find((f) => f.nota)?.nota ? ` — ${filas.find((f) => f.nota).nota}` : ''}
                </div>
                <button onClick={() => quitarExcepcion(fecha)} style={{ ...ghostButtonStyle, padding: '6px 10px', fontSize: 12 }}>Quitar</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ ...cardStyle, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="date" aria-label="Fecha del día especial" min={hoy} value={fechaEx}
              onChange={(e) => setFechaEx(e.target.value)}
              style={{ ...inputStyle, width: 'auto', fontFamily: FONTS.mono }}
            />
            <select aria-label="Tipo de día especial" value={tipoEx} onChange={(e) => setTipoEx(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="no_disponible">No puedo entrenar</option>
              <option value="limitada">Solo puedo a estas horas…</option>
            </select>
          </div>

          {tipoEx === 'limitada' && (
            <div style={{ display: 'grid', gap: 10 }}>
              {tramosEx.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {tramosEx.map((t, i) => (
                    <button key={`${t.disciplina}-${t.inicio_min}-${i}`} type="button"
                      onClick={() => setTramosEx((p) => p.filter((_, j) => j !== i))}
                      aria-label={`Quitar ${DISCIPLINE_LABELS[t.disciplina]} ${formatTramo(t)}`}
                      style={{ ...ghostButtonStyle, padding: '5px 10px', fontSize: 12, borderColor: DISCIPLINE_COLORS[t.disciplina] }}>
                      {DISCIPLINE_LABELS[t.disciplina]} {formatTramo(t)} ✕
                    </button>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select aria-label="Disciplina del tramo" value={nuevoTramo.disciplina}
                  onChange={(e) => setNuevoTramo((p) => ({ ...p, disciplina: e.target.value }))}
                  style={{ ...inputStyle, width: 'auto' }}>
                  {DISCIPLINAS_DISPONIBILIDAD.map((d) => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}
                </select>
                <span style={{ fontSize: 13, color: COLORS.textSecondary }}>de</span>
                <SelectHora valor={nuevoTramo.inicio_min} etiqueta="Hora de inicio" onChange={(v) => setNuevoTramo((p) => ({ ...p, inicio_min: v }))} />
                <span style={{ fontSize: 13, color: COLORS.textSecondary }}>a</span>
                <SelectHora valor={nuevoTramo.fin_min} etiqueta="Hora de fin" onChange={(v) => setNuevoTramo((p) => ({ ...p, fin_min: v }))} />
                <button type="button" disabled={!tramoValido} onClick={() => setTramosEx((p) => [...p, nuevoTramo])}
                  style={{ ...ghostButtonStyle, opacity: tramoValido ? 1 : 0.5 }}>
                  Añadir tramo
                </button>
              </div>
            </div>
          )}

          <input
            type="text" maxLength={200} placeholder="Nota para tu entrenador (opcional)" aria-label="Nota"
            value={notaEx} onChange={(e) => setNotaEx(e.target.value)} style={inputStyle}
          />
          <div>
            <button onClick={anadirExcepcion} disabled={filasNuevas.length === 0 || guardandoEx}
              style={{ ...buttonStyle, opacity: filasNuevas.length === 0 || guardandoEx ? 0.5 : 1 }}>
              {guardandoEx ? 'Guardando…' : 'Añadir día especial'}
            </button>
          </div>
        </div>
      </section>
    </>
  )
}

// Una fila del calendario: etiqueta de hora (solo en punto) + 7 celdas.
function Fila({ slot, slots, ancla, onTocar }) {
  const enPunto = slot % 2 === 0
  return (
    <>
      <div style={{ fontSize: 10, fontFamily: FONTS.mono, color: COLORS.textTertiary, textAlign: 'right', paddingRight: 4, lineHeight: '20px' }}>
        {enPunto ? formatHora(slot * MIN_POR_SLOT) : ''}
      </div>
      {DIAS.map((nombre, i) => {
        const dia = i + 1
        const discs = DISCIPLINAS_DISPONIBILIDAD.filter((d) => slots.has(claveSlot(dia, slot, d)))
        const esAncla = ancla && ancla.dia === dia && ancla.slot === slot
        return (
          <button
            key={dia}
            type="button"
            onClick={() => onTocar(dia, slot)}
            aria-label={`${nombre} ${formatHora(slot * MIN_POR_SLOT)}${discs.length ? `, ${discs.map((d) => DISCIPLINE_LABELS[d]).join(' y ')}` : ''}`}
            style={{
              height: 20, padding: 0, cursor: 'pointer', borderRadius: 3,
              border: esAncla ? `2px solid ${COLORS.textPrimary}` : `1px solid ${enPunto ? COLORS.cardBorder : 'transparent'}`,
              borderBottomColor: COLORS.cardBorder,
              background: fondoCelda(discs),
            }}
          />
        )
      })}
    </>
  )
}
