import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NIVEL, cumplimiento, metrosPrescritos, nivelDe } from '../src/lib/cumplimiento.js'

test('bandas de TrainingPeaks, bordes incluidos', () => {
  assert.equal(nivelDe(80), NIVEL.ok)
  assert.equal(nivelDe(120), NIVEL.ok)
  assert.equal(nivelDe(79), NIVEL.parcial)
  assert.equal(nivelDe(50), NIVEL.parcial)
  assert.equal(nivelDe(121), NIVEL.parcial)
  assert.equal(nivelDe(150), NIVEL.parcial)
  assert.equal(nivelDe(49), NIVEL.lejos)
  assert.equal(nivelDe(151), NIVEL.lejos)
})

test('compara por duración cuando la sesión la tiene', () => {
  const c = cumplimiento({ duracion_min: 75 }, { duracion_min: 62.4, distancia_km: 11 })
  assert.equal(c.base, 'duracion')
  assert.equal(c.pct, 83)
  assert.equal(c.nivel, NIVEL.ok)
  assert.equal(c.texto, '62 de 75 min')
})

test('natación por distancia: series con repeticiones y técnica ya sumada', () => {
  const ws = { bloques: [
    { tipo: 'step', cantidad: 400, unidad: 'mtr' },
    { tipo: 'repeat', repeticiones: 8, pasos: [{ cantidad: 100, unidad: 'mtr' }, { cantidad: 25, unidad: 'mtr' }] },
    { tipo: 'step', cantidad: 200, unidad: 'mtr' },
  ] }
  assert.equal(metrosPrescritos(ws), 1600)
  const c = cumplimiento({ duracion_min: null, workout_steps: ws }, { duracion_min: 40, distancia_km: 1.2 })
  assert.equal(c.base, 'distancia')
  assert.equal(c.pct, 75)
  assert.equal(c.nivel, NIVEL.parcial)
  assert.equal(c.texto, '1,2 km de 1,6 km')
})

test('los descansos de natación no rompen la comparación por metros', () => {
  const ws = { bloques: [
    { tipo: 'repeat', repeticiones: 8, pasos: [{ cantidad: 100, unidad: 'mtr' }, { cantidad: 20, unidad: 's' }] },
    { tipo: 'step', nombre: 'Descanso', cantidad: 1, unidad: 'min' },
    { tipo: 'step', cantidad: 400, unidad: 'mtr' },
  ] }
  assert.equal(metrosPrescritos(ws), 1200)
  // Un paso por segundos CON objetivo es trabajo, no descanso
  assert.equal(metrosPrescritos({ bloques: [{ cantidad: 400, unidad: 'mtr' }, { cantidad: 30, unidad: 's', objetivo_tipo: 'zona' }] }), null)
})

test('natación nunca por duración (Strava no cuenta los descansos)', () => {
  assert.equal(cumplimiento({ disciplina: 'swim', duracion_min: 70 }, { duracion_min: 39, distancia_km: 2.1 }), null)
  const ws = { bloques: [{ cantidad: 2000, unidad: 'mtr' }] }
  assert.equal(cumplimiento({ disciplina: 'swim', duracion_min: 70, workout_steps: ws }, { duracion_min: 39, distancia_km: 2.1 }).base, 'distancia')
})

test('sin base comparable no se inventa nada', () => {
  const mezcla = { bloques: [{ cantidad: 10, unidad: 'min' }, { cantidad: 400, unidad: 'mtr' }] }
  assert.equal(metrosPrescritos(mezcla), null)
  assert.equal(cumplimiento({ duracion_min: null, workout_steps: mezcla }, { duracion_min: 30, distancia_km: 1 }), null)
  assert.equal(cumplimiento({ duracion_min: null, workout_steps: { adjunto: { texto: 'Hyrox' } } }, { duracion_min: 50 }), null)
  assert.equal(cumplimiento({ duracion_min: 60 }, null), null)
})
