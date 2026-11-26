import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAthleteDataCache } from '../src/lib/athleteDataCache.js'

function montar({ ttl = 1000 } = {}) {
  let t = 0
  const llamadas = []
  const cargas = []
  let respuesta = () => ({ ok: true, status: 200, json: { n: llamadas.length } })
  const cache = createAthleteDataCache({
    request: async (athleteId, weeks, records, rango, carga) => {
      llamadas.push([athleteId, weeks, records])
      cargas.push(carga)
      await Promise.resolve()
      return respuesta()
    },
    now: () => t,
    ttl,
  })
  return { cache, llamadas, cargas, avanzar: (ms) => { t += ms }, responder: (fn) => { respuesta = fn } }
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

test('un rango no se mezcla con las últimas N semanas ni con otro rango, y se pasa a request', async () => {
  const pedidos = []
  const cache = createAthleteDataCache({
    request: async (athleteId, weeks, records, rango) => {
      pedidos.push([athleteId, weeks, records, rango])
      return { ok: true, status: 200, json: {} }
    },
  })
  const r1 = { desde: '2026-10-12', hasta: '2026-10-18' }
  const r2 = { desde: '2026-10-19', hasta: '2026-10-25' }
  await cache.get('x', 8)
  await cache.get('x', 8, { rango: r1 })
  await cache.get('x', 8, { rango: r1 }) // caché
  await cache.get('x', 8, { rango: r2 })
  assert.equal(pedidos.length, 3)
  assert.deepEqual(pedidos[1][3], r1)
  assert.equal(pedidos[0][3], null)
  cache.invalidate('x') // invalida también los rangos del atleta
  await cache.get('x', 8, { rango: r1 })
  assert.equal(pedidos.length, 4)
})

const CON_CARGA = { ok: true, status: 200, json: { atleta: { id: 'x' }, actividades: [1], semanas: ['p'], carga: { actividades: [9, 8], semanas: ['c'] } } }

test('carga: una petición trae también la serie larga y se siembra en la caché', async () => {
  const { cache, llamadas, cargas, responder } = montar()
  responder(() => CON_CARGA)
  const principal = await cache.get('x', 4, { carga: 26 })
  assert.deepEqual(principal.json.actividades, [1])
  assert.equal(cargas[0], 26) // se pide al backend con cargaSemanas
  const larga = await cache.get('x', 26, { records: false })
  assert.equal(llamadas.length, 1) // sin segunda petición
  assert.deepEqual(larga.json, { atleta: { id: 'x' }, actividades: [9, 8], semanas: ['c'] })
})

test('carga: quien pide la serie larga mientras vuela la principal comparte esa petición', async () => {
  const { cache, llamadas, responder } = montar()
  responder(() => CON_CARGA)
  const [p, l] = await Promise.all([cache.get('x', 4, { carga: 26 }), cache.get('x', 26, { records: false })])
  assert.equal(llamadas.length, 1)
  assert.deepEqual(p.json.actividades, [1])
  assert.deepEqual(l.json.actividades, [9, 8])
})

test('carga: si la respuesta no la trae, la serie larga se pide aparte como antes', async () => {
  const { cache, llamadas, cargas, responder } = montar()
  responder(() => ({ ok: true, status: 200, json: { actividades: [1], semanas: [] } }))
  const [, l] = await Promise.all([cache.get('x', 4, { carga: 26 }), cache.get('x', 26, { records: false })])
  assert.equal(llamadas.length, 2)
  assert.deepEqual(llamadas[1].slice(0, 3), ['x', 26, false])
  assert.equal(cargas[1], 0)
  assert.equal(l.ok, true)
})

test('carga: si la principal falla, la serie larga recibe el mismo fallo sin otra petición y no queda cacheado', async () => {
  const { cache, llamadas, responder } = montar()
  responder(() => ({ ok: false, status: 429, json: { code: 'RATE_LIMITED' } }))
  const [, l] = await Promise.all([cache.get('x', 4, { carga: 26 }), cache.get('x', 26, { records: false })])
  assert.equal(llamadas.length, 1)
  assert.equal(l.status, 429)
  responder(() => ({ ok: true, status: 200, json: { n: 'ya bien' } }))
  const otra = await cache.get('x', 26, { records: false })
  assert.equal(otra.json.n, 'ya bien')
})

test('carga: no se siembra si el periodo ya cubre la serie, con rango, ni pisa lo ya cacheado', async () => {
  const { cache, cargas, responder } = montar()
  responder(() => CON_CARGA)
  await cache.get('x', 26, { carga: 26 })
  assert.equal(cargas[0], 0)
  await cache.get('x', 0, { rango: { desde: '2026-11-01', hasta: '2026-11-07' }, carga: 26 })
  assert.equal(cargas[1], 0)
  // Serie larga ya pedida: la petición con carga no la sustituye
  const { cache: c2, llamadas: l2, responder: r2 } = montar()
  r2(() => ({ ok: true, status: 200, json: { origen: 'aparte' } }))
  await c2.get('y', 26, { records: false })
  r2(() => CON_CARGA)
  await c2.get('y', 4, { carga: 26 })
  const larga = await c2.get('y', 26, { records: false })
  assert.equal(l2.length, 2)
  assert.equal(larga.json.origen, 'aparte')
})

test('carga: invalidar al atleta borra también la serie sembrada', async () => {
  const { cache, llamadas, responder } = montar()
  responder(() => CON_CARGA)
  await cache.get('x', 4, { carga: 26 })
  cache.invalidate('x')
  await cache.get('x', 26, { records: false })
  assert.equal(llamadas.length, 2)
})
