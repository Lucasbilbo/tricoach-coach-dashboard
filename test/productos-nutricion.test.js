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
    nombre: 'Gel 30 g', tipo: 'gel', carbohidratos_g: 30, cafeina_mg: 0, sodio_mg: 0, volumen_ml: 0,
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
