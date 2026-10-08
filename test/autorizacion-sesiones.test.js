// Autorización de acciones de coach sobre una sesión (enviar/reenviar/borrar
// en Intervals → Garmin). Ser session.coach_id NO basta: hace falta estar en
// la whitelist de coaches y tener relación real en coach_athletes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'
import { EventEmitter } from 'node:events'

const require = createRequire(import.meta.url)
process.env.SUPABASE_URL = 'https://x.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'

const COACH = '538f0be3-6ca4-4b21-b635-67567829ff22'
const ATLETA = 'fcd0f6cb-771e-482e-b541-1ff093ab871b'
const VICTIMA = '22222222-2222-4222-8222-222222222222'
const INTRUSO = '33333333-3333-4333-8333-333333333333'

// https.request simulado: coach_athletes solo tiene la relación COACH→ATLETA
const https = require('node:https')
const peticiones = []
https.request = (opts, cb) => {
  peticiones.push(opts.path)
  const req = new EventEmitter()
  req.write = () => {}
  req.end = () => {
    const res = new EventEmitter()
    res.statusCode = 200
    cb(res)
    const rel = opts.path.includes(`coach_id=eq.${COACH}`) && opts.path.includes(`athlete_id=eq.${ATLETA}`)
    res.emit('data', JSON.stringify(opts.path.startsWith('/rest/v1/coach_athletes') ? (rel ? [{ id: 1 }] : []) : []))
    res.emit('end')
  }
  req.on = req.addListener
  req.setTimeout = () => {}
  req.destroy = () => {}
  return req
}
const { canCoachSession } = require('../netlify/functions/lib/auth.js')

test('coach con relación real con el atleta: sí', async () => {
  assert.equal(await canCoachSession({ uid: COACH, isCoach: true }, { coach_id: COACH, athlete_id: ATLETA }), true)
})

test('usuario que se pone como coach_id de una sesión de otro atleta: no', async () => {
  // No está en coaches (cualquier cuenta autenticada)
  assert.equal(await canCoachSession({ uid: INTRUSO, isCoach: false }, { coach_id: INTRUSO, athlete_id: VICTIMA }), false)
  // Es coach, pero ese atleta no es suyo
  assert.equal(await canCoachSession({ uid: COACH, isCoach: true }, { coach_id: COACH, athlete_id: VICTIMA }), false)
})

test('no es el dueño de la sesión: no, sin consultar la BD', async () => {
  const antes = peticiones.length
  assert.equal(await canCoachSession({ uid: INTRUSO, isCoach: true }, { coach_id: COACH, athlete_id: ATLETA }), false)
  assert.equal(peticiones.length, antes)
})

test('coach y atleta son la misma persona (te entrenas tú): sí', async () => {
  assert.equal(await canCoachSession({ uid: ATLETA, isCoach: false }, { coach_id: ATLETA, athlete_id: ATLETA }), true)
})

test('delete-session: el intruso no llega a borrar nada en Intervals', async () => {
  const llamadas = []
  const stub = (rel, exports) => {
    const p = require.resolve(`../netlify/functions/lib/${rel}`)
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }
  const real = require('../netlify/functions/lib/auth.js')
  stub('auth', { ...real, verifyAuth: async () => ({ uid: INTRUSO, isCoach: false }) })
  stub('http', {
    withTimeout: (p) => p,
    httpsRequest: async ({ path, method }) => {
      llamadas.push(`${method} ${path}`)
      if (path.startsWith('/rest/v1/coach_sessions')) {
        return { status: 200, json: [{ id: 's', coach_id: INTRUSO, athlete_id: VICTIMA, intervals_event_id: 999 }] }
      }
      return { status: 200, json: [{ intervals_api_key: 'k', intervals_athlete_id: 'i1' }] }
    },
  })
  stub('intervals-api', { intervalsDelete: async () => { llamadas.push('INTERVALS DELETE'); return { status: 200 } }, eventoBorrado: () => true })
  const fn = require.resolve('../netlify/functions/delete-session.js')
  delete require.cache[fn]
  const res = await require(fn).handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ sessionId: '44444444-4444-4444-8444-444444444444' }) })
  assert.equal(res.statusCode, 403)
  assert.ok(!llamadas.includes('INTERVALS DELETE'))
  assert.ok(!llamadas.some((l) => l.startsWith('DELETE')))
  delete require.cache[require.resolve('../netlify/functions/lib/auth.js')]
})
