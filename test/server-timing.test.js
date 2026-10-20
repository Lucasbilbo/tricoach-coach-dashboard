import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { crearMedidor } = createRequire(import.meta.url)('../netlify/functions/lib/server-timing.js')

test('cabecera con duración total y contadores', () => {
  let t = 1000
  const m = crearMedidor(() => t)
  m.contar('strava-lista')
  m.contar('strava-splits', 3)
  m.contar('strava-lista')
  t = 1250
  assert.equal(m.cabecera(), 'total;dur=250, strava-lista;desc="2", strava-splits;desc="3"')
})

test('sin contadores solo informa la duración', () => {
  let t = 5
  const m = crearMedidor(() => t)
  t = 5
  assert.equal(m.cabecera(), 'total;dur=0')
})
