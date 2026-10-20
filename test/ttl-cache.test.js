import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { crearTtlCache } = createRequire(import.meta.url)('../netlify/functions/lib/ttl-cache.js')

test('devuelve lo guardado dentro del TTL y lo olvida al expirar', () => {
  let t = 0
  const c = crearTtlCache({ ttlMs: 100, max: 10, now: () => t })
  c.set('a', [1])
  t = 99
  assert.deepEqual(c.get('a'), [1])
  t = 100
  assert.equal(c.get('a'), undefined)
  assert.equal(c.size(), 0)
})

test('respeta el tope de entradas expulsando las más antiguas', () => {
  const c = crearTtlCache({ ttlMs: 1e9, max: 2 })
  c.set('a', 1)
  c.set('b', 2)
  c.set('c', 3)
  assert.equal(c.get('a'), undefined)
  assert.equal(c.get('b'), 2)
  assert.equal(c.get('c'), 3)
})
