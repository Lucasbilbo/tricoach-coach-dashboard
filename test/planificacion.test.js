import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esPlanificable, semanasFuturas, SEMANAS_FUTURAS_MINIMAS } from '../src/lib/planificacion.js'

const ACTUAL = '2026-10-19' // lunes

test('sin sesiones futuras se muestran las semanas mínimas, vacías', () => {
  assert.equal(SEMANAS_FUTURAS_MINIMAS, 2)
  assert.deepEqual(semanasFuturas(ACTUAL, []), ['2026-10-26', '2026-11-02'])
})

test('"Planificar otra semana" añade semanas vacías', () => {
  assert.deepEqual(semanasFuturas(ACTUAL, [], 2), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'])
})

test('llega hasta la última semana con sesiones y rellena los huecos', () => {
  assert.deepEqual(semanasFuturas(ACTUAL, ['2026-11-16', '2026-10-12']), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'])
})

test('ignora semanas pasadas y la actual, y entradas no válidas', () => {
  assert.deepEqual(semanasFuturas(ACTUAL, ['2026-10-19', '2026-09-01']), ['2026-10-26', '2026-11-02'])
  assert.deepEqual(semanasFuturas('', []), [])
})

test('cruza el cambio de hora y de año sin saltarse semanas', () => {
  assert.deepEqual(semanasFuturas('2026-12-21', [], 1), ['2026-12-28', '2027-01-04', '2027-01-11'])
})

test('solo se planifica hoy o en el futuro', () => {
  assert.equal(esPlanificable('2026-10-20', '2026-10-20'), true)
  assert.equal(esPlanificable('2026-10-21', '2026-10-20'), true)
  assert.equal(esPlanificable('2026-10-19', '2026-10-20'), false)
  assert.equal(esPlanificable(undefined, '2026-10-20'), false)
})
