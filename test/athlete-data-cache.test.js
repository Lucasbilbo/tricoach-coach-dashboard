import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAthleteDataCache } from '../src/lib/athleteDataCache.js'

function montar({ ttl = 1000 } = {}) {
  let t = 0
  const llamadas = []
  let respuesta = () => ({ ok: true, status: 200, json: { n: llamadas.length } })
  const cache = createAthleteDataCache({
    request: async (athleteId, weeks, records) => {
      llamadas.push([athleteId, weeks, records])
      await Promise.resolve()
      return respuesta()
    },
    now: () => t,
    ttl,
  })
  return { cache, llamadas, avanzar: (ms) => { t += ms }, responder: (fn) => { respuesta = fn } }
}

test('peticiones idénticas simultáneas comparten una sola llamada', async () => {
  const { cache, llamadas } = montar()
  const [a, b] = await Promise.all([cache.get('x', 26, { records: false }), cache.get('x', 26, { records: false })])
  assert.equal(llamadas.length, 1)
  assert.equal(a, b)
})

test('dentro del TTL se reutiliza; pasado el TTL se vuelve a pedir', async () => {
  const { cache, llamadas, avanzar } = montar({ ttl: 1000 })
  await cache.get('x', 8)
  avanzar(999)
  await cache.get('x', 8)
  assert.equal(llamadas.length, 1)
  avanzar(2)
  await cache.get('x', 8)
  assert.equal(llamadas.length, 2)
})

test('la clave distingue atleta, semanas y records', async () => {
  const { cache, llamadas } = montar()
  await cache.get('x', 8)
  await cache.get('x', 12)
  await cache.get('y', 8)
  await cache.get('x', 8, { records: false })
  assert.equal(llamadas.length, 4)
  assert.deepEqual(llamadas[3], ['x', 8, false])
})

test('un error no se cachea', async () => {
  const { cache, llamadas, responder } = montar()
  responder(() => ({ ok: false, status: 502, json: { error: 'strava' } }))
  const r1 = await cache.get('x', 8)
  assert.equal(r1.ok, false)
  responder(() => ({ ok: true, status: 200, json: { bien: true } }))
  const r2 = await cache.get('x', 8)
  assert.equal(r2.ok, true)
  assert.equal(llamadas.length, 2)
})

test('un fallo de red se propaga y no deja la petición colgada', async () => {
  const { cache, llamadas, responder } = montar()
  responder(() => { throw new Error('red') })
  await assert.rejects(() => cache.get('x', 8), /red/)
  responder(() => ({ ok: true, status: 200, json: {} }))
  await cache.get('x', 8)
  assert.equal(llamadas.length, 2)
})

test('invalidate borra todo lo de ese atleta y solo de ese', async () => {
  const { cache, llamadas } = montar()
  await cache.get('x', 8)
  await cache.get('x', 26, { records: false })
  await cache.get('y', 8)
  cache.invalidate('x')
  await cache.get('x', 8)
  await cache.get('y', 8)
  assert.equal(llamadas.length, 4) // y sigue cacheado
})

test('invalidar con una petición en vuelo no guarda su resultado viejo', async () => {
  const { cache, llamadas } = montar()
  const vuelo = cache.get('x', 8)
  cache.invalidate('x')
  await vuelo
  await cache.get('x', 8)
  assert.equal(llamadas.length, 2)
})

test('force salta la caché', async () => {
  const { cache, llamadas } = montar()
  await cache.get('x', 8)
  await cache.get('x', 8, { force: true })
  assert.equal(llamadas.length, 2)
})
