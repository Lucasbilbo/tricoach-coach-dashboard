// Editor de disponibilidad del atleta: plantilla semanal por disciplina (con
// límite de minutos o "sin límite") y excepciones por fecha. Solo el atleta lo
// ve y edita; el coach la lee en su panel (lotes C y D).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS, buttonStyle, cardStyle, ghostButtonStyle, inputStyle } from '../lib/theme'
import { SectionTitle } from './ui/Layout'
import { hoyMadrid } from '../lib/chartUtils'
import {
  DISCIPLINAS_DISPONIBILIDAD, cambiosPlantilla, claveCelda, filasExcepcion, plantillaAEstado,
} from '../lib/disponibilidad'
import { borrarExcepcion, cargarDisponibilidad, guardarExcepcion, guardarPlantilla } from '../lib/disponibilidadApi'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MINUTOS = [20, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
const SIN_LIMITE = 'sin'

function etiquetaMin(m) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

function formatFecha(fecha) {
  const [y, m, d] = fecha.split('-').map(Number)
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][dia]} ${d}/${m}`
}

function SelectorLimite({ valor, onChange, etiqueta }) {
  const opciones = MINUTOS.includes(valor) || valor === null ? MINUTOS : [...MINUTOS, valor].sort((a, b) => a - b)
  return (
    <select
      aria-label={etiqueta}
      value={valor === null ? SIN_LIMITE : String(valor)}
      onChange={(e) => onChange(e.target.value === SIN_LIMITE ? null : Number(e.target.value))}
      style={{ ...inputStyle, width: 'auto', padding: '6px 8px', fontSize: 12, fontFamily: FONTS.mono }}
    >
      <option value={SIN_LIMITE}>Sin límite</option>
      {opciones.map((m) => <option key={m} value={m}>{etiquetaMin(m)}</option>)}
    </select>
  )
}

// Fila "disciplina on/off + límite" reutilizada por la plantilla y las excepciones.
function ChipDisciplina({ disciplina, activa, max, onToggle, onMax, etiquetaDia }) {
  const color = DISCIPLINE_COLORS[disciplina]
  const nombre = DISCIPLINE_LABELS[disciplina]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={activa}
        aria-label={`${nombre}${etiquetaDia ? ` ${etiquetaDia}` : ''}`}
        style={{
          padding: '6px 12px', borderRadius: 999, fontSize: 13, fontFamily: FONTS.sans, cursor: 'pointer',
          border: `1px solid ${activa ? color : COLORS.cardBorder}`,
          background: activa ? `${color}22` : 'transparent',
          color: activa ? COLORS.textPrimary : COLORS.textSecondary,
          fontWeight: activa ? 600 : 400,
        }}
      >
        {nombre}
      </button>
      {activa && <SelectorLimite valor={max} onChange={onMax} etiqueta={`Límite de ${nombre}${etiquetaDia ? ` ${etiquetaDia}` : ''}`} />}
    </div>
  )
}

export default function DisponibilidadEditor({ athleteId }) {
  const [guardada, setGuardada] = useState({ plantilla: [], excepciones: [] })
  const [estado, setEstado] = useState({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')

  const recargar = useCallback(async () => {
    const datos = await cargarDisponibilidad(athleteId)
    setGuardada(datos)
    setEstado(plantillaAEstado(datos.plantilla))
  }, [athleteId])

  useEffect(() => {
    let activo = true
    cargarDisponibilidad(athleteId)
      .then((datos) => {
        if (!activo) return
        setGuardada(datos)
        setEstado(plantillaAEstado(datos.plantilla))
      })
      .catch((e) => activo && setError(e?.message || 'No se pudo cargar tu disponibilidad'))
      .finally(() => activo && setCargando(false))
    return () => { activo = false }
  }, [athleteId])

  const cambios = useMemo(() => cambiosPlantilla(guardada.plantilla, estado), [guardada.plantilla, estado])
  const hayCambios = cambios.upsert.length + cambios.borrar.length > 0
  const configurada = guardada.plantilla.length > 0

  function alternar(dia, disciplina) {
    setAviso('')
    setEstado((prev) => {
      const k = claveCelda(dia, disciplina)
      const sig = { ...prev }
      if (sig[k]) delete sig[k]; else sig[k] = { max: null }
      return sig
    })
  }
  function fijarMax(dia, disciplina, max) {
    setEstado((prev) => ({ ...prev, [claveCelda(dia, disciplina)]: { max } }))
  }

  async function guardar() {
    setGuardando(true); setError(''); setAviso('')
    try {
      await guardarPlantilla(athleteId, cambios)
      await recargar()
      setAviso('Guardado. Tu entrenador ya ve estos cambios.')
    } catch (e) {
      setError(e?.message || 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  // ── Excepciones ───────────────────────────────────────────────────────
  const hoy = hoyMadrid()
  const [fechaEx, setFechaEx] = useState('')
  const [tipoEx, setTipoEx] = useState('no_disponible')
  const [discEx, setDiscEx] = useState({})
  const [notaEx, setNotaEx] = useState('')
  const [guardandoEx, setGuardandoEx] = useState(false)

  const filasNuevas = filasExcepcion({ fecha: fechaEx, tipo: tipoEx, disciplinas: discEx, nota: notaEx })
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
      setFechaEx(''); setDiscEx({}); setNotaEx('')
      setAviso('Excepción guardada.')
    } catch (e) {
      setError(e?.message || 'No se pudo guardar la excepción')
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
        <p style={{ color: COLORS.textSecondary, fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
          Marca qué puedes entrenar cada día y cuánto tiempo, por disciplina. «Sin límite» = tienes el tiempo que haga falta.
          {!configurada && ' Mientras no marques nada, tu entrenador no recibe ningún aviso.'}
        </p>
        <div style={{ ...cardStyle, padding: 0 }}>
          {DIAS.map((nombre, i) => {
            const dia = i + 1
            return (
              <div key={dia} style={{
                display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '12px 16px',
                borderTop: i === 0 ? 'none' : `1px solid ${COLORS.cardBorder}`,
              }}>
                <div style={{ width: 84, fontSize: 14, fontWeight: 600 }}>{nombre}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                  {DISCIPLINAS_DISPONIBILIDAD.map((d) => {
                    const celda = estado[claveCelda(dia, d)]
                    return (
                      <ChipDisciplina
                        key={d}
                        disciplina={d}
                        etiquetaDia={nombre}
                        activa={!!celda}
                        max={celda ? celda.max : null}
                        onToggle={() => alternar(dia, d)}
                        onMax={(m) => fijarMax(dia, d, m)}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <button onClick={guardar} disabled={!hayCambios || guardando} style={{ ...buttonStyle, opacity: !hayCambios || guardando ? 0.5 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar semana'}
          </button>
          {hayCambios && (
            <button onClick={() => setEstado(plantillaAEstado(guardada.plantilla))} disabled={guardando} style={ghostButtonStyle}>
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
          Un viaje, una cena, un día corto… La excepción sustituye a tu semana tipo ese día entero.
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
                    ? 'Día libre'
                    : filas.map((f) => `${DISCIPLINE_LABELS[f.disciplina]} ${f.max_minutos == null ? '(sin límite)' : `≤ ${etiquetaMin(f.max_minutos)}`}`).join(' · ')}
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
              type="date" aria-label="Fecha de la excepción" min={hoy} value={fechaEx}
              onChange={(e) => setFechaEx(e.target.value)}
              style={{ ...inputStyle, width: 'auto', fontFamily: FONTS.mono }}
            />
            <select aria-label="Tipo de excepción" value={tipoEx} onChange={(e) => setTipoEx(e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
              <option value="no_disponible">No puedo entrenar</option>
              <option value="limitada">Solo puedo…</option>
            </select>
          </div>
          {tipoEx === 'limitada' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {DISCIPLINAS_DISPONIBILIDAD.map((d) => (
                <ChipDisciplina
                  key={d}
                  disciplina={d}
                  activa={Object.prototype.hasOwnProperty.call(discEx, d)}
                  max={discEx[d] ?? null}
                  onToggle={() => setDiscEx((p) => {
                    const s = { ...p }
                    if (Object.prototype.hasOwnProperty.call(s, d)) delete s[d]; else s[d] = null
                    return s
                  })}
                  onMax={(m) => setDiscEx((p) => ({ ...p, [d]: m }))}
                />
              ))}
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
