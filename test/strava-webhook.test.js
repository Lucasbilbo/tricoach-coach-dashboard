import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { responderValidacion, interpretarEvento } = require('../netlify/functions/lib/strava-webhook.js')
const { crearStore, frescoSegunEntorno, FRESCO_MS, FRESCO_WEBHOOK_MS, MARGEN_MS } = require('../netlify/functions/lib/actividades-store.js')

test('validación: solo con el verify_token bueno devuelve el challenge', () => {
  const q = { 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': 'abc' }
  assert.deepEqual(responderValidacion(q, 'tok'), { statusCode: 200, body: JSON.stringify({ 'hub.challenge': 'abc' }) })
  assert.equal(responderValidacion(q, 'otro').statusCode, 403)
  assert.equal(responderValidacion(q, undefined).statusCode, 403) // sin configurar: inerte
  assert.equal(responderValidacion({ ...q, 'hub.challenge': '' }, 'tok').statusCode, 400)
})

test('evento de actividad → marca más vieja que la frescura con webhook', () => {
  const r = interpretarEvento({ object_type: 'activity', aspect_type: 'create', owner_id: 123, event_time: 1_800_000_000 })
  assert.equal(r.ownerId, 123)
  assert.ok(1_800_000_000_000 - Date.parse(r.marcaIso) > FRESCO_WEBHOOK_MS)
  assert.equal(interpretarEvento({ object_type: 'athlete', aspect_type: 'update', owner_id: 1 }), null)
  assert.equal(interpretarEvento({ object_type: 'activity', aspect_type: 'raro', owner_id: 1 }), null)
  assert.equal(interpretarEvento({ object_type: 'activity', aspect_type: 'delete', owner_id: '1;drop' }), null)
  const sub = { subscriptionId: '99' }
  assert.equal(interpretarEvento({ object_type: 'activity', aspect_type: 'update', owner_id: 1, subscription_id: 98 }, sub), null)
  assert.ok(interpretarEvento({ object_type: 'activity', aspect_type: 'update', owner_id: 1, subscription_id: 99 }, sub))
})

test('frescura: 5 min por defecto, 6 h solo con STRAVA_WEBHOOK_ACTIVO=1', () => {
  assert.equal(frescoSegunEntorno({}), FRESCO_MS)
  assert.equal(frescoSegunEntorno({ STRAVA_WEBHOOK_ACTIVO: '1' }), FRESCO_WEBHOOK_MS)
})

test('con webhook: sync de 2 h → solo BD; tras la marca del evento → Strava incremental', async () => {
  const AHORA = Date.UTC(2026, 10, 26, 12)
  let sync = { cubierto_desde: new Date(AHORA - 200 * 86400000).toISOString(), sincronizado_at: new Date(AHORA - 2 * 3600000).toISOString() }
  const llamadas = []
  const db = {
    leerSync: async () => ({ ok: true, fila: sync }),
    leerActividades: async () => ({ ok: true, datos: [] }),
    guardar: async () => true,
    borrarAusentes: async () => true,
    guardarSync: async (_id, campos) => { sync = { ...sync, ...campos }; return true },
  }
  const store = crearStore({
    db,
    now: () => AHORA,
    frescoMs: FRESCO_WEBHOOK_MS,
    listar: async (_t, desde) => { llamadas.push(desde); return { ok: true, actividades: [], completo: true } },
  })
  const pedir = () => store.obtener({ athleteId: 'a', afterUnix: Math.floor((AHORA - 100 * 86400000) / 1000), obtenerToken: async () => 'tk' })
  assert.equal((await pedir()).origen, 'bd')
  assert.equal(llamadas.length, 0)

  const { marcaIso } = interpretarEvento({ object_type: 'activity', aspect_type: 'create', owner_id: 5, event_time: AHORA / 1000 })
  sync = { ...sync, sincronizado_at: marcaIso }
  await pedir()
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0], Math.floor((Date.parse(marcaIso) - MARGEN_MS) / 1000))
})
