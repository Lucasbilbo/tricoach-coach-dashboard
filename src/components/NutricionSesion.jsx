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
import { useState } from 'react'
import { COLORS, FONTS, RADIUS, buttonStyle, ghostButtonStyle, inputStyle } from '../lib/theme'
import { hoyMadrid } from '../lib/chartUtils'
import {
  ESTOMAGO, LIMITE_NOTAS_TOMADO, LIMITES, avisoTomado, formPlanDe, normalizarNutricion,
  normalizarTomado, resumenPlan, resumenTomado, tienePlan, tieneTomado,
} from '../lib/nutricion'
import { itemsDe, planEfectivo, textoReceta } from '../lib/productosNutricion'
import { duracionPrevista } from '../lib/tssPrevisto'
import { guardarNutricion, quitarParte } from '../lib/nutricionApi'
import Icon from './ui/Icon'
import PlanProductos, { LineaTiempo } from './PlanProductos'

const etiqueta = { fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }
const subtitulo = { fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, margin: 0 }

const textoBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '8px 0',
  minHeight: 36, fontSize: 13, fontWeight: 500, cursor: 'pointer',
}

const CAMPOS_TOMADO_UI = [
  { campo: 'tomado_carbohidratos_g_h', label: 'Hidratos', unidad: 'g/h', paso: 5, max: LIMITES.carbohidratos_g_h },
  { campo: 'tomado_liquido_ml_h', label: 'Líquido', unidad: 'ml/h', paso: 50, max: LIMITES.liquido_ml_h },
]

const formTomadoDe = (n) => ({
  tomado_carbohidratos_g_h: n?.tomado_carbohidratos_g_h ?? '',
  tomado_liquido_ml_h: n?.tomado_liquido_ml_h ?? '',
  estomago: n?.estomago ?? null,
  tomado_notas: n?.tomado_notas ?? '',
})

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
            style={{ ...inputStyle, fontFamily: FONTS.mono }}
          />
        </label>
      ))}
    </div>
  )
}

// Campos del PLAN: productos de la despensa del atleta + cómo tomarlo, en
// blanco para que los rellene el coach. Compartido con el creador de sesiones
// (WorkoutBuilder).
export function CamposPlanNutricion({ athleteId, form, onCambiar, minutos }) {
  return <PlanProductos athleteId={athleteId} form={form} onCambiar={onCambiar} minutos={minutos} />
}

