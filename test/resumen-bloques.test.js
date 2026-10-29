import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumenBloque, nombrePorDefecto, pasoTexto } from '../src/components/workout/resumen.js'

const paso = (cantidad, unidad, extra = {}) => ({ tipo: 'step', cantidad, unidad, objetivo_tipo: null, objetivo_valor: null, nombre: null, ...extra })
const zona = (z) => ({ objetivo_tipo: 'zona', objetivo_valor: z })

test('resumen de un bloque suelto', () => {
  assert.equal(resumenBloque({ ...paso(15, 'min', zona('Z1')), tipo: 'warmup' }), '15′ Z1')
  assert.equal(resumenBloque(paso(400, 'mtr', { nombre: 'Progresivo' })), '400 m · Progresivo')
  assert.equal(resumenBloque(paso(10, 'km', { objetivo_tipo: 'ritmo', objetivo_valor: '4:50-5:10' })), '10 km 4:50-5:10')
  assert.equal(resumenBloque(paso(30, 'min', { objetivo_tipo: 'fc', objetivo_valor: '75' })), '30′ 75% FC')
  assert.equal(resumenBloque(paso('', 'min')), 'Sin definir')
})

test('resumen de una serie', () => {
  const serie = { tipo: 'repeat', repeticiones: 6, pasos: [paso(3, 'min', zona('Z4')), paso(2, 'min', zona('Z1'))] }
  assert.equal(resumenBloque(serie), '6 × (3′ Z4 / 2′ Z1)')
  assert.equal(resumenBloque({ tipo: 'repeat', repeticiones: 8, pasos: [paso(100, 'mtr')] }), '8 × 100 m')
  assert.equal(resumenBloque({ tipo: 'repeat', repeticiones: 4, pasos: [] }), '4 × sin pasos')
})

test('nombre por defecto: manda la serie; si no, el paso único; si no, la disciplina', () => {
  const bloques = [
    { ...paso(15, 'min', zona('Z1')), tipo: 'warmup' },
    { tipo: 'repeat', repeticiones: 6, pasos: [paso(3, 'min', { ...zona('Z4'), nombre: 'fuerte' }), paso(2, 'min')] },
  ]
  assert.equal(nombrePorDefecto('run', bloques), 'Carrera · 6×3′ Z4')
  assert.equal(nombrePorDefecto('bike', [paso(90, 'min', zona('Z2'))]), 'Ciclismo · 90′ Z2')
  assert.equal(nombrePorDefecto('swim', []), 'Natación')
  assert.equal(nombrePorDefecto('strength', [paso(10, 'min'), paso(40, 'min')]), 'Fuerza')
  assert.equal(pasoTexto(paso(3, 'min', { nombre: 'x' }), { conNombre: false }), '3′')
})
