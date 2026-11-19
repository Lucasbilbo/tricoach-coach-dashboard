// productosNutricion.js — despensa de nutrición por atleta (migración 018).
// Lógica PURA para node --test; el acceso a datos está en productosApi.js.
//
// Un PRODUCTO es algo que el atleta tiene (gel 45 g con cafeína, guayaba, bidón
// de 750 ml). Un ITEM es lo que lleva una sesión: el producto copiado (valores
// por unidad) + cuántos. Se copia para que editar el catálogo no cambie planes
// ya hechos. Los totales y los g/h salen de los items y de la duración.
//
// Bidones: llevan una mezcla variable (maltodextrina + fructosa + sales), así
// que sus hidratos y su sodio se escriben por bidón en cada sesión.

export const TIPOS = [
  { value: 'gel', label: 'Gel' },
  { value: 'solido', label: 'Sólido' },
  { value: 'bidon', label: 'Bidón' },
]

export const LIMITES_PRODUCTO = { carbohidratos_g: 200, cafeina_mg: 400, sodio_mg: 3000, volumen_ml: 2000 }
export const MAX_CANTIDAD = 20
export const MAX_ITEMS = 30

const entero = (v, max) => {
  if (v === '' || v == null) return 0
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0
}

export const etiquetaTipo = (t) => TIPOS.find((x) => x.value === t)?.label || ''

// Formulario del catálogo → fila a guardar, o null si no vale (sin nombre / tipo)
export function normalizarProducto(form) {
  const nombre = typeof form?.nombre === 'string' ? form.nombre.trim().slice(0, 60) : ''
  const tipo = TIPOS.some((t) => t.value === form?.tipo) ? form.tipo : null
  if (!nombre || !tipo) return null
  return {
    nombre,
    tipo,
    carbohidratos_g: entero(form.carbohidratos_g, LIMITES_PRODUCTO.carbohidratos_g),
    cafeina_mg: entero(form.cafeina_mg, LIMITES_PRODUCTO.cafeina_mg),
    sodio_mg: entero(form.sodio_mg, LIMITES_PRODUCTO.sodio_mg),
    volumen_ml: tipo === 'bidon' ? entero(form.volumen_ml, LIMITES_PRODUCTO.volumen_ml) : 0,
  }
}

// Producto del catálogo → item de sesión (por unidad)
export const itemDeProducto = (p, cantidad = 1) => ({
  producto_id: p.id,
  nombre: p.nombre,
  tipo: p.tipo,
  cantidad,
  carbohidratos_g: p.carbohidratos_g || 0,
  cafeina_mg: p.cafeina_mg || 0,
  sodio_mg: p.sodio_mg || 0,
  volumen_ml: p.volumen_ml || 0,
})

// Items sueltos (del formulario o de la BD) → lista limpia, o null si no queda
// ninguno con cantidad. Nunca se fía de lo que llega: recorta y redondea.
export function normalizarItems(items) {
  if (!Array.isArray(items)) return null
  const limpios = []
  for (const it of items.slice(0, MAX_ITEMS)) {
    const cantidad = entero(it?.cantidad, MAX_CANTIDAD)
    const nombre = typeof it?.nombre === 'string' ? it.nombre.trim().slice(0, 60) : ''
    if (!cantidad || !nombre) continue
    limpios.push({
      producto_id: typeof it.producto_id === 'string' ? it.producto_id : null,
      nombre,
      tipo: TIPOS.some((t) => t.value === it.tipo) ? it.tipo : 'gel',
      cantidad,
      carbohidratos_g: entero(it.carbohidratos_g, LIMITES_PRODUCTO.carbohidratos_g),
      cafeina_mg: entero(it.cafeina_mg, LIMITES_PRODUCTO.cafeina_mg),
      sodio_mg: entero(it.sodio_mg, LIMITES_PRODUCTO.sodio_mg),
      volumen_ml: entero(it.volumen_ml, LIMITES_PRODUCTO.volumen_ml),
    })
  }
  return limpios.length ? limpios : null
}

// Lista de items de una fila de sesion_nutricion (siempre un array)
export const itemsDe = (n) => normalizarItems(n?.productos) || []

// Totales de la sesión
export function totalesItems(items) {
  const t = { hidratos_g: 0, cafeina_mg: 0, sodio_mg: 0, liquido_ml: 0 }
  for (const it of items || []) {
    const c = it.cantidad || 0
    t.hidratos_g += c * (it.carbohidratos_g || 0)
    t.cafeina_mg += c * (it.cafeina_mg || 0)
    t.sodio_mg += c * (it.sodio_mg || 0)
    t.liquido_ml += c * (it.volumen_ml || 0)
  }
  return t
}

// Totales por hora de la sesión (null si no se sabe la duración)
export function porHora(totales, minutos) {
  if (!totales || !(minutos > 0)) return null
  const h = minutos / 60
  return {
    carbohidratos_g_h: Math.round(totales.hidratos_g / h),
    liquido_ml_h: Math.round(totales.liquido_ml / h),
    sodio_mg_h: Math.round(totales.sodio_mg / h),
  }
}

