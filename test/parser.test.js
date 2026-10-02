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
    '- Calentamiento 15m Z1 HR\n\nSerie 8x\n- 1m Z5 HR\n- 1m Z1 HR\n\n- Vuelta a la calma 10m Z1 HR')
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

test('natación: material, cal/vc explícitos y zona de ritmo', () => {
  const { bloques } = parsearEntreno('cal 500m palas aletas + 4x(100m 1:45 / 20" descanso) + 300m Z1 pull + vc 200m', 'swim')
  assert.deepEqual(bloques.map((b) => b.tipo), ['warmup', 'repeat', 'step', 'cooldown'])
  assert.deepEqual(bloques[0].material, ['palas', 'aletas'])
  assert.deepEqual([bloques[2].objetivo_tipo, bloques[2].objetivo_valor], ['zona', 'Z1'])
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

test('series sin paréntesis: 8x100m 1:45 es una serie, no un paso llamado "8x"', () => {
  const [b] = parsearEntreno('8x100m 1:45', 'swim').bloques
  assert.equal(b.tipo, 'repeat')
  assert.equal(b.repeticiones, 8)
  assert.deepEqual([b.pasos[0].cantidad, b.pasos[0].unidad, b.pasos[0].objetivo_valor], [100, 'mtr', '1:45'])
})

test('serie sin paréntesis con descanso (rec / r / descanso)', () => {
  for (const t of ['8x100m 1:45 rec 20"', '8x100m 1:45 r20"', '8x100m 1:45 descanso 20s']) {
    const [b] = parsearEntreno(t, 'swim').bloques
    assert.equal(b.pasos.length, 2, t)
    assert.deepEqual([b.pasos[1].cantidad, b.pasos[1].unidad, b.pasos[1].nombre], [20, 's', 'Descanso'], t)
  }
  const run = parsearEntreno("15' Z1 + 6x3' Z4 r2' + 10' Z1", 'run').bloques
  assert.deepEqual(run.map((b) => b.tipo), ['warmup', 'repeat', 'cooldown'])
  assert.equal(run[1].pasos[1].cantidad, 2)
})

test('forma inversa: 100m x 8 a 1:45', () => {
  const [b] = parsearEntreno('100m x 8 a 1:45', 'swim').bloques
  assert.equal(b.repeticiones, 8)
  assert.equal(b.pasos[0].objetivo_valor, '1:45')
  assert.equal(b.pasos[0].nombre, null)
})

test('natación: número suelto son metros; en otras disciplinas pide unidad', () => {
  const { bloques, errores } = parsearEntreno('400 cal + 4x100 1:45 + 200 vc', 'swim')
  assert.equal(errores.length, 0)
  assert.deepEqual(bloques.map((b) => b.tipo), ['warmup', 'repeat', 'cooldown'])
  assert.equal(bloques[0].cantidad, 400)
  assert.match(parsearEntreno('45 Z2', 'run').errores[0], /Falta la duración/)
})

test('comas y ; separan bloques; "con palas" no deja "con" en el nombre', () => {
  const r = parsearEntreno('calentamiento 15min, 5x1km 4:30, vc 10min', 'run')
  assert.deepEqual(r.bloques.map((b) => b.tipo), ['warmup', 'repeat', 'cooldown'])
  const s = parsearEntreno('8x100m 1:50 con palas', 'swim').bloques[0].pasos[0]
  assert.equal(s.nombre, null)
  assert.deepEqual(s.material, ['palas'])
})

test('natación: zona de ritmo y ritmo llegan a Intervals', () => {
  assert.match(texto('swim', '10x100m Z3'), /- 100mtr Z3 Pace/)
  assert.match(texto('swim', '8x100m 1:45-1:50 rec 20"'), /- 100mtr 1:45-1:50\/100m Pace/)
})
