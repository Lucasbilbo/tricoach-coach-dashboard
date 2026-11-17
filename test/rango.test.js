import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { leerRango, afterUnixDesde } = require('../netlify/functions/lib/rango.js')

const HOY = '2026-11-17'

test('sin desde ni hasta: sin rango (se usa weeks)', () => {
  assert.deepEqual(leerRango(undefined, undefined, HOY, 52), { ok: true, rango: null })
})

test('rango válido', () => {
  assert.deepEqual(leerRango('2026-10-12', '2026-10-18', HOY, 52), { ok: true, rango: { desde: '2026-10-12', hasta: '2026-10-18' } })
  assert.deepEqual(leerRango(HOY, HOY, HOY, 52).rango, { desde: HOY, hasta: HOY })
})

test('rechaza lo incompleto, mal formado, invertido, futuro o más viejo que el historial', () => {
  for (const [d, h] of [
    ['2026-10-12', undefined],
    [undefined, '2026-10-18'],
    ['12/10/2026', '2026-10-18'],
    ['2026-02-30', '2026-03-01'],
    ['2026-10-18', '2026-10-12'],
    ['2026-11-01', '2026-11-18'],
    ['2025-01-01', '2025-01-10'],
    [20261012, 20261018],
  ]) {
    assert.equal(leerRango(d, h, HOY, 52).ok, false, `${d} → ${h}`)
  }
})

test('el límite de historial es exactamente semanasMax·7 días', () => {
  assert.equal(leerRango('2025-11-18', HOY, HOY, 52).ok, true) // hoy − 364 días
  assert.equal(leerRango('2025-11-17', HOY, HOY, 52).ok, false)
})

test('afterUnixDesde: medianoche UTC del día menos un día de margen', () => {
  assert.equal(afterUnixDesde('2026-10-12'), Date.UTC(2026, 9, 11) / 1000)
})
