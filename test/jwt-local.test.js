import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'

const require = createRequire(import.meta.url)
const { crearVerificador } = require('../netlify/functions/lib/jwt-local.js')

const URL_SB = 'https://x.supabase.co'
const ISS = `${URL_SB}/auth/v1`
const UID = '11111111-1111-4111-8111-111111111111'
const AHORA = 1_800_000_000_000
const now = () => AHORA
const seg = Math.floor(AHORA / 1000)

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const claims = (extra = {}) => ({
  sub: UID, iss: ISS, aud: 'authenticated', role: 'authenticated', exp: seg + 3600, ...extra,
})

function firmarEs256(cab, payload, privada) {
  const datos = `${b64(cab)}.${b64(payload)}`
  const firma = crypto.sign('sha256', Buffer.from(datos), { key: privada, dsaEncoding: 'ieee-p1363' })
  return `${datos}.${firma.toString('base64url')}`
}
function firmarRs256(cab, payload, privada) {
  const datos = `${b64(cab)}.${b64(payload)}`
  return `${datos}.${crypto.sign('RSA-SHA256', Buffer.from(datos), privada).toString('base64url')}`
}
function firmarHs256(payload, secreto) {
  const datos = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`
  return `${datos}.${crypto.createHmac('sha256', secreto).update(datos).digest('base64url')}`
}

const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = (pub, kid, alg) => ({ ...pub.export({ format: 'jwk' }), kid, alg, use: 'sig' })

function jwks(keys) {
  const llamadas = []
  return { llamadas, descargar: async (url) => { llamadas.push(url); return { keys } } }
}

test('ES256 válido: uid en local y el JWKS se pide una sola vez', async () => {
  const d = jwks([jwk(ec.publicKey, 'k1', 'ES256')])
  const v = crearVerificador({ supabaseUrl: URL_SB, descargar: d.descargar, now })
  const t = firmarEs256({ alg: 'ES256', kid: 'k1' }, claims(), ec.privateKey)
  assert.deepEqual(await v.verificar(t), { uid: UID })
  assert.deepEqual(await v.verificar(t), { uid: UID })
  assert.deepEqual(d.llamadas, [`${ISS}/.well-known/jwks.json`])
})

test('RS256 válido', async () => {
  const d = jwks([jwk(rsa.publicKey, 'r1', 'RS256')])
  const v = crearVerificador({ supabaseUrl: URL_SB, descargar: d.descargar, now })
  assert.deepEqual(await v.verificar(firmarRs256({ alg: 'RS256', kid: 'r1' }, claims(), rsa.privateKey)), { uid: UID })
})

test('firma de otra clave, payload retocado o claims malos → null', async () => {
  const d = jwks([jwk(ec.publicKey, 'k1', 'ES256')])
  const v = crearVerificador({ supabaseUrl: URL_SB, descargar: d.descargar, now })
  const otra = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
  assert.equal(await v.verificar(firmarEs256({ alg: 'ES256', kid: 'k1' }, claims(), otra.privateKey)), null)

  const bueno = firmarEs256({ alg: 'ES256', kid: 'k1' }, claims(), ec.privateKey).split('.')
  const falso = b64(claims({ sub: '22222222-2222-4222-8222-222222222222' }))
  assert.equal(await v.verificar(`${bueno[0]}.${falso}.${bueno[2]}`), null)

  for (const malo of [
    { exp: seg - 120 },
    { iss: 'https://otro.supabase.co/auth/v1' },
    { aud: 'otra' },
    { role: 'anon' },
    { role: 'service_role' },
    { sub: 'admin' },
    { nbf: seg + 600 },
  ]) {
    assert.equal(await v.verificar(firmarEs256({ alg: 'ES256', kid: 'k1' }, claims(malo), ec.privateKey)), null, JSON.stringify(malo))
  }
  assert.equal(await v.verificar('no.es.jwt'), null)
  assert.equal(await v.verificar('dos.partes'), null)
})

test('kid desconocido: vuelve a pedir el JWKS una vez y si no está, no decide', async () => {
  const d = jwks([jwk(ec.publicKey, 'k1', 'ES256')])
  const v = crearVerificador({ supabaseUrl: URL_SB, descargar: d.descargar, now })
  const t = firmarEs256({ alg: 'ES256', kid: 'kX' }, claims(), ec.privateKey)
  assert.equal(await v.verificar(t), undefined)
  assert.equal(d.llamadas.length, 2)
  assert.equal(await v.verificar(t), undefined)
  assert.equal(d.llamadas.length, 2) // no martillea el JWKS
})

test('JWKS caído → undefined (cae a GoTrue)', async () => {
  const v = crearVerificador({ supabaseUrl: URL_SB, descargar: async () => null, now })
  assert.equal(await v.verificar(firmarEs256({ alg: 'ES256', kid: 'k1' }, claims(), ec.privateKey)), undefined)
})

test('HS256: con secreto verifica; sin secreto no decide; alg none nunca vale', async () => {
  const sin = crearVerificador({ supabaseUrl: URL_SB, descargar: async () => ({ keys: [] }), now })
  const con = crearVerificador({ supabaseUrl: URL_SB, secreto: 's3cr3t', descargar: async () => ({ keys: [] }), now })
  const t = firmarHs256(claims(), 's3cr3t')
  assert.equal(await sin.verificar(t), undefined)
  assert.deepEqual(await con.verificar(t), { uid: UID })
  assert.equal(await con.verificar(firmarHs256(claims(), 'otro')), null)
  const none = `${b64({ alg: 'none' })}.${b64(claims())}.`
  assert.equal(await con.verificar(none), undefined)
})
