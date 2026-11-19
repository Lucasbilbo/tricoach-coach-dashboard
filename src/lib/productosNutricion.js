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
export const MAX_MINUTO = 720

const entero = (v, max) => {
  if (v === '' || v == null) return 0
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : 0
}

export const etiquetaTipo = (t) => TIPOS.find((x) => x.value === t)?.label || ''

// Gramos con un decimal (13,5 g de maltodextrina), 0 si no vale
const gramos = (v) => {
  if (v === '' || v == null) return 0
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 10) / 10, MAX_GRAMOS_RECETA) : 0
}
export const MAX_GRAMOS_RECETA = 300

// Receta de un bidón en GRAMOS a pesar: { maltodextrina_g, fructosa_g, sales_g }
// o null si no lleva nada. Es lo que el atleta prepara tal cual.
export function normalizarReceta(r) {
  if (!r || typeof r !== 'object') return null
  const receta = { maltodextrina_g: gramos(r.maltodextrina_g), fructosa_g: gramos(r.fructosa_g), sales_g: gramos(r.sales_g) }
  return receta.maltodextrina_g || receta.fructosa_g || receta.sales_g ? receta : null
}

// Hidratos y sodio que aporta una receta (para totales y g/h)
export const aportesReceta = (r) => ({
  carbohidratos_g: Math.round(r.maltodextrina_g * HIDRATOS_POR_G.maltodextrina + r.fructosa_g * HIDRATOS_POR_G.fructosa),
  sodio_mg: Math.round(r.sales_g * SODIO_MG_POR_G_SALES),
})

// Formulario del catálogo → fila a guardar, o null si no vale (sin nombre / tipo).
// Un bidón con RECETA (gramos) calcula de ella sus hidratos y su sodio; sin
// receta es "a medida": se escriben en cada sesión.
export function normalizarProducto(form) {
  const nombre = typeof form?.nombre === 'string' ? form.nombre.trim().slice(0, 60) : ''
  const tipo = TIPOS.some((t) => t.value === form?.tipo) ? form.tipo : null
  if (!nombre || !tipo) return null
  const receta = tipo === 'bidon' ? normalizarReceta(form) : null
  const aportes = receta ? aportesReceta(receta) : null
  return {
    nombre,
    tipo,
    carbohidratos_g: aportes ? aportes.carbohidratos_g : entero(form.carbohidratos_g, LIMITES_PRODUCTO.carbohidratos_g),
    cafeina_mg: entero(form.cafeina_mg, LIMITES_PRODUCTO.cafeina_mg),
    sodio_mg: aportes ? aportes.sodio_mg : entero(form.sodio_mg, LIMITES_PRODUCTO.sodio_mg),
    volumen_ml: tipo === 'bidon' ? entero(form.volumen_ml, LIMITES_PRODUCTO.volumen_ml) : 0,
    receta,
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
  ...(normalizarReceta(p.receta) ? { receta: normalizarReceta(p.receta) } : {}),
})

// Minutos en que se toma cada unidad: array de como mucho `cantidad` valores
// (null = sin hora). Se recorta a la cantidad y se quitan los null del final.
function minutosDe(it, cantidad) {
  if (!Array.isArray(it?.minutos)) return null
  const lista = it.minutos.slice(0, cantidad).map((v) => {
    if (v === '' || v == null) return null
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_MINUTO) : null
  })
  while (lista.length && lista[lista.length - 1] === null) lista.pop()
  return lista.length ? lista : null
}

