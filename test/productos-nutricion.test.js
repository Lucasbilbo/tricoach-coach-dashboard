import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detalleProducto, itemDeProducto, itemsDe, normalizarItems, normalizarProducto, planEfectivo, porHora,
  recetaBidon, resumenItems, resumenTotales, textoReceta, totalesItems,
} from '../src/lib/productosNutricion.js'
import { formPlanDe, normalizarNutricion, resumenPlan, tienePlan, avisoTomado } from '../src/lib/nutricion.js'

const gel45 = { id: 'g45', nombre: 'Gel 45 g', tipo: 'gel', carbohidratos_g: 45, cafeina_mg: 0, sodio_mg: 0, volumen_ml: 0 }
const gelCaf = { id: 'g45c', nombre: 'Gel 45 g · cafeína 130 mg', tipo: 'gel', carbohidratos_g: 45, cafeina_mg: 130, sodio_mg: 0, volumen_ml: 0 }
const bidon = { id: 'b800', nombre: 'Bidón 800', tipo: 'bidon', carbohidratos_g: 0, cafeina_mg: 0, sodio_mg: 0, volumen_ml: 800 }

test('normalizarProducto: exige nombre y tipo; solo los bidones llevan ml', () => {
  assert.equal(normalizarProducto({ nombre: '  ', tipo: 'gel' }), null)
  assert.equal(normalizarProducto({ nombre: 'Gel', tipo: 'otro' }), null)
  assert.deepEqual(normalizarProducto({ nombre: ' Gel 30 g ', tipo: 'gel', carbohidratos_g: '30', volumen_ml: 500 }), {
    nombre: 'Gel 30 g', tipo: 'gel', carbohidratos_g: 30, cafeina_mg: 0, sodio_mg: 0, volumen_ml: 0, receta: null,
  })
  assert.equal(normalizarProducto({ nombre: 'Bidón 750', tipo: 'bidon', volumen_ml: '750' }).volumen_ml, 750)
  assert.equal(normalizarProducto({ nombre: 'x', tipo: 'gel', carbohidratos_g: 9999 }).carbohidratos_g, 200)
})

test('itemDeProducto copia los valores por unidad', () => {
  assert.deepEqual(itemDeProducto(gelCaf, 2), {
    producto_id: 'g45c', nombre: 'Gel 45 g · cafeína 130 mg', tipo: 'gel', cantidad: 2, carbohidratos_g: 45, cafeina_mg: 130, sodio_mg: 0, volumen_ml: 0,
  })
})

test('normalizarItems: descarta cantidad 0 y basura; vacío → null', () => {
  assert.equal(normalizarItems([]), null)
  assert.equal(normalizarItems(null), null)
  assert.equal(normalizarItems([{ ...itemDeProducto(gel45, 0) }]), null)
  const r = normalizarItems([itemDeProducto(gel45, 3), { nombre: '', cantidad: 2 }, { ...itemDeProducto(bidon, 1), carbohidratos_g: '40', sodio_mg: '600' }])
  assert.equal(r.length, 2)
  assert.equal(r[1].carbohidratos_g, 40)
  assert.equal(r[1].sodio_mg, 600)
  assert.equal(normalizarItems([itemDeProducto(gel45, 99)])[0].cantidad, 20)
})

test('totales: 3 geles de 45 + 1 con cafeína + 2 bidones de 800 con mezcla', () => {
  const items = [
    itemDeProducto(gel45, 3),
    itemDeProducto(gelCaf, 1),
    { ...itemDeProducto(bidon, 2), carbohidratos_g: 40, sodio_mg: 600 },
  ]
  const t = totalesItems(items)
  assert.deepEqual(t, { hidratos_g: 3 * 45 + 45 + 80, cafeina_mg: 130, sodio_mg: 1200, liquido_ml: 1600 })
  assert.equal(resumenTotales(t), '260 g hidratos · 130 mg cafeína · 1200 mg sodio · 1,6 l')
  assert.equal(resumenItems(items), '3 × Gel 45 g · 1 × Gel 45 g · cafeína 130 mg · 2 × Bidón 800')
})

