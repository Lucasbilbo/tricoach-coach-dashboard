// Editor del PLAN de nutrición por productos: el atleta tiene una despensa
// (gel 30 g, gel 45 g con cafeína, guayaba, bidón de 750…) y la sesión lleva
// "cuántos de cada". Los totales y los g/h se calculan solos con la duración.
// Lo usan la tarjeta de sesión (NutricionSesion) y el creador (WorkoutBuilder).
//
// El formulario es { productos: [items], notas, …legacy } (ver lib/nutricion.js).
// Los bidones llevan una mezcla variable: sus hidratos y sodio se escriben POR
// BIDÓN en cada sesión. Cada item copia los valores del producto, así editar la
// despensa no cambia planes ya hechos.
import { useState } from 'react'
import { COLORS, FONTS, RADIUS, buttonStyle, ghostButtonStyle, inputStyle } from '../lib/theme'
import { LIMITE_NOTAS, resumenNutricion } from '../lib/nutricion'
import {
  LIMITES_PRODUCTO, MAX_CANTIDAD, MAX_MINUTO, TIPOS, detalleProducto, itemDeProducto, lineaTiempo, minutoComoHora,
  gruposProductos, normalizarItems, normalizarProducto, porHora, tonicidadBidon, repartirMinutos, resumenTotales, textoReceta, totalesItems,
} from '../lib/productosNutricion'
import { useProductosNutricion } from '../hooks/useProductosNutricion'
import Icon from './ui/Icon'

const etiqueta = { fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }
const botonCantidad = {
  width: 36, height: 36, borderRadius: RADIUS.sm, border: `1px solid ${COLORS.cardBorder}`, background: 'transparent',
  color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 0,
}
const textoBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '8px 0',
  minHeight: 36, fontSize: 13, fontWeight: 500, cursor: 'pointer', color: COLORS.textSecondary,
}

const FORM_VACIO = { nombre: '', tipo: 'gel', carbohidratos_g: '', cafeina_mg: '', sodio_mg: '', volumen_ml: '', maltodextrina_g: '', fructosa_g: '', sales_g: '' }

function Stepper({ cantidad, onMenos, onMas, nombre }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button type="button" onClick={onMenos} disabled={!cantidad} aria-label={`Quitar uno de ${nombre}`} style={{ ...botonCantidad, opacity: cantidad ? 1 : 0.35, cursor: cantidad ? 'pointer' : 'default' }}>
        −
      </button>
      <span style={{ width: 24, textAlign: 'center', fontFamily: FONTS.mono, fontSize: 15, color: cantidad ? COLORS.textPrimary : COLORS.textTertiary }}>{cantidad}</span>
      <button type="button" onClick={onMas} disabled={cantidad >= MAX_CANTIDAD} aria-label={`Añadir uno de ${nombre}`} style={botonCantidad}>
        +
      </button>
    </div>
  )
}