function Botonera({ puedeGuardar, guardando, onGuardar, textoGuardar, onQuitar, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onGuardar}
        disabled={!puedeGuardar || guardando}
        style={{ ...buttonStyle, padding: '8px 16px', opacity: !puedeGuardar || guardando ? 0.5 : 1, cursor: !puedeGuardar ? 'default' : 'pointer' }}
      >
        {guardando ? 'Guardando…' : textoGuardar}
      </button>
      {extra}
      {onQuitar && (
        <button type="button" onClick={onQuitar} disabled={guardando} style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13, color: COLORS.textSecondary, marginLeft: 'auto' }}>
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
  const efectivo = planEfectivo(inicial, minutos)
  const hayTomado = tieneTomado(inicial)
  // En una sesión pasada el atleta solo ve el plan; hoy o futuro, lo edita
  const editaPlan = !esAtleta || sesion.fecha >= hoy
  const apuntaTomado = esAtleta && yaLlego

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

  // Cabecera: plan y, si lo hay, lo tomado
  let resumenCabecera
  if (hayPlan || hayTomado) {
    const partes = []
    // Con lo tomado delante basta: ya lleva el plan al lado ("35 de 60 g/h")
    if (hayTomado) partes.push(`${esAtleta ? 'tomaste' : 'tomó'} ${resumenTomado(efectivo)}`)
    else partes.push(resumenPlan(inicial, minutos) || 'ver notas')
    resumenCabecera = <span style={{ fontFamily: FONTS.mono, fontSize: 12 }}>{partes.join(' · ')}</span>
  } else if (apuntaTomado) {
    resumenCabecera = <span style={{ color: COLORS.textSecondary }}>¿qué tomaste?</span>
  } else {
    resumenCabecera = <span style={{ color: COLORS.textSecondary }}>{'sin plan'}</span>
  }

  return (
    <div style={{ marginTop: 4 }}>
      {!soloPanel && <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        style={{ ...textoBtn, alignItems: 'flex-start', textAlign: 'left', color: inicial ? COLORS.textPrimary : COLORS.textSecondary }}
      >
        <Icon name="chevronDown" size={16} style={{ flexShrink: 0, marginTop: 1, transform: abierto ? 'rotate(180deg)' : 'none' }} />
        <span style={{ lineHeight: 1.4 }}>
          Nutrición <span style={{ color: COLORS.textPrimary }}>· {resumenCabecera}</span>
          {aviso && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 8, color: COLORS.error, fontWeight: 600 }}>
              <Icon name="alert" size={13} strokeWidth={2.2} />
              {aviso}
            </span>
          )}
        </span>
      </button>}

      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0 10px' }}>
          {/* ── Plan ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {apuntaTomado && <p style={subtitulo}>Plan</p>}
            {editaPlan ? (
              <>
                <CamposPlanNutricion athleteId={sesion.athlete_id} form={plan} onCambiar={cambiarPlan} minutos={minutos} />
                <Botonera
                  puedeGuardar={!!filaPlan && planSucio}
                  guardando={guardando === 'plan'}
                  onGuardar={guardarPlan}
                  textoGuardar="Guardar plan"
                  onQuitar={hayPlan ? quitarPlan : null}
                  extra={!planSucio && hayPlan && (
                    <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                      {editadoPorOtro ? `Editado por ${otroNombre || (esAtleta ? 'tu entrenador' : 'el atleta')}` : 'Editado por ti'}
                    </span>
                  )}
                />
              </>
            ) : hayPlan ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p style={{ margin: 0, fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.45 }}>
                  <span style={{ fontFamily: FONTS.mono }}>{resumenPlan(inicial, minutos)}</span>
                  {inicial.notas ? <span style={{ color: COLORS.textSecondary }}> · {inicial.notas}</span> : null}
                </p>
                <LineaTiempo items={itemsDe(inicial)} minutos={minutos} />
                {itemsDe(inicial).map((it, i) => {
                  const receta = textoReceta(it)
                  return receta ? (
                    <p key={i} style={{ margin: 0, fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
                      {it.nombre}, cada uno: <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{receta}</span>
                    </p>
                  ) : null
                })}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>No había plan de nutrición.</p>
            )}
          </div>

          {/* ── Lo tomado: el atleta lo apunta; el coach lo ve ── */}
          {apuntaTomado && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}` }}>
              <p style={subtitulo}>Lo que tomaste</p>
              <CamposNumero campos={CAMPOS_TOMADO_UI} form={tomado} onCambiar={cambiarTomado} />
              <div>
                <p style={etiqueta}>¿Qué tal te sentó?</p>
                <div role="radiogroup" aria-label="Qué tal te sentó" style={{ display: 'flex', gap: 4 }}>
                  {ESTOMAGO.map((e) => {
                    const sel = tomado.estomago === e.value
                    const color = e.value === 1 ? COLORS.error : COLORS.textPrimary
                    return (
                      <button
                        key={e.value}
                        type="button"
                        role="radio"
                        aria-checked={sel}
                        onClick={() => cambiarTomado('estomago', sel ? null : e.value)}
                        style={{
                          flex: 1, minWidth: 0, height: 36, borderRadius: RADIUS.sm, padding: 0, cursor: 'pointer', fontSize: 13,
                          border: `1px solid ${sel ? color : COLORS.cardBorder}`,
                          background: sel ? 'rgba(237,238,242,0.08)' : 'transparent',
                          color: sel ? color : COLORS.textSecondary,
                          fontWeight: sel ? 600 : 500,
                        }}
                      >
                        {e.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={etiqueta}>Qué tomaste</span>
                <textarea
                  value={tomado.tomado_notas}
                  onChange={(e) => cambiarTomado('tomado_notas', e.target.value)}
                  maxLength={LIMITE_NOTAS_TOMADO}
                  rows={2}
                  placeholder="Ej.: 3 geles y 2 bidones de isotónica; el 3.º gel me costó"
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
            <div style={{ paddingTop: 12, borderTop: `1px solid ${COLORS.cardBorder}`, fontSize: 13, lineHeight: 1.5 }}>
              <p style={{ ...subtitulo, marginBottom: 4 }}>Lo que tomó {otroNombre || 'el atleta'}</p>
              <p style={{ margin: 0, fontFamily: FONTS.mono, fontSize: 12, color: inicial.estomago === 1 ? COLORS.error : COLORS.textPrimary }}>{resumenTomado(efectivo)}</p>
              {inicial.tomado_notas && (
                <p style={{ margin: '4px 0 0', color: COLORS.textPrimary, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>“{inicial.tomado_notas}”</p>
              )}
            </div>
          )}

          {error && <p style={{ color: COLORS.error, fontSize: 13, margin: 0 }}>{error}</p>}
        </div>
      )}
    </div>
  )
}
