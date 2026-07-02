// lib/auth.js — verificación del JWT de Supabase para Netlify Functions (CommonJS)
//
// Sustituye al secreto compartido x-coach-secret (S2 de la auditoría 2026-07-02):
// el JWT de la sesión es la fuente de verdad sobre QUIÉN llama. La identidad
// nunca se lee del body.
//
// Método de verificación: GET /auth/v1/user con el JWT del cliente en
// Authorization. GoTrue valida firma, expiración y revocación de sesión y
// devuelve el usuario — funciona igual con claves HS256 o asimétricas, sin
// dependencias (regla del proyecto: sin supabase-js en functions).

const https = require('https')

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ])
}

function getJson({ hostname, path, headers }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null })
        } catch {
          resolve({ status: res.statusCode, json: null })
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Verifica el JWT del header Authorization contra Supabase Auth.
// Devuelve { uid, isCoach } si el token es válido, o null en cualquier otro
// caso (sin token, malformado, expirado, revocado). Falla cerrado.
async function verifyAuth(event) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) return null

  const header = event.headers.authorization || event.headers.Authorization || ''
  if (!header.startsWith('Bearer ')) return null
  const jwt = header.slice(7).trim()
  if (!jwt) return null

  const hostname = new URL(SUPABASE_URL).hostname

  let userRes
  try {
    userRes = await withTimeout(
      getJson({
        hostname,
        path: '/auth/v1/user',
        // apikey identifica el proyecto ante el gateway; el usuario verificado
        // es SIEMPRE el del Bearer token, no el de la apikey.
        headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
      }),
      5000
    )
  } catch {
    return null
  }

  const uid = userRes.status === 200 ? userRes.json?.id : null
  if (!uid || !UUID_REGEX.test(uid)) return null

  // Whitelist de coaches: consulta con service key (bypasa RLS)
  let coachRes
  try {
    coachRes = await withTimeout(
      getJson({
        hostname,
        path: `/rest/v1/coaches?id=eq.${uid}&select=id`,
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
      }),
      5000
    )
  } catch {
    return null
  }

  const isCoach = Array.isArray(coachRes.json) && coachRes.json.length > 0
  return { uid, isCoach }
}

// Comprueba la relación coach-atleta con service key. Devuelve boolean.
async function coachOwnsAthlete(coachId, athleteId) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) return false
  if (!UUID_REGEX.test(coachId || '') || !UUID_REGEX.test(athleteId || '')) return false

  const hostname = new URL(SUPABASE_URL).hostname
  try {
    const res = await withTimeout(
      getJson({
        hostname,
        path: `/rest/v1/coach_athletes?coach_id=eq.${coachId}&athlete_id=eq.${athleteId}&select=id`,
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
      }),
      5000
    )
    return Array.isArray(res.json) && res.json.length > 0
  } catch {
    return false
  }
}

// Autorización estándar para funciones que devuelven datos de UN atleta:
//  - el propio atleta (uid === athleteId), o
//  - un coach con relación verificada en coach_athletes.
// Devuelve true/false. El athleteId puede venir del body PORQUE se verifica aquí.
async function canAccessAthlete(auth, athleteId) {
  if (!auth || !UUID_REGEX.test(athleteId || '')) return false
  if (auth.uid === athleteId) return true
  if (!auth.isCoach) return false
  return coachOwnsAthlete(auth.uid, athleteId)
}

module.exports = { verifyAuth, coachOwnsAthlete, canAccessAthlete, UUID_REGEX }
