import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { parsearEntreno } from '../src/components/workout/parser.js'

const require = createRequire(import.meta.url)
const { buildIntervalsText } = require('../netlify/functions/lib/intervals-text.cjs')
const texto = (disciplina, linea) =>
  buildIntervalsText({ disciplina, workout_steps: { bloques: parsearEntreno(linea, disciplina).bloques } })

test('cambios de Leire en una línea', () => {
  const { bloques, errores } = parsearEntreno("15' Z1 + 8x(1' Z5 / 1' Z1) + 10' Z1", 'run')
  assert.deepEqual(errores, [])
  assert.deepEqual(bloques.map((b) => b.tipo), ['warmup', 'repeat', 'cooldown'])
  assert.equal(bloques[1].repeticiones, 8)
  assert.equal(texto('run', "15' Z1 + 8x(1' Z5 / 1' Z1) + 10' Z1"),
    '- 15m Z1 HR @Calentamiento\n\nSerie 8x\n- 1m Z5 HR\n- 1m Z1 HR\n\n- 10m Z1 HR @Vuelta a la calma')
})

test('distancias, segundos y descanso con nombre', () => {
  const { bloques } = parsearEntreno('20\' + 10x(20" Z5 / 100s rec) + 15\'', 'run')
  assert.deepEqual(bloques[1].pasos.map((p) => [p.cantidad, p.unidad, p.nombre]), [[20, 's', null], [100, 's', 'rec']])
  const series = parsearEntreno("20' + 5x(400m Z4 / 2' rec) + 10'", 'run').bloques[1].pasos[0]
  assert.deepEqual([series.cantidad, series.unidad, series.objetivo_valor], [400, 'mtr', 'Z4'])
  assert.equal(parsearEntreno('1km Z4', 'run').bloques[0].unidad, 'km')
  assert.equal(parsearEntreno('10 minutos suave', 'run').bloques[0].unidad, 'min')
})

test('ritmo exacto y rango', () => {
  const p = parsearEntreno("50' 4:50-5:10", 'run').bloques[0]
  assert.deepEqual([p.objetivo_tipo, p.objetivo_valor], ['ritmo', '4:50-5:10'])
  assert.equal(parsearEntreno("6x(1km 4:20 / 90\")", 'run').bloques[0].pasos[0].objetivo_valor, '4:20')
})

test('natación: material, cal/vc explícitos y zona pasa al nombre', () => {
  const { bloques } = parsearEntreno('cal 500m palas aletas + 4x(100m 1:45 / 20" descanso) + 300m Z1 pull + vc 200m', 'swim')
  assert.deepEqual(bloques.map((b) => b.tipo), ['warmup', 'repeat', 'step', 'cooldown'])
  assert.deepEqual(bloques[0].material, ['palas', 'aletas'])
  assert.equal(bloques[2].objetivo_tipo, null)
  assert.equal(bloques[2].nombre, 'Z1')
  assert.deepEqual(bloques[2].material, ['pull buoy'])
})

test('bici: zona por pulso, ritmo no aplica', () => {
  assert.match(texto('bike', "30' Z1 + 3x(8' Z3 / 5' Z1) + 10' Z1"), /- 8m Z3 HR/)
  assert.equal(parsearEntreno("20' 4:30", 'bike').bloques[0].objetivo_tipo, null)
})

test('un solo bloque suelto no se convierte en calentamiento', () => {
  assert.equal(parsearEntreno("50' Z2", 'run').bloques[0].tipo, 'step')
  assert.deepEqual(parsearEntreno("20' Z1 + 30' Z2", 'run').bloques.map((b) => b.tipo), ['step', 'step'])
})

test('errores legibles', () => {
  const r = parsearEntreno('8x() + bla', 'run')
  assert.equal(r.errores.length, 2)
  assert.match(r.errores[1], /bla/)
  assert.deepEqual(parsearEntreno('', 'run').errores, ['Escribe el entrenamiento'])
})
