import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avisoTomado, normalizarNutricion, normalizarTomado, resumenNutricion, resumenTomado, tienePlan, tieneTomado,
} from '../src/lib/nutricion.js'
import { segundosPrevistos } from '../src/lib/tssPrevisto.js'

const paso = (cantidad, unidad, zona) => ({ tipo: 'step', cantidad, unidad, ...(zona ? { objetivo_tipo: 'zona', objetivo_valor: zona } : {}) })
const sesion = (disciplina, bloques, extra = {}) => ({ disciplina, workout_steps: { bloques }, ...extra })

test('segundosPrevistos: pasos por tiempo, series y fallback a duracion_min', () => {
  assert.equal(segundosPrevistos(sesion('run', [paso(10, 'min'), { tipo: 'repeat', repeticiones: 4, pasos: [paso(3, 'min'), paso(90, 's')] }])), 600 + 4 * 270)
  assert.equal(segundosPrevistos({ disciplina: 'bike', duracion_min: 120 }), 7200)
  assert.equal(segundosPrevistos({ disciplina: 'bike' }), null)
})

test('segundosPrevistos: pasos por distancia con el ritmo de referencia', () => {
  // 10 km de carrera a 5:45/km ≈ 57,5 min
  assert.equal(segundosPrevistos(sesion('run', [paso(10, 'km')])), 3450)
})

test('normalizar: vacío → null; fuera de rango → null; notas recortadas', () => {
  assert.equal(normalizarNutricion({ carbohidratos_g_h: '', notas: '  ' }), null)
  assert.deepEqual(normalizarNutricion({ carbohidratos_g_h: '60', liquido_ml_h: 5000, sodio_mg_h: -1, notas: ' gel min 40 ' }), {
    carbohidratos_g_h: 60, liquido_ml_h: null, sodio_mg_h: null, productos: null, notas: 'gel min 40',
  })
  assert.equal(normalizarNutricion({ carbohidratos_g_h: 0 }).carbohidratos_g_h, 0)
  assert.equal(normalizarNutricion({ notas: 'x'.repeat(900) }).notas.length, 400)
})

test('resumen y totales', () => {
  assert.equal(resumenNutricion({ carbohidratos_g_h: 60, liquido_ml_h: 600, sodio_mg_h: 400 }), '60 g/h · 600 ml/h · 400 mg sodio/h')
  assert.equal(resumenNutricion({ carbohidratos_g_h: 0, liquido_ml_h: 500 }), 'Sin comer · 500 ml/h')
})

test('tomado: normaliza, vacío → null, estómago 1–3', () => {
  assert.equal(normalizarTomado({ tomado_notas: ' ' }), null)
  assert.deepEqual(normalizarTomado({ tomado_carbohidratos_g_h: '50', estomago: 4, tomado_notas: ' 2 geles ' }), {
    tomado_carbohidratos_g_h: 50, tomado_liquido_ml_h: null, estomago: null, tomado_items: null, tomado_notas: '2 geles',
  })
  assert.equal(normalizarTomado({ estomago: 2 }).estomago, 2)
})

test('tomado: resumen con el plan al lado y avisos para el coach', () => {
  const n = { carbohidratos_g_h: 60, liquido_ml_h: 600, tomado_carbohidratos_g_h: 50, tomado_liquido_ml_h: 500, estomago: 2 }
  assert.equal(resumenTomado(n), '50 de 60 g/h · 500 de 600 ml/h · Estómago regular')
  assert.equal(resumenTomado({ tomado_carbohidratos_g_h: 40 }), '40 g/h')
  assert.equal(avisoTomado(n), null)
  assert.equal(avisoTomado({ ...n, estomago: 1 }), 'Le sentó mal')
  assert.equal(avisoTomado({ ...n, tomado_carbohidratos_g_h: 30 }), 'Comió bastante menos de lo previsto')
  assert.equal(resumenTomado(null), '')
})

test('plan y tomado se distinguen', () => {
  assert.equal(tienePlan({ tomado_carbohidratos_g_h: 40 }), false)
  assert.equal(tieneTomado({ tomado_carbohidratos_g_h: 40 }), true)
  assert.equal(tienePlan({ carbohidratos_g_h: 0 }), true)
  assert.equal(tieneTomado({ carbohidratos_g_h: 0 }), false)
})
