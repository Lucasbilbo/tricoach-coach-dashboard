import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { EventEmitter } from 'node:events'
import process from 'node:process'
import { Buffer } from 'node:buffer'

const require = createRequire(import.meta.url)
const https = require('https')
const { verifyAuth, uidSinVerificar } = require('../netlify/functions/lib/auth.js')

const REAL = '11111111-1111-4111-8111-111111111111'
const OTRO = '22222222-2222-4222-8222-222222222222'

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwtCon = (sub) => `${b64({ alg: 'HS256' })}.${b64({ sub })}.firma`
const evento = (jwt) => ({ headers: { authorization: `Bearer ${jwt}` } })

// Simula Supabase: /auth/v1/user devuelve SIEMPRE el usuario REAL (la firma
// manda, no lo que diga el payload); coaches contiene solo `coaches`.
function simular({ coaches }) {
  const rutas = []
  const original = https.request
  https.request = (opts, cb) => {
    rutas.push(opts.path)
    const req = new EventEmitter()
    req.end = () => {
      let cuerpo
      if (opts.path === '/auth/v1/user') cuerpo = { id: REAL }
      else {
        const id = /id=eq\.([^&]+)/.exec(opts.path)[1]
        cuerpo = coaches.includes(id) ? [{ id }] : []
      }
      const res = new EventEmitter()
      res.statusCode = 200
      cb(res)
      res.emit('data', JSON.stringify(cuerpo))
      res.emit('end')
    }
    req.write = () => {}
    return req
  }
  return { rutas, restaurar: () => { https.request = original } }
}

function conEnv(fn) {
  return async () => {
    const antes = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SERVICE_ROLE_KEY }
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    try { await fn() } finally {
      process.env.SUPABASE_URL = antes.u
      process.env.SUPABASE_SERVICE_ROLE_KEY = antes.k
    }
  }
}

test('uidSinVerificar lee el sub y rechaza lo que no es un UUID', () => {
  assert.equal(uidSinVerificar(evento(jwtCon(REAL))), REAL)
  assert.equal(uidSinVerificar(evento(jwtCon('admin'))), null)
  assert.equal(uidSinVerificar(evento('basura')), null)
  assert.equal(uidSinVerificar({ headers: {} }), null)
})

test('sub correcto: la whitelist sale de la consulta adelantada (una sola)', conEnv(async () => {
  const s = simular({ coaches: [REAL] })
  try {
    assert.deepEqual(await verifyAuth(evento(jwtCon(REAL))), { uid: REAL, isCoach: true })
    assert.equal(s.rutas.filter((r) => r.startsWith('/rest/v1/coaches')).length, 1)
  } finally { s.restaurar() }
}))

test('sub falsificado: se ignora lo adelantado y manda el uid verificado', conEnv(async () => {
  // El payload dice OTRO (que es coach), pero el usuario verificado es REAL (no coach)
  const s = simular({ coaches: [OTRO] })
  try {
    assert.deepEqual(await verifyAuth(evento(jwtCon(OTRO))), { uid: REAL, isCoach: false })
    assert.ok(s.rutas.includes(`/rest/v1/coaches?id=eq.${REAL}&select=id`))
  } finally { s.restaurar() }
}))
