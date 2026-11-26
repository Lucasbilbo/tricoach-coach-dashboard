// lib/auth.js — verificación del JWT de Supabase para Netlify Functions (CommonJS)
//
// Sustituye al secreto compartido x-coach-secret (S2 de la auditoría 2026-07-02):
// el JWT de la sesión es la fuente de verdad sobre QUIÉN llama. La identidad
// nunca se lee del body.
//
// Método de verificación (2026-11-26): primero EN LOCAL (lib/jwt-local.js:
// firma ES256/RS256 con el JWKS público del proyecto o HS256 con
// SUPABASE_JWT_SECRET; caducidad, emisor, audiencia y rol). Si no se puede
// decidir ahí, GET /auth/v1/user como siempre (GoTrue). Sin dependencias.

const https = require('https')
const { verificarLocal } = require('./jwt-local')
const { crearTtlCache } = require('./ttl-cache')

// Cachés por instancia caliente (best-effort: en frío empiezan vacías).
// - Whitelist de coaches: 60 s (altas y bajas son manuales y rarísimas).
// - Relación coach↔atleta: SOLO los «sí», 60 s. Un «no» nunca se cachea, así
//   una invitación recién aceptada funciona al instante; una baja tarda ≤ 60 s.
const cacheCoach = crearTtlCache({ ttlMs: 60 * 1000, max: 500 })
const cacheRelacion = crearTtlCache({ ttlMs: 60 * 1000, max: 2000 })
function reiniciarCachesAuth() {
  cacheCoach.clear()
  cacheRelacion.clear()
}

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

// uid que DICE el JWT (claim `sub`), SIN verificar la firma. Solo sirve para
// adelantar consultas en paralelo con la verificación real: quien lo use debe
// descartar el resultado si no coincide con el uid verificado por verifyAuth.
// Rendimiento (2026-11-25): las functions corren en Ohio y Supabase en
// Frankfurt; cada ida en serie cuesta ~300 ms.
function uidSinVerificar(event) {
  const header = (event && event.headers && (event.headers.authorization || event.headers.Authorization)) || ''
  if (!header.startsWith('Bearer ')) return null
  const partes = header.slice(7).trim().split('.')
  if (partes.length !== 3) return null
  try {
    const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
    return typeof payload.sub === 'string' && UUID_REGEX.test(payload.sub) ? payload.sub : null
  } catch {
    return null
  }
}

function leerCoach(hostname, SERVICE_KEY, uid) {
  return withTimeout(
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
}

// ¿Está en la whitelist? true/false; lanza si la consulta no llega (falla cerrado).
async function esCoach(hostname, SERVICE_KEY, uid) {
  const guardado = cacheCoach.get(uid)
  if (guardado !== undefined) return guardado
  const r = await leerCoach(hostname, SERVICE_KEY, uid)
  // Respuesta rara (no es una lista): no es coach, pero no se cachea.
  if (r.status !== 200 || !Array.isArray(r.json)) return false
  const si = r.json.length > 0
  cacheCoach.set(uid, si)
  return si
}

// Verifica el JWT del header Authorization contra Supabase Auth.
// Devuelve { uid, isCoach } si el token es válido, o null en cualquier otro
// caso (sin token, malformado, expirado, revocado). Falla cerrado.
// La whitelist de coaches se consulta EN PARALELO con /auth/v1/user usando el
// `sub` sin verificar; solo se acepta si coincide con el uid verificado (si no,
// se repite con el uid bueno). Ahorra una ida Ohio↔Frankfurt en cada función.
async function verifyAuth(event) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) return null

  const header = event.headers.authorization || event.headers.Authorization || ''
  if (!header.startsWith('Bearer ')) return null
  const jwt = header.slice(7).trim()
  if (!jwt) return null

  const hostname = new URL(SUPABASE_URL).hostname

  // 1) En local (firma con las claves públicas del proyecto o el secreto
  //    HS256): sin ida a Supabase. null = token inválido → fuera.
  let local
  try {
    local = await verificarLocal(jwt)
  } catch {
    local = undefined
  }
  if (local === null) return null
  if (local) {
    try {
      return { uid: local.uid, isCoach: await esCoach(hostname, SERVICE_KEY, local.uid), via: 'local' }
    } catch {
      return null
    }
  }

  // 2) No se pudo decidir en local → GoTrue, con la whitelist adelantada.
  const supuesto = uidSinVerificar(event)
  const coachAdelantado = supuesto
    ? esCoach(hostname, SERVICE_KEY, supuesto).then((si) => ({ si }), (err) => ({ err }))
    : null

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

  let isCoach
  if (coachAdelantado && supuesto === uid) {
    const adelantado = await coachAdelantado
    if (adelantado.err) return null
    isCoach = adelantado.si
  } else {
    try {
      isCoach = await esCoach(hostname, SERVICE_KEY, uid)
    } catch {
      return null
    }
  }
  return { uid, isCoach, via: 'remoto' }
}

// Comprueba la relación coach-atleta con service key. Devuelve boolean.
async function coachOwnsAthlete(coachId, athleteId) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY) return false
  if (!UUID_REGEX.test(coachId || '') || !UUID_REGEX.test(athleteId || '')) return false

  const clave = `${coachId}|${athleteId}`
  if (cacheRelacion.get(clave)) return true
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
    const si = Array.isArray(res.json) && res.json.length > 0
    if (si) cacheRelacion.set(clave, true)
    return si
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

// ¿Puede este usuario actuar COMO COACH sobre una sesión (enviarla al reloj,
// reenviarla, borrarla)? Ser session.coach_id NO basta: la policy de
// coach_sessions deja a cualquier usuario autenticado insertar filas con
// coach_id = él mismo y el athlete_id de otra persona. Sin esta comprobación,
// esa fila permitía escribir (y borrar eventos) en el Intervals → Garmin de
// un atleta ajeno. Exige: dueño de la sesión + whitelist de coaches + relación
// real en coach_athletes. Caso especial: coach y atleta son la misma persona.
async function canCoachSession(auth, session) {
  if (!auth || !session) return false
  if (auth.uid !== session.coach_id) return false
  if (session.coach_id === session.athlete_id) return true
  if (!auth.isCoach) return false
  return coachOwnsAthlete(session.coach_id, session.athlete_id)
}

module.exports = {
  verifyAuth,
  uidSinVerificar,
  coachOwnsAthlete,
  canAccessAthlete,
  canCoachSession,
  reiniciarCachesAuth,
  UUID_REGEX,
}