test('porHora: con duración divide; sin duración → null', () => {
  const t = totalesItems([itemDeProducto(gel45, 4)]) // 180 g
  assert.deepEqual(porHora(t, 180), { carbohidratos_g_h: 60, liquido_ml_h: 0, sodio_mg_h: 0 })
  assert.equal(porHora(t, null), null)
  assert.equal(porHora(t, 0), null)
})

test('planEfectivo: con productos calcula los g/h; sin productos deja la fila', () => {
  const fila = { productos: [itemDeProducto(gel45, 4)], carbohidratos_g_h: null, notas: null }
  assert.equal(planEfectivo(fila, 180).carbohidratos_g_h, 60)
  assert.equal(planEfectivo(fila, null).carbohidratos_g_h, null)
  const antigua = { carbohidratos_g_h: 45, liquido_ml_h: 600, productos: null }
  assert.equal(planEfectivo(antigua, 120), antigua)
  assert.equal(planEfectivo(null, 120), null)
})

test('lo tomado se compara con los g/h calculados (aviso si comió < 70 %)', () => {
  const fila = { productos: [itemDeProducto(gel45, 4)], tomado_carbohidratos_g_h: 30 }
  assert.equal(avisoTomado(planEfectivo(fila, 180)), 'Comió bastante menos de lo previsto')
  assert.equal(avisoTomado(planEfectivo({ ...fila, tomado_carbohidratos_g_h: 55 }, 180)), null)
})

test('normalizarNutricion: con productos anula las cantidades por hora antiguas', () => {
  const f = normalizarNutricion({ carbohidratos_g_h: 60, liquido_ml_h: 600, productos: [itemDeProducto(gel45, 2)], notas: '' })
  assert.equal(f.carbohidratos_g_h, null)
  assert.equal(f.liquido_ml_h, null)
  assert.equal(f.productos.length, 1)
  // solo productos ya es una fila válida (no vacía)
  assert.notEqual(normalizarNutricion({ productos: [itemDeProducto(gel45, 1)] }), null)
  assert.equal(normalizarNutricion({ productos: [] }), null)
})

test('tienePlan y formPlanDe con productos', () => {
  const n = { productos: [itemDeProducto(gel45, 2)] }
  assert.equal(tienePlan(n), true)
  assert.equal(formPlanDe(n).productos.length, 1)
  assert.deepEqual(formPlanDe(null).productos, [])
  assert.deepEqual(itemsDe({ productos: 'basura' }), [])
})

test('resumenPlan: productos con g/h si hay duración; antiguos como antes', () => {
  const n = { productos: [itemDeProducto(gel45, 4)] }
  assert.equal(resumenPlan(n, 180), '4 × Gel 45 g · 60 g/h')
  assert.equal(resumenPlan(n, null), '4 × Gel 45 g')
  assert.equal(resumenPlan({ carbohidratos_g_h: 45, liquido_ml_h: 600 }, 120), '45 g/h · 600 ml/h')
})

test('detalleProducto', () => {
  assert.equal(detalleProducto(gelCaf), '45 g · 130 mg cafeína')
  assert.equal(detalleProducto(bidon), '800 ml')
})

test('receta de bidón: 60 g de hidratos y 600 mg de sodio en 2:1', () => {
  const it = { ...itemDeProducto(bidon, 1), carbohidratos_g: 60, sodio_mg: 600 }
  const r = recetaBidon(it)
  assert.equal(r.maltodextrina_g, 42.1) // 40 g de hidratos / 0,95
  assert.equal(r.fructosa_g, 20)
  assert.equal(r.sales_g, 4.2) // 600 mg / 142,3 mg por g
  assert.equal(textoReceta(it), '42 g maltodextrina · 20 g fructosa · 4,2 g sales')
})

