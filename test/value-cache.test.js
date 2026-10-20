import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearCacheValores } from '../src/lib/valueCache.js'

function montar(ttl = 1000) {
  let t = 0
  const cache = crearCacheValores({ ttl, now: () => t })
  return { cache, avanzar: (ms) => { t += ms } }
}

test('deduplica en vuelo y reutiliza dentro del TTL', async () => {
  const { cache, avanzar } = montar()
  let n = 0
  const cargar = async () => ++n
  const [a, b] = await Promise.all([cache.get('k', cargar), cache.get('k', cargar)])
  assert.equal(a, 1)
  assert.equal(b, 1)
  avanzar(999)
  assert.equal(await cache.get('k', cargar), 1)
  avanzar(2)
  assert.equal(await cache.get('k', cargar), 2)
})

test('un fallo no se cachea', async () => {
  const { cache } = montar()
  await assert.rejects(() => cache.get('k', async () => { throw new Error('x') }), /x/)
  assert.equal(await cache.get('k', async () => 'bien'), 'bien')
})

test('invalidate y force vuelven a cargar; invalidar en vuelo descarta el resultado', async () => {
  const { cache } = montar()
  let n = 0
  const cargar = async () => ++n
  await cache.get('k', cargar)
  assert.equal(await cache.get('k', cargar, { force: true }), 2)
  cache.invalidate('k')
  assert.equal(await cache.get('k', cargar), 3)
  const vuelo = cache.get('j', cargar)
  cache.invalidate('j')
  await vuelo
  assert.equal(await cache.get('j', cargar), 5)
})
