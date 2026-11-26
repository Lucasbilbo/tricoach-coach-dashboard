// Nutrición durante una sesión: línea plegable + editores. La usan el coach
// (SessionsList) y el atleta (/home). Datos en sesion_nutricion (migración
// 017); lógica pura en lib/nutricion.js.
//
// - PLAN (productos de la despensa del atleta + cómo tomarlo): lo editan los dos,
//   sin sugerencias automáticas (decidido 2026-11-19: lo rellena Jon). Los g/h
//   se calculan con la duración de la sesión.
//   En sesiones pasadas el atleta lo ve, no lo edita (ya no tiene sentido).
// - LO TOMADO (+ qué tal le sentó): lo apunta el atleta desde el día de la
//   sesión; Jon lo ve al lado del plan, con aviso si le sentó mal o comió
//   bastante menos de lo previsto.
//
// NO se envía al reloj: la descripción del evento de Intervals es el texto del
// workout y cualquier texto libre ahí puede romper el parseo o congelar el reloj
// (misma regla que las notas del entrenador). Se ve en la app.
import { useRef, useState } from 'react'
import { COLORS, FONTS, buttonStyle, ghostButtonStyle, inputStyle } from '../lib/theme'
import { hoyMadrid } from '../lib/chartUtils'
import {
  ESTOMAGO, LIMITE_NOTAS_TOMADO, LIMITES, avisoTomado, formPlanDe, normalizarNutricion,
  normalizarTomado, nutricionEfectiva, resumenPlan, resumenTomado, tienePlan, tieneTomado,
} from '../lib/nutricion'
import { itemsDe, normalizarClaves, tomadasValidas, textoReceta, tonicidadBidon, unidadesOrdenadas } from '../lib/productosNutricion'
import { duracionPrevista } from '../lib/tssPrevisto'
import { guardarNutricion, quitarParte } from '../lib/nutricionApi'
import Icon from './ui/Icon'
import PlanProductos, { LineaTiempo, PistaTiempo } from './PlanProductos'

const etiqueta = { fontSize: 13.5, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }
const subtitulo = { fontSize: 17, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }


const CAMPOS_TOMADO_UI = [
  { campo: 'tomado_carbohidratos_g_h', label: 'Hidratos', unidad: 'g/h', paso: 5, max: LIMITES.carbohidratos_g_h },
  { campo: 'tomado_liquido_ml_h', label: 'Líquido', unidad: 'ml/h', paso: 50, max: LIMITES.liquido_ml_h },
]

const formTomadoDe = (n) => ({
  tomado_carbohidratos_g_h: n?.tomado_carbohidratos_g_h ?? '',
  tomado_liquido_ml_h: n?.tomado_liquido_ml_h ?? '',
  estomago: n?.estomago ?? null,
  tomado_items: n?.tomado_items ?? null,
  tomado_notas: n?.tomado_notas ?? '',
})

// Lista de lo que lleva el plan, en orden: el atleta toca cada cosa al tomársela.
// Un toque = marcada/desmarcada y guardada (sin botón). Bidón: al terminarlo.
// Arriba, el avance y la pista de la sesión con lo tomado en teal; la primera
// pendiente va marcada como «Siguiente».
function ChecklistTomado({ unidades, marcadas, onAlternar, minutos }) {
  const hechas = unidades.filter((u) => marcadas.has(u.clave)).length
  const siguiente = unidades.find((u) => !marcadas.has(u.clave))?.clave
  const pct = unidades.length ? Math.round((hechas / unidades.length) * 100) : 0
  const puntos = unidades.filter((u) => u.min != null).map((u) => ({ min: u.min, nombre: u.nombre, on: marcadas.has(u.clave) }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14.5, color: COLORS.textSecondary }}>Toca lo que te vayas tomando</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{hechas} de {unidades.length}</span>
      </div>
      <div aria-hidden="true" style={{ height: 6, borderRadius: 3, background: COLORS.cardBorder, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: COLORS.accent, transition: 'width 200ms ease' }} />
      </div>
      {puntos.length > 1 && <PistaTiempo puntos={puntos} minutos={minutos} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {unidades.map((u) => {
          const on = marcadas.has(u.clave)
          const esSiguiente = u.clave === siguiente
          return (
            <button
              key={u.clave}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => onAlternar(u.clave)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56, padding: '8px 14px', textAlign: 'left',
                borderRadius: 16, cursor: 'pointer', fontSize: 16, border: 'none',
                background: on ? 'rgba(47,191,175,0.10)' : COLORS.sunken,
                boxShadow: esSiguiente ? `inset 0 0 0 1.5px ${COLORS.textSoft}` : 'none',
                color: on ? COLORS.textSoft : COLORS.textPrimary,
              }}
            >
              <span style={{
                width: 28, height: 28, flexShrink: 0, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: on ? 'none' : `inset 0 0 0 2px ${COLORS.textTertiary}`, background: on ? COLORS.accent : 'transparent', color: COLORS.onAccent,
              }}>
                {on && <Icon name="check" size={16} strokeWidth={3} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3, fontWeight: on ? 500 : 600, textDecoration: on ? 'line-through' : 'none', textDecorationColor: 'rgba(201,204,214,0.5)' }}>{u.nombre}</span>
              {esSiguiente && <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.textSoft }}>Siguiente</span>}
              {u.min != null && <span style={{ minWidth: 54, textAlign: 'right', fontSize: 14, fontWeight: 600, color: on ? COLORS.textTertiary : COLORS.textSoft }}>min {u.min}</span>}
            </button>
          )
        })}
      </div>
      {unidades.some((u) => u.tipo === 'bidon') && (
        <p style={{ margin: 0, fontSize: 13.5, color: COLORS.textTertiary }}>El bidón, márcalo cuando lo termines.</p>
      )}
    </div>
  )
}

