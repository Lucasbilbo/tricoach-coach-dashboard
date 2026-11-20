import { test } from 'node:test'
import assert from 'node:assert/strict'
import mod from '../netlify/functions/sync-ftp.js'

const { _sincronizarFtp: sincronizar } = mod
const cuerpo = (r) => JSON.parse(r.body)
const deps = (o = {}) => ({
  leerFila: async () => ({ ftp_w: 230 }),
  leerPerfil: async () => ({ intervals_api_key: 'k', intervals_athlete_id: 'i1' }),
  putFtp: async () => ({ status: 200 }),
  ...o,
})

test('sube el FTP de la BD (no del body) a Intervals', async () => {
  let enviado
  const r = await sincronizar({ athleteId: 'a', deps: deps({ putFtp: async (id, key, ftp) => { enviado = { id, key, ftp }; return { status: 200 } } }) })
  assert.equal(r.statusCode, 200)
  assert.deepEqual(cuerpo(r), { ok: true, ftp: 230 })
  assert.deepEqual(enviado, { id: 'i1', key: 'k', ftp: 230 })
})

test('sin FTP o sin Intervals no llama a Intervals', async () => {
  const nunca = async () => { throw new Error('no debía llamarse') }
  assert.equal(cuerpo(await sincronizar({ athleteId: 'a', deps: deps({ leerFila: async () => null, putFtp: nunca }) })).code, 'SIN_FTP')
  assert.equal(cuerpo(await sincronizar({ athleteId: 'a', deps: deps({ leerPerfil: async () => ({}), putFtp: nunca }) })).code, 'NO_INTERVALS')
})

test('si Intervals rechaza → 502 INTERVALS_ERROR', async () => {
  const r = await sincronizar({ athleteId: 'a', deps: deps({ putFtp: async () => ({ status: 403 }) }) })
  assert.equal(r.statusCode, 502)
  assert.equal(cuerpo(r).code, 'INTERVALS_ERROR')
})
