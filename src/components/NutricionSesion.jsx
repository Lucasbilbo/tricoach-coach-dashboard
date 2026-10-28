// Nutrición durante una sesión: línea plegable + editor. La usan el coach
// (SessionsList) y el atleta (/home); los dos pueden editar. Datos en
// sesion_nutricion (migración 017); lógica pura en lib/nutricion.js.
//
// NO se envía al reloj: la descripción del evento de Intervals es el texto del
// workout y cualquier texto libre ahí puede romper el parseo o congelar el reloj
// (misma regla que las notas del entrenador). Se ve en la app.
import { useState } from 'react'
import { COLORS, FONTS, buttonStyle, ghostButtonStyle, inputStyle } from '../lib/theme'
import { LIMITE_NOTAS, LIMITES, normalizarNutricion, resumenNutricion, sugerirNutricion, totalesNutricion } from '../lib/nutricion'
import { borrarNutricion, guardarNutricion } from '../lib/nutricionApi'
import Icon from './ui/Icon'

const etiqueta = { fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }

const textoBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '8px 0',
  minHeight: 36, fontSize: 13, fontWeight: 500, cursor: 'pointer',
}

const CAMPOS = [
  { campo: 'carbohidratos_g_h', label: 'Hidratos', unidad: 'g/h', paso: 5 },
  { campo: 'liquido_ml_h', label: 'Líquido', unidad: 'ml/h', paso: 50 },
  { campo: 'sodio_mg_h', label: 'Sodio', unidad: 'mg/h', paso: 50 },
]

const vacio = { carbohidratos_g_h: '', liquido_ml_h: '', sodio_mg_h: '', notas: '' }
const aForm = (n) =>
  n
    ? {
        carbohidratos_g_h: n.carbohidratos_g_h ?? '',
        liquido_ml_h: n.liquido_ml_h ?? '',
        sodio_mg_h: n.sodio_mg_h ?? '',
        notas: n.notas ?? '',
      }
    : vacio

function formatDuracion(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`
}

// quien: 'coach' | 'atleta'. uid: usuario actual. otroNombre: el de enfrente
// (para "Editado por Jon").
export default function NutricionSesion({ sesion, uid, inicial, onCambio, quien, otroNombre }) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState(() => aForm(inicial))
  const [sucio, setSucio] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const sugerencia = sugerirNutricion(sesion)
  const fila = normalizarNutricion(form)
  const resumen = resumenNutricion(inicial)
  const totales = inicial && sugerencia ? totalesNutricion(inicial, sugerencia.minutos) : null
  const editadoPorOtro = inicial?.actualizado_por && inicial.actualizado_por !== uid

  // La sugerencia de "no hace falta nada" (todo a 0) no merece invitación
  const sugerenciaUtil = sugerencia && (sugerencia.carbohidratos_g_h || sugerencia.liquido_ml_h || sugerencia.sodio_mg_h)
  if (!inicial && !sugerenciaUtil && quien === 'atleta') return null

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }))
    setSucio(true)
    setError('')
  }

  function usarSugerencia() {
    if (!sugerencia) return
    setForm((f) => ({
      ...f,
      carbohidratos_g_h: sugerencia.carbohidratos_g_h,
      liquido_ml_h: sugerencia.liquido_ml_h || '',
      sodio_mg_h: sugerencia.sodio_mg_h || '',
    }))
    setSucio(true)
  }

  async function guardar() {
    if (!fila) return
    setGuardando(true)
    setError('')
    try {
      const guardado = await guardarNutricion(sesion.id, sesion.athlete_id, uid, fila)
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
      await borrarNutricion(sesion.id)
      setForm(vacio)
      setSucio(false)
      onCambio?.(sesion.id, null)
    } catch {
      setError('No se pudo borrar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        style={{ ...textoBtn, alignItems: 'flex-start', textAlign: 'left', color: inicial ? COLORS.textPrimary : COLORS.textSecondary }}
      >
        <Icon name="chevronDown" size={16} style={{ flexShrink: 0, marginTop: 1, transform: abierto ? 'rotate(180deg)' : 'none' }} />
        <span style={{ lineHeight: 1.4 }}>
          Nutrición
          {inicial ? (
            <span style={{ color: COLORS.textPrimary }}> · <span style={{ fontFamily: FONTS.mono, fontSize: 12 }}>{resumen || 'ver notas'}</span></span>
          ) : (
            <span style={{ color: COLORS.textSecondary }}> · {quien === 'coach' ? 'sin plan' : 'ver sugerencia'}</span>
          )}
        </span>
      </button>

      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 10px' }}>
          {totales && (
            <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>
              Para ~{formatDuracion(sugerencia.minutos)} lleva
              {totales.gramos ? <> <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{totales.gramos} g</span> de hidratos</> : null}
              {totales.gramos && totales.mililitros ? ' y' : ''}
              {totales.mililitros ? <> <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{(totales.mililitros / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} l</span> de líquido</> : null}
            </p>
          )}

          {sugerencia && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: COLORS.textSecondary }}>
              <span style={{ flex: '1 1 220px', lineHeight: 1.45 }}>
                Sugerencia (~{formatDuracion(sugerencia.minutos)}{sugerencia.alta ? ', con intensidad' : ''}):{' '}
                <span style={{ color: COLORS.textPrimary }}>{resumenNutricion(sugerencia) || 'nada'}</span>. {sugerencia.motivo}
              </span>
              <button onClick={usarSugerencia} style={{ ...ghostButtonStyle, padding: '6px 12px', fontSize: 13 }}>
                Usar sugerencia
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {CAMPOS.map(({ campo, label, unidad, paso }) => (
              <label key={campo} style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={etiqueta}>
                  {label} <span style={{ fontWeight: 500 }}>{unidad}</span>
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={LIMITES[campo]}
                  step={paso}
                  value={form[campo]}
                  onChange={(e) => cambiar(campo, e.target.value)}
                  style={{ ...inputStyle, fontFamily: FONTS.mono }}
                />
              </label>
            ))}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={etiqueta}>Cómo tomarlo</span>
            <textarea
              value={form.notas}
              onChange={(e) => cambiar('notas', e.target.value)}
              maxLength={LIMITE_NOTAS}
              rows={2}
              placeholder="Ej.: gel en el min 40 y cada 30'; isotónica en el bidón"
              style={{ ...inputStyle, resize: 'vertical', minHeight: 56, lineHeight: 1.4 }}
            />
          </label>

          {error && <p style={{ color: COLORS.error, fontSize: 13, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={guardar}
              disabled={!fila || !sucio || guardando}
              style={{ ...buttonStyle, padding: '8px 16px', opacity: !fila || !sucio || guardando ? 0.5 : 1, cursor: !fila || !sucio ? 'default' : 'pointer' }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            {!sucio && inicial && (
              <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                {editadoPorOtro ? `Editado por ${otroNombre || (quien === 'coach' ? 'el atleta' : 'tu entrenador')}` : 'Editado por ti'}
              </span>
            )}
            {inicial && (
              <button onClick={borrar} disabled={guardando} style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13, color: COLORS.textSecondary, marginLeft: 'auto' }}>
                Quitar
              </button>
            )}
          </div>
          <p style={{ margin: 0, fontSize: 12, color: COLORS.textTertiary }}>
            Orientativo. Ajústalo a lo que toleras y prueba en entreno lo que usarás en carrera.
          </p>
        </div>
      )}
    </div>
  )
}
