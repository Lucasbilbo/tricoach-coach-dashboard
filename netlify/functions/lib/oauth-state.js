// lib/oauth-state.js — state firmado (HMAC) para el OAuth de Strava (S4).
//
// El flujo antiguo pasaba state = userId en claro y sin autenticar, así que
// cualquiera podía iniciar el flujo con el uid de otro (CSRF de vinculación).
// Ahora el state solo puede generarlo la fase autenticada (action=start, con
// JWT): se firma con HMAC-SHA256 usando un secreto server-side y lleva el uid
// del JWT + una expiración corta. El callback verifica la firma y la caducidad;
// el uid sale del state firmado, nunca de un query manipulable.
//
// Secreto: se reutiliza SUPABASE_SERVICE_ROLE_KEY (ya presente en el entorno,
// server-side, nunca expuesto). No requiere configurar env vars nuevas.

const crypto = require('crypto')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL_MS = 10 * 60 * 1000 // 10 minutos

function secret() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function hmac(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex')
}

// Genera state = "<uid>.<exp>.<nonce>.<hmac>" para un uid verificado por JWT.
// El nonce aleatorio garantiza que dos states seguidos sean distintos e
// impredecibles (no correlacionables aunque compartan uid y ms de expiración).
function signState(uid) {
  const exp = Date.now() + TTL_MS
  const nonce = crypto.randomBytes(8).toString('hex')
  const payload = `${uid}.${exp}.${nonce}`
  return `${payload}.${hmac(payload)}`
}

// Verifica firma y caducidad. Devuelve { uid } si válido, o null.
function verifyState(state) {
  if (!state || typeof state !== 'string') return null
  const parts = state.split('.')
  if (parts.length !== 4) return null
  const [uid, exp, nonce, sig] = parts
  if (!UUID_REGEX.test(uid) || !/^\d+$/.test(exp) || !/^[0-9a-f]{16}$/.test(nonce)) return null

  const expected = hmac(`${uid}.${exp}.${nonce}`)
  let a
  let b
  try {
    a = Buffer.from(sig, 'hex')
    b = Buffer.from(expected, 'hex')
  } catch {
    return null
  }
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  if (Number(exp) < Date.now()) return null

  return { uid }
}

module.exports = { signState, verifyState }