// Items sueltos (del formulario o de la BD) → lista limpia, o null si no queda
// ninguno con cantidad. Nunca se fía de lo que llega: recorta y redondea.
export function normalizarItems(items) {
  if (!Array.isArray(items)) return null
  const limpios = []
  for (const it of items.slice(0, MAX_ITEMS)) {
    const cantidad = entero(it?.cantidad, MAX_CANTIDAD)
    const nombre = typeof it?.nombre === 'string' ? it.nombre.trim().slice(0, 60) : ''
    if (!cantidad || !nombre) continue
    const minutos = minutosDe(it, cantidad)
    const receta = it.tipo === 'bidon' ? normalizarReceta(it.receta) : null
    limpios.push({
      ...(minutos ? { minutos } : {}),
      ...(receta ? { receta } : {}),
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

// ── Tonicidad de un bidón ───────────────────────────────────────────────────
// Se clasifica por la concentración de hidratos (g por 100 ml): isotónico hasta
// el 8 %, hipertónico por encima. Sin "hipotónico" (decidido 2026-11-20: la
// natación de 3,9 % cuenta como isotónica). Aproximación solo por hidratos (la
// osmolaridad real también depende de las sales). Se calcula, no se guarda.
export const TONICIDAD = { hipertonicoDesde: 8 }

// → { pct, tipo, texto: "7,3 % · isotónico" } o null (agua, no es bidón, sin ml)
export function tonicidadBidon(it) {
  if (!it || it.tipo !== 'bidon') return null
  const ml = Number(it.volumen_ml) || 0
  const r = normalizarReceta(it.receta)
  // Con receta propia se usan sus gramos exactos (no los hidratos redondeados)
  const hidratos = r ? r.maltodextrina_g * HIDRATOS_POR_G.maltodextrina + r.fructosa_g * HIDRATOS_POR_G.fructosa : Number(it.carbohidratos_g) || 0
  if (hidratos <= 0 || ml <= 0) return null
  const pct = Math.round((hidratos / ml) * 1000) / 10
  const tipo = pct <= TONICIDAD.hipertonicoDesde ? 'isotónico' : 'hipertónico'
  return { pct, tipo, texto: `${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} % · ${tipo}` }
}

// Texto corto de un producto del catálogo: "45 g · 130 mg cafeína" / "750 ml"
export function detalleProducto(p) {
  const partes = []
  if (p.tipo === 'bidon') partes.push(`${p.volumen_ml} ml`)
  if (p.carbohidratos_g) partes.push(`${p.carbohidratos_g} g`)
  if (p.cafeina_mg) partes.push(`${p.cafeina_mg} mg cafeína`)
  if (p.sodio_mg) partes.push(`${p.sodio_mg} mg sodio`)
  const t = tonicidadBidon(p)
  if (t) partes.push(t.texto)
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
  // Receta propia del producto (gramos exactos): se da tal cual
  const propia = normalizarReceta(item.receta)
  if (propia) return propia
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
  // Gramos exactos de una receta propia (13,5 g); los calculados se redondean
  const f = normalizarReceta(item.receta) ? (g) => g.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : fmtG
  const partes = []
  if (r.maltodextrina_g > 0) partes.push(`${f(r.maltodextrina_g)} g maltodextrina`)
  if (r.fructosa_g > 0) partes.push(`${f(r.fructosa_g)} g fructosa`)
  if (r.sales_g > 0) partes.push(`${f(r.sales_g)} g sales`)
  return partes.join(' · ')
}


// ── Cuándo se toma cada unidad ──────────────────────────────────────────────
// Jon pone un minuto a cada unidad (gel, guayaba, bidón: el minuto en que se
// EMPIEZA). Es opcional: lo que no tiene minuto sale aparte ("sin hora").

// Reparto parejo como PUNTO DE PARTIDA que Jon puede cambiar (nunca se aplica
// solo): geles y sólidos entre el inicio y el final; bidones desde el minuto 0.
// Redondeado a 5 min. Sin duración → [].
export function repartirMinutos(cantidad, duracionMin, tipo) {
  const n = Math.round(Number(cantidad)) || 0
  if (!(duracionMin > 0) || n < 1) return []
  const r5 = (x) => Math.min(Math.round(duracionMin), Math.round(x / 5) * 5)
  return Array.from({ length: n }, (_, i) => r5(tipo === 'bidon' ? (i * duracionMin) / n : ((i + 1) * duracionMin) / (n + 1)))
}

// Items → { eventos: [{min, nombre, tipo, pasa}] ordenados por minuto,
// sinHora: [{nombre, cantidad}] }. `pasa`: el minuto cae después del final.
export function lineaTiempo(items, duracionMin) {
  const eventos = []
  const sinHora = []
  for (const it of items || []) {
    const n = it.cantidad || 0
    let libres = 0
    for (let i = 0; i < n; i++) {
      const m = it.minutos?.[i]
      const v = m === '' || m == null ? NaN : Number(m)
      if (Number.isFinite(v) && v >= 0) {
        const min = Math.round(v)
        eventos.push({ min, nombre: it.nombre, tipo: it.tipo, pasa: duracionMin > 0 && min > duracionMin })
      } else libres++
    }
    if (libres) sinHora.push({ nombre: it.nombre, cantidad: libres })
  }
  eventos.sort((a, b) => a.min - b.min)
  return { eventos, sinHora }
}

// 75 → "1:15" (para leerlo como hora de carrera)
export const minutoComoHora = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`


// ── Lo que el atleta se ha tomado, unidad a unidad ──────────────────────────
// Cada unidad del plan tiene una CLAVE estable ("<producto>#<n>"); el atleta
// marca las que se toma y se guardan sus claves (sesion_nutricion.tomado_items,
// migración 019). Los g/h tomados salen de ahí. Si el plan cambia, las claves
// que ya no existen se ignoran.
export const claveUnidad = (item, i) => `${item.producto_id || item.nombre}#${i}`

// Todas las unidades del plan, en el orden en que se toman (las sin hora, al final)
export function unidadesOrdenadas(items) {
  const out = []
  for (const it of items || []) {
    const n = it.cantidad || 0
    for (let i = 0; i < n; i++) {
      const m = it.minutos?.[i]
      const v = m === '' || m == null ? NaN : Number(m)
      out.push({ clave: claveUnidad(it, i), nombre: it.nombre, tipo: it.tipo, item: it, min: Number.isFinite(v) && v >= 0 ? Math.round(v) : null, orden: out.length })
    }
  }
  return out.sort((a, b) => (a.min == null) - (b.min == null) || (a.min ?? 0) - (b.min ?? 0) || a.orden - b.orden)
}

// Claves sueltas → lista limpia (sin repetidos, recortada) o null si no queda ninguna
export function normalizarClaves(claves) {
  if (!Array.isArray(claves)) return null
  const vistas = new Set()
  for (const c of claves) {
    if (typeof c === 'string' && c.length > 0 && c.length <= 80) vistas.add(c)
    if (vistas.size >= 60) break
  }
  return vistas.size ? [...vistas] : null
}

// Las marcadas que siguen existiendo en el plan
export function tomadasValidas(items, claves) {
  const marcadas = new Set(Array.isArray(claves) ? claves : [])
  return unidadesOrdenadas(items).filter((u) => marcadas.has(u.clave))
}

// Totales de lo tomado (mismo formato que totalesItems)
export const totalesTomados = (items, claves) =>
  totalesItems(tomadasValidas(items, claves).map((u) => ({ ...u.item, cantidad: 1 })))
