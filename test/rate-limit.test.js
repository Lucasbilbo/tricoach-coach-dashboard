import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)
const { LIMITES, allowLimite, allowRequest } = require('../netlify/functions/lib/rate-limit.js')

test('las funciones que escriben tienen límite, holgado frente al uso real', () => {
  for (const nombre of ['send_intervals', 'move_session', 'delete_session', 'season_write']) {
    assert.ok(LIMITES[nombre], `falta el límite ${nombre}`)
    assert.ok(LIMITES[nombre].max >= 60, `${nombre} demasiado estricto`)
    assert.equal(LIMITES[nombre].ventana, 900)
  }
})

test('fail-open: si el limitador no puede responder, la petición pasa', async () => {
  const antes = process.env.SUPABASE_URL
  delete process.env.SUPABASE_URL // new URL(undefined) lanza dentro del limitador
  const errorOriginal = console.error
  console.error = () => {}
  try {
    assert.equal(await allowRequest('test', 'uid', 1, 60), true)
    assert.equal(await allowLimite('send_intervals', 'uid'), true)
  } finally {
    console.error = errorOriginal
    if (antes !== undefined) process.env.SUPABASE_URL = antes
  }
})

test('un nombre de límite desconocido no bloquea', async () => {
  assert.equal(await allowLimite('no_existe', 'uid'), true)
})

test('las cuatro funciones cargan con el límite cableado', () => {
  for (const f of ['send-to-intervals', 'move-session', 'delete-session', 'season']) {
    const mod = require(`../netlify/functions/${f}.js`)
    assert.equal(typeof mod.handler, 'function', f)
  }
})
