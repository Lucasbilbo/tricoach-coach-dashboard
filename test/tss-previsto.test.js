import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { INTENSIDAD_ZONA, TSS_POR_HORA_SIN_FC, tssPrevisto } from '../src/lib/tssPrevisto.js'

const require = createRequire(import.meta.url)
const metrics = require('../netlify/functions/lib/metrics.js')

test('TSS/hora sin FC igual que el del backend (fuente única)', () => {
  assert.deepEqual(TSS_POR_HORA_SIN_FC, metrics.TSS_POR_HORA_SIN_FC)
})

test('cada punto medio de zona cae en su zona de zonaFc', () => {
  for (const [z, pct] of Object.entries(INTENSIDAD_ZONA)) assert.equal(metrics.zonaFc(pct), z)
})

test('misma escala que el hrTSS real: 60 min en Z2 = hrTSS de 60 min al 65 %', () => {
  const plan = tssPrevisto({ disciplina: 'run', workout_steps: { bloques: [{ tipo: 'step', cantidad: 60, unidad: 'min', objetivo_tipo: 'zona', objetivo_valor: 'Z2' }] } })
  const real = metrics.tssEstimado(3600, 0.65 * 185, 185)
  assert.equal(plan, Math.round(real))
})

test('series con repeticiones y calentamiento sin objetivo (Z1 en carrera)', () => {
  const ws = { bloques: [
    { tipo: 'warmup', cantidad: 15, unidad: 'min' },
    { tipo: 'repeat', repeticiones: 4, pasos: [
      { cantidad: 30, unidad: 's', objetivo_tipo: 'zona', objetivo_valor: 'Z5' },
      { nombre: 'Descanso', cantidad: 90, unidad: 's', objetivo_tipo: 'zona', objetivo_valor: 'Z1' },
    ] },
  ] }
  // 15' Z1 = 7,56 · 4×30" Z5 = 2,88 · 4×90" Z1 = 3,03 → 13
  assert.equal(tssPrevisto({ disciplina: 'run', workout_steps: ws }), 13)
})

test('pasos por distancia usan el ritmo del objetivo', () => {
  const conRitmo = { bloques: [{ cantidad: 10, unidad: 'km', objetivo_tipo: 'ritmo', objetivo_valor: '4:50-5:10' }] }
  // 10 km a 5:00 = 50 min en Z3 → 0,8333 h × 56,25 = 47
  assert.equal(tssPrevisto({ disciplina: 'run', workout_steps: conRitmo }), 47)
  // Natación a 2:00/100m: 2000 m = 40 min; con ritmo marcado cuenta como Z3
  const nado = { bloques: [{ cantidad: 2000, unidad: 'mtr', objetivo_tipo: 'ritmo', objetivo_valor: '2:00' }] }
  assert.equal(tssPrevisto({ disciplina: 'swim', workout_steps: nado }), Math.round((40 / 60) * 56.25))
})

test('natación sin objetivo y fuerza tal cual van por TSS/hora de la disciplina', () => {
  const nado = { bloques: [{ cantidad: 60, unidad: 'min' }] }
  assert.equal(tssPrevisto({ disciplina: 'swim', workout_steps: nado }), 55)
  assert.equal(tssPrevisto({ disciplina: 'strength', duracion_min: 45, workout_steps: { adjunto: { texto: 'Hyrox' } } }), 30)
  assert.equal(tssPrevisto({ disciplina: 'other', duracion_min: 60 }), null)
  assert.equal(tssPrevisto({ disciplina: 'run' }), null)
})