function Mezcla({ item, onCambiar }) {
  // Bidón con receta propia: se da tal cual, sin cifras que escribir
  if (item.receta) {
    return (
      <p style={{ margin: 0, padding: '0 0 10px 12px', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
        Receta: <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{textoReceta(item)}</span>
        {tonicidadBidon(item) && <span style={{ fontFamily: FONTS.mono }}> · {tonicidadBidon(item).texto}</span>}
      </p>
    )
  }
  const campo = (clave, label, unidad, max) => (
    <label style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
      <span style={{ ...etiqueta, margin: '0 0 4px', fontWeight: 500 }}>{label} <span>{unidad}</span></span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={5}
        value={item[clave] === 0 ? '' : item[clave]}
        placeholder="0"
        onChange={(e) => onCambiar(clave, e.target.value)}
        style={{ ...inputStyle, fontFamily: FONTS.mono, padding: '8px 10px' }}
      />
    </label>
  )
  const receta = textoReceta(item)
  return (
    <div style={{ padding: '0 0 10px 12px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {campo('carbohidratos_g', 'Hidratos', 'g / bidón', LIMITES_PRODUCTO.carbohidratos_g)}
        {campo('sodio_mg', 'Sodio', 'mg / bidón', LIMITES_PRODUCTO.sodio_mg)}
      </div>
      {receta && (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.45 }}>
          Cada bidón: <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{receta}</span>
          {tonicidadBidon(item) && <span style={{ fontFamily: FONTS.mono }}> · {tonicidadBidon(item).texto}</span>}
        </p>
      )}
    </div>
  )
}

// Un minuto por cada unidad del item ("Tomar en el minuto": 30 · 60 · 90).
// Opcional. «Repartir» propone un reparto parejo que Jon puede cambiar.
function Momentos({ item, minutos, onCambiar }) {
  const n = Number(item.cantidad) || 0
  const valores = Array.from({ length: n }, (_, i) => item.minutos?.[i] ?? '')
  const poner = (i, v) => onCambiar(valores.map((x, j) => (j === i ? v : x)))
  const sugerido = minutos > 0 ? repartirMinutos(n, minutos, item.tipo) : []
  return (
    <div style={{ padding: '0 0 10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <span style={{ ...etiqueta, margin: 0, fontWeight: 500 }}>{item.tipo === 'bidon' ? 'Empezar en el minuto' : 'Tomar en el minuto'}</span>
        {sugerido.length > 0 && (
          <button type="button" onClick={() => onCambiar(sugerido)} style={{ ...textoBtn, padding: '4px 0', minHeight: 28, fontSize: 12 }}>
            Repartir
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {valores.map((v, i) => (
          <input
            key={i}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_MINUTO}
            value={v}
            placeholder={n > 1 ? `${i + 1}º` : 'min'}
            aria-label={`${item.nombre}${n > 1 ? ` nº ${i + 1}` : ''}, minuto`}
            onChange={(e) => poner(i, e.target.value)}
            style={{ ...inputStyle, fontFamily: FONTS.mono, padding: '8px 10px', width: 72, flex: '0 0 auto' }}
          />
        ))}
      </div>
    </div>
  )
}

// Orden en el que se toma todo: "Min 40 · Gel 45 g". Vacío si nadie tiene minuto.
export function LineaTiempo({ items, minutos }) {
  const { eventos, sinHora } = lineaTiempo(items, minutos)
  if (!eventos.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ ...etiqueta, margin: 0 }}>Cuándo tomarlo</p>
      {eventos.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 13, lineHeight: 1.4 }}>
          <span style={{ width: 62, flexShrink: 0, fontFamily: FONTS.mono, color: e.pasa ? COLORS.warning : COLORS.textPrimary }}>
            Min {e.min}
          </span>
          <span style={{ color: COLORS.textPrimary }}>
            {e.nombre}
            {e.min >= 60 && <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textTertiary }}> · {minutoComoHora(e.min)}</span>}
            {e.pasa && <span style={{ fontSize: 11, color: COLORS.warning }}> · después del final</span>}
          </span>
        </div>
      ))}
      {sinHora.length > 0 && (
        <p style={{ margin: '2px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
          Sin hora: {sinHora.map((s) => `${s.cantidad} × ${s.nombre}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

// ── Gestor de la despensa (añadir / editar / quitar) ──
function Gestor({ productos, anadir, editar, quitar, onCerrar }) {
  const [editando, setEditando] = useState(null) // null | 'nuevo' | id
  const [pform, setPform] = useState(FORM_VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const abrir = (p) => {
    setEditando(p ? p.id : 'nuevo')
    const r = p?.receta || {}
    setPform(p ? {
      nombre: p.nombre, tipo: p.tipo, carbohidratos_g: p.carbohidratos_g || '', cafeina_mg: p.cafeina_mg || '', sodio_mg: p.sodio_mg || '', volumen_ml: p.volumen_ml || '',
      maltodextrina_g: r.maltodextrina_g || '', fructosa_g: r.fructosa_g || '', sales_g: r.sales_g || '',
    } : FORM_VACIO)
    setError('')
  }
  const cambiar = (campo, valor) => setPform((f) => ({ ...f, [campo]: valor }))
  const fila = normalizarProducto(pform)

  async function guardar() {
    if (!fila) return
    setGuardando(true)
    setError('')
    try {
      if (editando === 'nuevo') await anadir(fila)
      else await editar(editando, fila)
      setEditando(null)
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }
  async function borrar(id) {
    setError('')
    try {
      await quitar(id)
      if (editando === id) setEditando(null)
    } catch {
      setError('No se pudo quitar. Inténtalo de nuevo.')
    }
  }

  const num = (campo, label, unidad, max) => (
    <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={etiqueta}>{label} <span style={{ fontWeight: 500 }}>{unidad}</span></span>
      <input type="number" inputMode="numeric" min={0} max={max} value={pform[campo]} placeholder="0" onChange={(e) => cambiar(campo, e.target.value)} style={{ ...inputStyle, fontFamily: FONTS.mono }} />
    </label>
  )

  const gr = (campo, label) => (
    <label style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={etiqueta}>{label} <span style={{ fontWeight: 500 }}>g</span></span>
      <input type="number" inputMode="decimal" min={0} step={0.5} value={pform[campo]} placeholder="0" onChange={(e) => cambiar(campo, e.target.value)} style={{ ...inputStyle, fontFamily: FONTS.mono }} />
    </label>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: `1px solid ${COLORS.cardBorder}`, borderRadius: RADIUS.md }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>Mis productos</p>
        <button type="button" onClick={onCerrar} style={{ ...textoBtn, padding: '4px 0' }}>Cerrar</button>
      </div>

      {productos.length === 0 && editando == null && (
        <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>Aún no hay productos. Añade los que usa.</p>
      )}
      {productos.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.35 }}>
            {p.nombre} <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textSecondary }}>{detalleProducto(p)}</span>
          </span>
          <button type="button" onClick={() => abrir(p)} aria-label={`Editar ${p.nombre}`} style={{ ...textoBtn, padding: 0, width: 32, justifyContent: 'center' }}>
            <Icon name="edit" size={15} />
          </button>
          <button type="button" onClick={() => borrar(p.id)} aria-label={`Quitar ${p.nombre}`} style={{ ...textoBtn, padding: 0, width: 32, justifyContent: 'center' }}>
            <Icon name="trash" size={15} />
          </button>
        </div>
      ))}

      {editando == null ? (
        <button type="button" onClick={() => abrir(null)} style={{ ...textoBtn, color: COLORS.textPrimary, alignSelf: 'flex-start' }}>
          <Icon name="plus" size={15} /> Añadir producto
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.cardBorder}` }}>
          <label style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={etiqueta}>Nombre</span>
            <input type="text" value={pform.nombre} maxLength={60} placeholder="Ej.: Gel 45 g · cafeína 75 mg" onChange={(e) => cambiar('nombre', e.target.value)} style={inputStyle} />
          </label>
          <div role="radiogroup" aria-label="Tipo" style={{ display: 'flex', gap: 4 }}>
            {TIPOS.map((t) => {
              const sel = pform.tipo === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => cambiar('tipo', t.value)}
                  style={{
                    flex: 1, height: 36, borderRadius: RADIUS.sm, padding: 0, cursor: 'pointer', fontSize: 13,
                    border: `1px solid ${sel ? COLORS.textPrimary : COLORS.cardBorder}`,
                    background: sel ? 'rgba(237,238,242,0.08)' : 'transparent',
                    color: sel ? COLORS.textPrimary : COLORS.textSecondary, fontWeight: sel ? 600 : 500,
                  }}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          {pform.tipo === 'bidon' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                {num('volumen_ml', 'Tamaño', 'ml', LIMITES_PRODUCTO.volumen_ml)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {gr('maltodextrina_g', 'Malto')}
                {gr('fructosa_g', 'Fructosa')}
                {gr('sales_g', 'Sales')}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textTertiary, lineHeight: 1.45 }}>
                La receta del bidón en gramos; de ella salen sus hidratos y su sodio. Déjalo en blanco para un bidón a medida: sus hidratos y sodio se ponen en cada sesión.
              </p>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {num('carbohidratos_g', 'Hidratos', 'g', LIMITES_PRODUCTO.carbohidratos_g)}
              {num('cafeina_mg', 'Cafeína', 'mg', LIMITES_PRODUCTO.cafeina_mg)}
              {num('sodio_mg', 'Sodio', 'mg', LIMITES_PRODUCTO.sodio_mg)}
            </div>
          )}
          {error && <p style={{ margin: 0, fontSize: 13, color: COLORS.error }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={guardar} disabled={!fila || guardando} style={{ ...buttonStyle, padding: '8px 16px', opacity: !fila || guardando ? 0.5 : 1 }}>
              {guardando ? 'Guardando…' : editando === 'nuevo' ? 'Añadir' : 'Guardar'}
            </button>
            <button type="button" onClick={() => setEditando(null)} style={{ ...ghostButtonStyle, padding: '8px 12px', fontSize: 13 }}>Cancelar</button>
          </div>
        </div>
      )}
      {editando == null && error && <p style={{ margin: 0, fontSize: 13, color: COLORS.error }}>{error}</p>}
    </div>
  )
}

// form: { productos, notas, …legacy }. onCambiar(campo, valor) con campo
// 'productos' | 'notas'. minutos: duración prevista de la sesión (o null).
// puedeEditarDespensa: solo el atleta toca su despensa; el coach elige de ella.
export default function PlanProductos({ athleteId, form, onCambiar, minutos, puedeEditarDespensa = false }) {
  const { productos, disponible, anadir, editar, quitar } = useProductosNutricion(athleteId)
  const [gestorAbierto, setGestorAbierto] = useState(false)
  const items = Array.isArray(form.productos) ? form.productos : []
  const itemDe = (id) => items.find((i) => i.producto_id === id)

  const poner = (nuevos) => onCambiar('productos', nuevos)
  const cambiarCantidad = (producto, delta) => {
    const actual = itemDe(producto.id)
    if (!actual) {
      if (delta > 0) poner([...items, itemDeProducto(producto, 1)])
      return
    }
    const cantidad = Math.min(MAX_CANTIDAD, Math.max(0, (Number(actual.cantidad) || 0) + delta))
    // Si baja la cantidad, se van también los minutos de las unidades que sobran
    const recortar = (i) => ({ ...i, cantidad, ...(Array.isArray(i.minutos) ? { minutos: i.minutos.slice(0, cantidad) } : {}) })
    poner(cantidad ? items.map((i) => (i === actual ? recortar(i) : i)) : items.filter((i) => i !== actual))
  }
  const cambiarItem = (item, campo, valor) => poner(items.map((i) => (i === item ? { ...i, [campo]: valor } : i)))
  const quitarItem = (item) => poner(items.filter((i) => i !== item))

  // Items cuyo producto ya no está en la despensa: se siguen viendo para no perderlos
  const huerfanos = items.filter((i) => !productos.some((p) => p.id === i.producto_id))
  const limpios = normalizarItems(items) || []
  const totales = totalesItems(limpios)
  const ph = porHora(totales, minutos)
  const textoTotal = resumenTotales(totales)
  const hayLegacy = !limpios.length && (form.carbohidratos_g_h !== '' || form.liquido_ml_h !== '' || form.sodio_mg_h !== '')
  const legacy = hayLegacy ? resumenNutricion({ carbohidratos_g_h: form.carbohidratos_g_h === '' ? null : form.carbohidratos_g_h, liquido_ml_h: form.liquido_ml_h, sodio_mg_h: form.sodio_mg_h }) : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {hayLegacy && legacy && (
        <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.45 }}>
          Plan anterior: <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{legacy}</span>. Si eliges productos, lo sustituyen.
        </p>
      )}

      {!disponible ? (
        <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary }}>Cargando productos…</p>
      ) : (
        <>
          {productos.length === 0 && huerfanos.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.45 }}>
              {puedeEditarDespensa
                ? 'Aún no hay productos. Añade los que usas (geles, bidones…) y elige cuántos llevas.'
                : 'El atleta aún no ha añadido productos a su despensa.'}
            </p>
          )}
          {/* Despensa entera a la vista, con +/−: primero geles (y guayaba), luego
              bidones. Sin pasos intermedios: se ve qué hay y se elige cuántos. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {gruposProductos(productos).map((g) => (
              <div key={g.clave}>
                <p style={{ ...etiqueta, margin: '4px 0 2px' }}>{g.titulo}</p>
                {g.productos.map((p) => {
                  const item = itemDe(p.id)
                  const cantidad = item ? Number(item.cantidad) || 0 : 0
                  return (
                    <div key={p.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: cantidad ? COLORS.textPrimary : COLORS.textSecondary, lineHeight: 1.3 }}>
                          {p.nombre}
                          <span style={{ display: 'block', fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textTertiary }}>{detalleProducto(p)}</span>
                        </span>
                        <Stepper cantidad={cantidad} nombre={p.nombre} onMenos={() => cambiarCantidad(p, -1)} onMas={() => cambiarCantidad(p, 1)} />
                      </div>
                      {item && cantidad > 0 && p.tipo === 'bidon' && <Mezcla item={item} onCambiar={(campo, valor) => cambiarItem(item, campo, valor)} />}
                      {item && cantidad > 0 && <Momentos item={item} minutos={minutos} onCambiar={(v) => cambiarItem(item, 'minutos', v)} />}
                    </div>
                  )
                })}
              </div>
            ))}
            {huerfanos.map((item, i) => (
              <div key={`h${i}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: COLORS.textPrimary, lineHeight: 1.3 }}>
                    {item.nombre}
                    <span style={{ display: 'block', fontSize: 11, color: COLORS.textTertiary }}>Ya no está en tus productos</span>
                  </span>
                  <button type="button" onClick={() => quitarItem(item)} aria-label={`Quitar ${item.nombre} del plan`} style={{ ...textoBtn, padding: 0, width: 36, justifyContent: 'center' }}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {textoTotal && (
            <p style={{ margin: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>
              Total: <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{textoTotal}</span>
              {ph && ph.carbohidratos_g_h > 0 && (
                <> · <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{ph.carbohidratos_g_h} g/h</span> de hidratos</>
              )}
            </p>
          )}

          <LineaTiempo items={limpios} minutos={minutos} />

          {puedeEditarDespensa && (gestorAbierto ? (
            <Gestor productos={productos} anadir={anadir} editar={editar} quitar={quitar} onCerrar={() => setGestorAbierto(false)} />
          ) : (
            <button type="button" onClick={() => setGestorAbierto(true)} style={{ ...textoBtn, alignSelf: 'flex-start' }}>
              <Icon name="edit" size={15} /> {productos.length ? 'Editar despensa' : 'Añadir productos'}
            </button>
          ))}
        </>
      )}

      <label style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={etiqueta}>Notas</span>
        <textarea
          value={form.notas}
          onChange={(e) => onCambiar('notas', e.target.value)}
          maxLength={LIMITE_NOTAS}
          rows={2}
          placeholder="Ej.: gel en el min 40 y cada 30'; más hidratos por hora si el atleta lo aguanta"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56, lineHeight: 1.4 }}
        />
      </label>
    </div>
  )
}