test('receta de bidón: solo sodio, solo hidratos, agua sola y no bidones', () => {
  assert.equal(textoReceta({ ...itemDeProducto(bidon, 1), sodio_mg: 300 }), '2,1 g sales')
  const soloH = recetaBidon({ ...itemDeProducto(bidon, 1), carbohidratos_g: 30 })
  assert.equal(soloH.sales_g, 0)
  assert.equal(textoReceta({ ...itemDeProducto(bidon, 1), carbohidratos_g: 30 }), '21 g maltodextrina · 10 g fructosa')
  assert.equal(recetaBidon(itemDeProducto(bidon, 1)), null)
  assert.equal(recetaBidon({ ...itemDeProducto(gel45, 1), carbohidratos_g: 45 }), null)
  assert.equal(recetaBidon(null), null)
})

// ── Minutos por unidad ──
import { lineaTiempo, minutoComoHora, repartirMinutos } from '../src/lib/productosNutricion.js'

test('normalizarItems: minutos recortados a la cantidad, sin null finales', () => {
  const base = { nombre: 'Gel 45 g', tipo: 'gel', carbohidratos_g: 45 }
  const [a] = normalizarItems([{ ...base, cantidad: 2, minutos: ['30', '', 90, 120] }])
  assert.deepEqual(a.minutos, [30])
  const [m] = normalizarItems([{ ...base, cantidad: 3, minutos: ['', 40] }])
  assert.deepEqual(m.minutos, [null, 40])
  const [b] = normalizarItems([{ ...base, cantidad: 2, minutos: ['', null] }])
  assert.equal('minutos' in b, false)
  const [c] = normalizarItems([{ ...base, cantidad: 1, minutos: [-5] }])
  assert.equal('minutos' in c, false)
  const [d] = normalizarItems([{ ...base, cantidad: 1, minutos: [99999] }])
  assert.deepEqual(d.minutos, [720])
})

test('repartirMinutos: geles entre inicio y final; bidones desde el 0', () => {
  assert.deepEqual(repartirMinutos(3, 120, 'gel'), [30, 60, 90])
  assert.deepEqual(repartirMinutos(2, 180, 'bidon'), [0, 90])
  assert.deepEqual(repartirMinutos(2, 0, 'gel'), [])
})

test('lineaTiempo: ordena por minuto, aparta sin hora y marca los que pasan del final', () => {
  const items = [
    { nombre: 'Gel', tipo: 'gel', cantidad: 3, minutos: [60, null, 30] },
    { nombre: 'Bidón 800', tipo: 'bidon', cantidad: 1, minutos: [150] },
  ]
  const { eventos, sinHora } = lineaTiempo(items, 120)
  assert.deepEqual(eventos.map((e) => e.min), [30, 60, 150])
  assert.deepEqual(eventos.map((e) => e.pasa), [false, false, true])
  assert.deepEqual(sinHora, [{ nombre: 'Gel', cantidad: 1 }])
  assert.equal(minutoComoHora(75), '1:15')
})

// ── Lo tomado, unidad a unidad ──
import { nutricionEfectiva, normalizarTomado, resumenTomado } from '../src/lib/nutricion.js'
import { claveUnidad, normalizarClaves, tomadasValidas, totalesTomados, unidadesOrdenadas } from '../src/lib/productosNutricion.js'

const PLAN = [
  { producto_id: 'g45', nombre: 'Gel 45 g', tipo: 'gel', cantidad: 3, minutos: [60, 30], carbohidratos_g: 45, cafeina_mg: 0, sodio_mg: 0, volumen_ml: 0 },
  { producto_id: 'b8', nombre: 'Bidón 800', tipo: 'bidon', cantidad: 1, minutos: [0], carbohidratos_g: 40, cafeina_mg: 0, sodio_mg: 600, volumen_ml: 800 },
]