// La fila con los g/h CALCULADOS desde los productos y la duración. Sin
// productos (planes antiguos, a mano) devuelve la fila tal cual. Así lo que
// compara con lo tomado ("35 de 60 g/h") y el aviso funcionan igual.
export function planEfectivo(n, minutos) {
  const items = itemsDe(n)
  if (!n || !items.length) return n
  const ph = porHora(totalesItems(items), minutos)
  return { ...n, carbohidratos_g_h: ph ? ph.carbohidratos_g_h : null, liquido_ml_h: ph ? ph.liquido_ml_h : null, sodio_mg_h: ph ? ph.sodio_mg_h : null }
}

// "3 × Gel 45 g · 2 × Bidón 750"
export const resumenItems = (items) => (items || []).map((it) => `${it.cantidad} × ${it.nombre}`).join(' · ')

const litros = (ml) => `${(ml / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} l`

// "135 g hidratos · 130 mg cafeína · 1,5 l"
export function resumenTotales(t) {
  if (!t) return ''
  const partes = []
  if (t.hidratos_g) partes.push(`${t.hidratos_g} g hidratos`)
  if (t.cafeina_mg) partes.push(`${t.cafeina_mg} mg cafeína`)
  if (t.sodio_mg) partes.push(`${t.sodio_mg} mg sodio`)
  if (t.liquido_ml) partes.push(litros(t.liquido_ml))
  return partes.join(' · ')
}

// Texto corto de un producto del catálogo: "45 g · 130 mg cafeína" / "750 ml"
export function detalleProducto(p) {
  const partes = []
  if (p.tipo === 'bidon') partes.push(`${p.volumen_ml} ml`)
  if (p.carbohidratos_g) partes.push(`${p.carbohidratos_g} g`)
  if (p.cafeina_mg) partes.push(`${p.cafeina_mg} mg cafeína`)
  if (p.sodio_mg) partes.push(`${p.sodio_mg} mg sodio`)
  return partes.join(' · ')
}

// ── Receta de un bidón ──────────────────────────────────────────────────────
// Jon pone los hidratos y el sodio del bidón; al atleta le salen los GRAMOS de
// cada polvo a pesar: maltodextrina + fructosa (proporción 2:1, la que usa
// Lucas) y sales (Evolytes). Valores de las etiquetas (2026-11-19):
//   maltodextrina HSN 95 g hidratos/100 g · fructosa HSN 100 g/100 g ·
//   Evolytes Powder 355,7 mg de sodio por 2,5 g (≈ 142,3 mg/g).
// Se da en gramos (báscula) y no en dosificadores: la etiqueta de la
// maltodextrina es ambigua (50 ml / 50 g). Lo poco de maltodextrina que lleva
// Evolytes no se cuenta (la etiqueta no da sus hidratos).
export const RATIO_MALTO_FRUCTOSA = { maltodextrina: 2, fructosa: 1 }
export const HIDRATOS_POR_G = { maltodextrina: 0.95, fructosa: 1 }
export const SODIO_MG_POR_G_SALES = 355.7 / 2.5

const un1 = (x) => Math.round(x * 10) / 10

// → { maltodextrina_g, fructosa_g, sales_g } por bidón, o null si el bidón no
// lleva hidratos ni sodio (agua sola) o el item no es un bidón.
export function recetaBidon(item) {
  if (!item || item.tipo !== 'bidon') return null
  const hidratos = Number(item.carbohidratos_g) || 0
  const sodio = Number(item.sodio_mg) || 0
  if (hidratos <= 0 && sodio <= 0) return null
  const { maltodextrina: m, fructosa: f } = RATIO_MALTO_FRUCTOSA
  const total = m + f
  return {
    maltodextrina_g: un1((hidratos * (m / total)) / HIDRATOS_POR_G.maltodextrina),
    fructosa_g: un1((hidratos * (f / total)) / HIDRATOS_POR_G.fructosa),
    sales_g: un1(sodio / SODIO_MG_POR_G_SALES),
  }
}

// 42,1 → "42" · 4,2 → "4,2" (a partir de 10 g sobran los decimales)
const fmtG = (g) => (g >= 10 ? String(Math.round(g)) : g.toLocaleString('es-ES', { maximumFractionDigits: 1 }))

// "42 g maltodextrina · 20 g fructosa · 4,2 g sales" (solo lo que haya) o ''
export function textoReceta(item) {
  const r = recetaBidon(item)
  if (!r) return ''
  const partes = []
  if (r.maltodextrina_g > 0) partes.push(`${fmtG(r.maltodextrina_g)} g maltodextrina`)
  if (r.fructosa_g > 0) partes.push(`${fmtG(r.fructosa_g)} g fructosa`)
  if (r.sales_g > 0) partes.push(`${fmtG(r.sales_g)} g sales`)
  return partes.join(' · ')
}
