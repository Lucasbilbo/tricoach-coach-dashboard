// Tests de lo que llega al reloj: `npm test` (node --test, sin dependencias).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { duracionTotalMin, ritmoValido, ritmosInvalidos } from '../src/components/workout/constants.js'

const require = createRequire(import.meta.url)
const { buildIntervalsText } = require('../netlify/functions/lib/intervals-text.cjs')
const { eventoBorrado } = require('../netlify/functions/lib/intervals-api.js')

const ses = (disciplina, bloques, extra = {}) => ({ disciplina, workout_steps: { bloques, notas: '', ...extra } })
const paso = (cantidad, unidad, objetivo_tipo = null, objetivo_valor = null, nombre = null, material = []) => ({
  cantidad, unidad, objetivo_tipo, objetivo_valor, nombre, material,
})

test('bici: zonas por pulso y sin potencia por defecto (no hay potenciómetro)', () => {
  const t = buildIntervalsText(ses('bike', [
    { tipo: 'warmup', ...paso(30, 'min', 'zona', 'Z1') },
    { tipo: 'step', ...paso(90, 'min', null, null, 'Tranquilo comodo') },
    { tipo: 'repeat', nombre: '', repeticiones: 3, pasos: [paso(8, 'min', 'zona', 'Z3'), paso(5, 'min', 'zona', 'Z1', 'Descanso')] },
  ]))
  assert.match(t, /- 30m Z1 HR @Calentamiento/)
  assert.match(t, /- 90m Z1 HR @Tranquilo comodo/)
  assert.match(t, /- 8m Z3 HR/)
  assert.doesNotMatch(t, / Z\d(?! HR)/) // ninguna zona sin "HR" (sería potencia)
})

test('carrera: rango de ritmo y zona de pulso', () => {
  const t = buildIntervalsText(ses('run', [
    { tipo: 'step', ...paso(50, 'min', 'ritmo', '4:50 - 5:10', 'Z2 alta') },
    { tipo: 'repeat', nombre: '', repeticiones: 5, pasos: [paso(1, 'km', 'zona', 'Z4'), paso(3, 'min', null, null, 'Descanso parado')] },
  ]))
  assert.match(t, /- 50m 4:50-5:10\/km Pace @Z2 alta/)
  assert.match(t, /Serie 5x\n- 1km Z4 HR\n- 3m @Descanso parado/)
})

test('natación: sin ritmo inventado y con el material de cada paso', () => {
  const t = buildIntervalsText(ses('swim', [
    { tipo: 'warmup', ...paso(500, 'mtr', null, null, '75 crol 25 otro') },
    { tipo: 'step', ...paso(200, 'mtr', null, null, 'Z1', ['palas']) },
    { tipo: 'step', ...paso(300, 'mtr', null, null, 'Z1', ['palas', 'aletas']) },
    { tipo: 'cooldown', ...paso(100, 'mtr', null, null, 'Suave') },
  ], { piscina: '50' }))
  assert.doesNotMatch(t, /Pace/)
  assert.match(t, /- 500mtr @Calentamiento · 75 crol 25 otro/)
  assert.match(t, /- 200mtr @Z1 · palas/)
  assert.match(t, /- 300mtr @Z1 · palas, aletas/)
  assert.match(t, /- 100mtr @Vuelta a la calma · Suave/)
})

test('las notas del entrenador nunca van al reloj', () => {
  const s = ses('run', [{ tipo: 'step', ...paso(30, 'min', 'zona', 'Z2') }])
  s.workout_steps.notas = 'secreto'
  assert.doesNotMatch(buildIntervalsText(s), /secreto/)
  assert.match(buildIntervalsText(s, { incluirNotas: true }), /secreto/)
})

test('ritmoValido acepta exacto y rango, rechaza formatos raros', () => {
  for (const ok of ['5:00', '4:50-5:10', '4:50 - 5:10', '1:45-1:50']) assert.equal(ritmoValido(ok), true, ok)
  for (const ko of ['5.30', '5:75', '5', 'rápido', '']) assert.equal(ritmoValido(ko), false, ko)
  assert.deepEqual(ritmosInvalidos([{ tipo: 'repeat', pasos: [paso(1, 'km', 'ritmo', '4.30')] }]), ['4.30'])
})

test('duracionTotalMin: suma por tiempo y null si hay distancia', () => {
  const cambios = [
    { tipo: 'warmup', ...paso(15, 'min') },
    { tipo: 'repeat', repeticiones: 8, pasos: [paso(1, 'min'), paso(1, 'min')] },
    { tipo: 'cooldown', ...paso(10, 'min') },
  ]
  assert.equal(duracionTotalMin(cambios), 41)
  assert.equal(duracionTotalMin([{ tipo: 'repeat', repeticiones: 10, pasos: [paso(20, 's'), paso(100, 's')] }]), 20)
  assert.equal(duracionTotalMin([{ tipo: 'step', ...paso(400, 'mtr') }]), null)
  assert.equal(duracionTotalMin([]), null)
})

test('eventoBorrado: 2xx y 404 cuentan como borrado', () => {
  assert.equal(eventoBorrado({ status: 200 }), true)
  assert.equal(eventoBorrado({ status: 404 }), true)
  assert.equal(eventoBorrado({ status: 500 }), false)
  assert.equal(eventoBorrado({ status: 0 }), false)
})