test('unidadesOrdenadas: por minuto, las sin hora al final, con clave estable', () => {
  const u = unidadesOrdenadas(PLAN)
  assert.deepEqual(u.map((x) => [x.nombre, x.min]), [['Bidón 800', 0], ['Gel 45 g', 30], ['Gel 45 g', 60], ['Gel 45 g', null]])
  assert.equal(claveUnidad(PLAN[0], 1), 'g45#1')
  assert.deepEqual(u.map((x) => x.clave), ['b8#0', 'g45#1', 'g45#0', 'g45#2'])
})

test('normalizarClaves y tomadasValidas ignoran repetidas y claves que ya no existen', () => {
  assert.equal(normalizarClaves([]), null)
  assert.equal(normalizarClaves('x'), null)
  assert.deepEqual(normalizarClaves(['a', 'a', '', 5, 'b']), ['a', 'b'])
  assert.deepEqual(tomadasValidas(PLAN, ['g45#0', 'zzz#9']).map((u) => u.clave), ['g45#0'])
})

test('totalesTomados suma solo lo marcado (bidón entero)', () => {
  const t = totalesTomados(PLAN, ['g45#0', 'b8#0'])
  assert.equal(t.hidratos_g, 85)
  assert.equal(t.liquido_ml, 800)
  assert.equal(t.sodio_mg, 600)
})

test('nutricionEfectiva: g/h tomados salen de lo marcado y comparan con el plan', () => {
  const fila = { productos: PLAN, tomado_items: ['g45#0', 'g45#1'], tomado_carbohidratos_g_h: 5, estomago: 3 }
  const ef = nutricionEfectiva(fila, 120)
  // plan: 3×45 + 40 = 175 g en 2 h → 88 g/h; tomado: 90 g en 2 h → 45 g/h
  assert.equal(ef.carbohidratos_g_h, 88)
  assert.equal(ef.tomado_carbohidratos_g_h, 45)
  assert.equal(resumenTomado(ef), '2/4 · 45 de 88 g/h · 0 de 400 ml/h · Estómago bien')
  // sin marcas se respeta lo que escribió a mano
  assert.equal(nutricionEfectiva({ productos: PLAN, tomado_carbohidratos_g_h: 30 }, 120).tomado_carbohidratos_g_h, 30)
})

test('avisoTomado funciona con lo marcado (< 70 % de lo previsto)', () => {
  const ef = nutricionEfectiva({ productos: PLAN, tomado_items: ['g45#0'] }, 120)
  assert.equal(avisoTomado(ef), 'Comió bastante menos de lo previsto')
})

test('normalizarTomado: solo marcas ya es una fila válida', () => {
  assert.deepEqual(normalizarTomado({ tomado_items: ['g45#0'] }).tomado_items, ['g45#0'])
  assert.equal(normalizarTomado({ tomado_items: [] }), null)
})

// ── Recetas de bidón con gramos propios ──
import { aportesReceta, normalizarReceta } from '../src/lib/productosNutricion.js'

test('normalizarReceta: gramos con un decimal; vacío → null', () => {
  assert.deepEqual(normalizarReceta({ maltodextrina_g: '13,5', fructosa_g: 6.54, sales_g: '' }), { maltodextrina_g: 13.5, fructosa_g: 6.5, sales_g: 0 })
  assert.equal(normalizarReceta({ maltodextrina_g: 0, fructosa_g: '' }), null)
  assert.equal(normalizarReceta(null), null)
})

test('aportesReceta: tus recetas dan sus hidratos y sodio', () => {
  assert.deepEqual(aportesReceta({ maltodextrina_g: 13.5, fructosa_g: 6.5, sales_g: 0 }), { carbohidratos_g: 19, sodio_mg: 0 })
  assert.deepEqual(aportesReceta({ maltodextrina_g: 32, fructosa_g: 16, sales_g: 2.5 }), { carbohidratos_g: 46, sodio_mg: 356 })
  assert.deepEqual(aportesReceta({ maltodextrina_g: 40, fructosa_g: 20, sales_g: 2.5 }), { carbohidratos_g: 58, sodio_mg: 356 })
  assert.deepEqual(aportesReceta({ maltodextrina_g: 50, fructosa_g: 25, sales_g: 2.5 }), { carbohidratos_g: 73, sodio_mg: 356 })
})