function CamposNumero({ campos, form, onCambiar }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${campos.length}, minmax(0, 1fr))`, gap: 8 }}>
      {campos.map(({ campo, label, unidad, paso, max }) => (
        <label key={campo} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={etiqueta}>
            {label} <span style={{ fontWeight: 500 }}>{unidad}</span>
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            step={paso}
            value={form[campo]}
            onChange={(e) => onCambiar(campo, e.target.value)}
            style={{ ...inputStyle, fontWeight: 600 }}
          />
        </label>
      ))}
    </div>
  )
}

// Campos del PLAN: productos de la despensa del atleta + cómo tomarlo, en
// blanco para que los rellene el coach. Compartido con el creador de sesiones
// (WorkoutBuilder).
export function CamposPlanNutricion({ athleteId, form, onCambiar, minutos, puedeEditarDespensa = false }) {
  return <PlanProductos athleteId={athleteId} form={form} onCambiar={onCambiar} minutos={minutos} puedeEditarDespensa={puedeEditarDespensa} />
}

function Botonera({ puedeGuardar, guardando, onGuardar, textoGuardar, onQuitar, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onGuardar}
        disabled={!puedeGuardar || guardando}
        style={{ ...buttonStyle, opacity: !puedeGuardar || guardando ? 0.5 : 1, cursor: !puedeGuardar ? 'default' : 'pointer' }}
      >
        {guardando ? 'Guardando…' : textoGuardar}
      </button>
      {extra}
      {onQuitar && (
        <button type="button" onClick={onQuitar} disabled={guardando} style={{ ...ghostButtonStyle, background: 'transparent', color: COLORS.textSecondary, marginLeft: 'auto' }}>
          Quitar
        </button>
      )}
    </div>
  )
}

// quien: 'coach' | 'atleta'. uid: usuario actual. otroNombre: el de enfrente
// (para "Editado por Jon"). soloPanel: sin cabecera plegable, siempre abierto
// (la tarjeta del coach pone su propio botón en la fila de acciones).
export default function NutricionSesion({ sesion, uid, inicial, onCambio, quien, otroNombre, soloPanel = false }) {
  const [abiertoLocal, setAbierto] = useState(false)
  const abierto = soloPanel || abiertoLocal
  const [plan, setPlan] = useState(() => formPlanDe(inicial))
  const [planSucio, setPlanSucio] = useState(false)
  const [tomado, setTomado] = useState(() => formTomadoDe(inicial))
  const [tomadoSucio, setTomadoSucio] = useState(false)
  const [guardando, setGuardando] = useState(null) // 'plan' | 'tomado'
  const [error, setError] = useState('')
  // Marcar unidades guarda al momento: las llamadas van en cola para que dos
  // toques seguidos no se pisen, y mientras haya alguna en vuelo no se recoge
  // la fila de fuera (ver abajo)
  const cola = useRef(Promise.resolve())
  const pendientes = useRef(0)
  // Si la fila cambia desde fuera (guardado en el creador, recarga), se recogen
  // los valores nuevos en los formularios que no se estén editando. Ajuste de
  // estado en render, como en WorkoutBuilder: sin efecto ni render intermedio.
  const [versionVista, setVersionVista] = useState(inicial?.updated_at ?? null)
  if ((inicial?.updated_at ?? null) !== versionVista) {
    setVersionVista(inicial?.updated_at ?? null)
    if (!planSucio) setPlan(formPlanDe(inicial))
    if (!tomadoSucio) setTomado(formTomadoDe(inicial))
  }

  const hoy = hoyMadrid()
  const yaLlego = !!sesion.fecha && sesion.fecha <= hoy
  const esAtleta = quien === 'atleta'
  const hayPlan = tienePlan(inicial)
  // Duración prevista de la sesión: de ella salen los g/h de los productos
  const minutos = duracionPrevista(sesion)?.min ?? null
  const efectivo = nutricionEfectiva(inicial, minutos)
  const unidades = unidadesOrdenadas(itemsDe(inicial))
  const modoLista = unidades.length > 0
  const hayTomado = tieneTomado(inicial)
  // En una sesión pasada el atleta solo ve el plan; hoy o futuro, lo edita
  const editaPlan = !esAtleta || sesion.fecha >= hoy
  const apuntaTomado = esAtleta && yaLlego
  const tomadoPrimero = apuntaTomado && modoLista

  const filaPlan = normalizarNutricion(plan)
  const filaTomado = normalizarTomado(tomado)
  const editadoPorOtro = inicial?.actualizado_por && inicial.actualizado_por !== uid
  const aviso = !esAtleta ? avisoTomado(efectivo) : null

  // Sin sugerencias automáticas: el plan lo rellena Jon. El atleta no ve la
  // línea en sesiones futuras hasta que haya plan (así no llena su lista de filas
  // vacías); desde el día de la sesión sí, para apuntar lo que tomó.
  if (esAtleta && !yaLlego && !inicial) return null
  if (!inicial && sesion.disciplina === 'other') return null

  const cambiarPlan = (campo, valor) => {
    setPlan((f) => ({ ...f, [campo]: valor }))
    setPlanSucio(true)
    setError('')
  }
  const cambiarTomado = (campo, valor) => {
    setTomado((f) => ({ ...f, [campo]: valor }))
    setTomadoSucio(true)
    setError('')
  }

  const alternar = (clave) => {
    const marcadas = new Set(normalizarClaves(tomado.tomado_items) || [])
    if (marcadas.has(clave)) marcadas.delete(clave)
    else marcadas.add(clave)
    // Solo claves que siguen en el plan, en el orden del plan
    const nuevas = unidades.map((u) => u.clave).filter((c) => marcadas.has(c))
    const lista = nuevas.length ? nuevas : null
    setTomado((f) => ({ ...f, tomado_items: lista }))
    setTomadoSucio(true)
    setError('')
    pendientes.current += 1
    cola.current = cola.current.then(async () => {
      try {
        const fila = await guardarNutricion(sesion.id, sesion.athlete_id, uid, { tomado_items: lista })
        onCambio?.(sesion.id, fila)
      } catch {
        setError('No se pudo guardar lo que marcaste. Inténtalo de nuevo.')
      } finally {
        pendientes.current -= 1
        if (pendientes.current === 0) setTomadoSucio(false)
      }
    })
  }

  async function ejecutar(parte, accion) {
    setGuardando(parte)
    setError('')
    try {
      const fila = await accion()
      if (parte === 'plan') setPlanSucio(false)
      else setTomadoSucio(false)
      onCambio?.(sesion.id, fila)
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(null)
    }
  }

  const guardarPlan = () => filaPlan && ejecutar('plan', () => guardarNutricion(sesion.id, sesion.athlete_id, uid, filaPlan))
  const quitarPlan = () =>
    ejecutar('plan', async () => {
      const r = await quitarParte(sesion.id, sesion.athlete_id, uid, inicial, 'plan')
      setPlan(formPlanDe(null))
      return r
    })
  const guardarTomado = () => filaTomado && ejecutar('tomado', () => guardarNutricion(sesion.id, sesion.athlete_id, uid, filaTomado))
  const quitarTomado = () =>
    ejecutar('tomado', async () => {
      const r = await quitarParte(sesion.id, sesion.athlete_id, uid, inicial, 'tomado')
      setTomado(formTomadoDe(null))
      return r
    })

  // Cabecera plegada: lo esencial en una línea grande y, si hay que llevar la
  // cuenta, una barra de avance (unidades tomadas o g/h tomados frente al plan).
  const planGh = efectivo?.carbohidratos_g_h > 0 ? efectivo.carbohidratos_g_h : null
  const tomadoGh = efectivo?.tomado_carbohidratos_g_h ?? null
  const marcadasValidas = modoLista && Array.isArray(inicial?.tomado_items) ? tomadasValidas(itemsDe(inicial), inicial.tomado_items).length : 0
  let principal
  let avance = null
  if (hayTomado && modoLista) {
    principal = `${marcadasValidas} de ${unidades.length} tomadas${tomadoGh != null && planGh ? ` · ${tomadoGh} de ${planGh} g/h` : ''}`
    avance = unidades.length ? marcadasValidas / unidades.length : null
  } else if (hayTomado) {
    principal = `${esAtleta ? 'Tomaste' : 'Tomó'} ${resumenTomado(efectivo)}`
    avance = tomadoGh != null && planGh ? Math.min(1, tomadoGh / planGh) : null
  } else if (hayPlan) {
    principal = resumenPlan(inicial, minutos) || 'Ver notas'
    if (apuntaTomado && modoLista) avance = 0
  } else if (apuntaTomado) {
    principal = '¿Qué tomaste?'
  } else {
    principal = 'Sin plan'
  }

  return (
    <div style={{ marginTop: 8 }}>
      {!soloPanel && <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 58, padding: '10px 14px', border: 'none',
          borderRadius: 16, background: COLORS.sunken, color: COLORS.textPrimary, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: COLORS.raised, color: aviso ? COLORS.error : COLORS.textSoft }}>
          <Icon name="gota" size={18} strokeWidth={2} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, color: COLORS.textSecondary }}>Nutrición</span>
          <span style={{ display: 'block', fontSize: 15.5, fontWeight: 650, color: hayPlan || hayTomado ? COLORS.textPrimary : COLORS.textSecondary, lineHeight: 1.3, marginTop: 1, overflowWrap: 'anywhere' }}>{principal}</span>
          {avance != null && (
            <span aria-hidden="true" style={{ display: 'block', height: 5, borderRadius: 3, background: COLORS.cardBorder, overflow: 'hidden', marginTop: 7 }}>
              <span style={{ display: 'block', width: `${Math.round(avance * 100)}%`, height: '100%', borderRadius: 3, background: aviso ? COLORS.error : COLORS.accent }} />
            </span>
          )}
          {aviso && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 14, color: COLORS.error, fontWeight: 600 }}>
              <Icon name="alert" size={14} strokeWidth={2.2} />
              {aviso}
            </span>
          )}
        </span>
        <Icon name="chevronDown" size={18} color={COLORS.textTertiary} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }} />
      </button>}

      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: soloPanel ? '4px 0 10px' : '14px 0 10px' }}>
          {/* ── Plan ── (el día de la sesión, lo que se marca va arriba y el plan debajo) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, order: tomadoPrimero ? 2 : 0, ...(tomadoPrimero ? { paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}` } : {}) }}>
            {apuntaTomado && <p style={subtitulo}>Plan</p>}
            {editaPlan ? (
              <>
                <CamposPlanNutricion athleteId={sesion.athlete_id} form={plan} onCambiar={cambiarPlan} minutos={minutos} puedeEditarDespensa={uid === sesion.athlete_id} />
                <Botonera
                  puedeGuardar={!!filaPlan && planSucio}
                  guardando={guardando === 'plan'}
                  onGuardar={guardarPlan}
                  textoGuardar="Guardar plan"
                  onQuitar={hayPlan ? quitarPlan : null}
                  extra={!planSucio && hayPlan && (
                    <span style={{ fontSize: 13.5, color: COLORS.textSecondary }}>
                      {editadoPorOtro ? `Editado por ${otroNombre || (esAtleta ? 'tu entrenador' : 'el atleta')}` : 'Editado por ti'}
                    </span>
                  )}
                />
              </>
            ) : hayPlan ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ margin: 0, fontSize: 15, color: COLORS.textPrimary, lineHeight: 1.45 }}>
                  <span style={{ fontWeight: 600 }}>{resumenPlan(inicial, minutos)}</span>
                  {inicial.notas ? <span style={{ color: COLORS.textSecondary }}> · {inicial.notas}</span> : null}
                </p>
                <LineaTiempo items={itemsDe(inicial)} minutos={minutos} />
                {itemsDe(inicial).map((it, i) => {
                  const receta = textoReceta(it)
                  return receta ? (
                    <p key={i} style={{ margin: 0, fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                      {it.nombre}, cada uno: <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{receta}</span>
                      {tonicidadBidon(it) && <span style={{ fontFamily: FONTS.mono }}> · {tonicidadBidon(it).texto}</span>}
                    </p>
                  ) : null
                })}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 14.5, color: COLORS.textSecondary }}>No había plan de nutrición.</p>
            )}
          </div>

          {/* ── Lo tomado: el atleta lo apunta; el coach lo ve ── */}
          {apuntaTomado && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, order: 1, ...(tomadoPrimero ? {} : { paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}` }) }}>
              <p style={subtitulo}>Lo que tomaste</p>
              {modoLista ? (
                <ChecklistTomado unidades={unidades} marcadas={new Set(normalizarClaves(tomado.tomado_items) || [])} onAlternar={alternar} minutos={minutos} />
              ) : (
                <CamposNumero campos={CAMPOS_TOMADO_UI} form={tomado} onCambiar={cambiarTomado} />
              )}
              <div>
                <p style={etiqueta}>¿Qué tal te sentó?</p>
                <div role="radiogroup" aria-label="Qué tal te sentó" style={{ display: 'flex', gap: 6 }}>
                  {ESTOMAGO.map((e) => {
                    const sel = tomado.estomago === e.value
                    return (
                      <button
                        key={e.value}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        onClick={() => cambiarTomado('estomago', sel ? null : e.value)}
                        style={{
                          flex: 1, minWidth: 0, height: 44, borderRadius: 999, padding: 0, cursor: 'pointer', fontSize: 15, border: 'none',
                          background: sel ? (e.value === 1 ? COLORS.error : COLORS.textPrimary) : COLORS.raised,
                          color: sel ? COLORS.background : COLORS.textSecondary,
                          fontWeight: sel ? 700 : 500,
                        }}
                      >
                        {e.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={etiqueta}>{modoLista ? 'Notas' : 'Qué tomaste'}</span>
                <textarea
                  value={tomado.tomado_notas}
                  onChange={(e) => cambiarTomado('tomado_notas', e.target.value)}
                  maxLength={LIMITE_NOTAS_TOMADO}
                  rows={2}
                  placeholder={modoLista ? 'Ej.: el 3.º gel me costó' : 'Ej.: 3 geles y 2 bidones de isotónica; el 3.º gel me costó'}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 56, lineHeight: 1.4 }}
                />
              </label>
              <Botonera
                puedeGuardar={!!filaTomado && tomadoSucio}
                guardando={guardando === 'tomado'}
                onGuardar={guardarTomado}
                textoGuardar={hayTomado ? 'Guardar cambios' : 'Guardar'}
                onQuitar={hayTomado ? quitarTomado : null}
              />
            </div>
          )}

          {!esAtleta && hayTomado && (
            <div style={{ paddingTop: 14, borderTop: `1px solid ${COLORS.cardBorder}`, fontSize: 15, lineHeight: 1.5 }}>
              <p style={{ ...subtitulo, marginBottom: 6 }}>Lo que tomó {otroNombre || 'el atleta'}</p>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: inicial.estomago === 1 ? COLORS.error : COLORS.textPrimary }}>{resumenTomado(efectivo)}</p>
              {modoLista && Array.isArray(inicial.tomado_items) && tomadasValidas(itemsDe(inicial), inicial.tomado_items).length < unidades.length && (
                <p style={{ margin: '4px 0 0', fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                  Sin tomar: {unidades.filter((u) => !inicial.tomado_items.includes(u.clave)).map((u) => `${u.nombre}${u.min != null ? ` (min ${u.min})` : ''}`).join(' · ')}
                </p>
              )}
              {inicial.tomado_notas && (
                <p style={{ margin: '4px 0 0', color: COLORS.textPrimary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{inicial.tomado_notas}”</p>
              )}
            </div>
          )}

          {error && <p style={{ color: COLORS.error, fontSize: 14.5, margin: 0 }}>{error}</p>}
        </div>
      )}
    </div>
  )
}