test('normalizarProducto: un bidón con receta calcula hidratos y sodio; sin receta queda a medida', () => {
  const con = normalizarProducto({ nombre: 'Bidón rodillo', tipo: 'bidon', volumen_ml: 800, maltodextrina_g: '32', fructosa_g: '16', sales_g: '2.5' })
  assert.equal(con.carbohidratos_g, 46)
  assert.equal(con.sodio_mg, 356)
  assert.deepEqual(con.receta, { maltodextrina_g: 32, fructosa_g: 16, sales_g: 2.5 })
  const sin = normalizarProducto({ nombre: 'Bidón 750', tipo: 'bidon', volumen_ml: 750 })
  assert.equal(sin.receta, null)
  assert.equal(normalizarProducto({ nombre: 'Gel', tipo: 'gel', carbohidratos_g: 30 }).receta, null)
})

test('item con receta propia: se copia del producto y se da con los gramos exactos', () => {
  const p = { id: 'p1', nombre: 'Bidón natación', tipo: 'bidon', carbohidratos_g: 19, cafeina_mg: 0, sodio_mg: 0, volumen_ml: 500, receta: { maltodextrina_g: 13.5, fructosa_g: 6.5, sales_g: 0 } }
  const [it] = normalizarItems([itemDeProducto(p, 1)])
  assert.deepEqual(it.receta, p.receta)
  assert.equal(textoReceta(it), '13,5 g maltodextrina · 6,5 g fructosa')
  // sin receta propia sigue el cálculo 2:1 de siempre
  assert.equal(textoReceta({ tipo: 'bidon', carbohidratos_g: 60, sodio_mg: 600 }), '42 g maltodextrina · 20 g fructosa · 4,2 g sales')
})

// ── Tonicidad ──
import { tonicidadBidon } from '../src/lib/productosNutricion.js'

test('tonicidadBidon: tus recetas por concentración de hidratos', () => {
  const b = (ml, m, f) => ({ tipo: 'bidon', volumen_ml: ml, carbohidratos_g: Math.round(m * 0.95 + f), receta: { maltodextrina_g: m, fructosa_g: f, sales_g: 0 } })
  assert.equal(tonicidadBidon(b(500, 13.5, 6.5)).texto, '3,9 % · isotónico')
  assert.equal(tonicidadBidon(b(800, 32, 16)).texto, '5,8 % · isotónico')
  assert.equal(tonicidadBidon(b(800, 40, 20)).texto, '7,3 % · isotónico')
  assert.equal(tonicidadBidon(b(800, 50, 25)).texto, '9,1 % · hipertónico')
  assert.equal(tonicidadBidon(b(800, 55.2, 27.6)).texto, '10 % · hipertónico')
})

test('tonicidadBidon: bidón a medida usa sus hidratos; agua o gel → null', () => {
  assert.equal(tonicidadBidon({ tipo: 'bidon', volumen_ml: 800, carbohidratos_g: 40 }).texto, '5 % · isotónico')
  assert.equal(tonicidadBidon({ tipo: 'bidon', volumen_ml: 800, carbohidratos_g: 0 }), null)
  assert.equal(tonicidadBidon({ tipo: 'gel', volumen_ml: 0, carbohidratos_g: 45 }), null)
})

test('detalleProducto de un bidón incluye su tonicidad', () => {
  assert.match(detalleProducto({ tipo: 'bidon', volumen_ml: 800, carbohidratos_g: 58, sodio_mg: 356, receta: { maltodextrina_g: 40, fructosa_g: 20, sales_g: 2.5 } }), /7,3 % · isotónico/)
})
