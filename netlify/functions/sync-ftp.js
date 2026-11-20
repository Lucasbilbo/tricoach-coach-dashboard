// sync-ftp.js — Netlify Function (CommonJS)
// Sube el FTP de bici del atleta (atleta_potencia.ftp_w) a sus ajustes de
// ciclismo de Intervals.icu, para que el reloj convierta las zonas y los % de
// potencia con el MISMO FTP que usa el panel para el TSS (antes había que
// ponerlo a mano en los dos sitios).
// POST { athleteId } + Authorization: Bearer <jwt>. El FTP se lee de la BD (no
// del body). Autoriza el propio atleta o su coach (canAccessAthlete).
// Respuestas: 200 { ok:true, ftp } · 200 { ok:false, code } si no aplica
// (SIN_FTP, NO_INTERVALS) · 502 si Intervals rechaza · 4xx de auth/entrada.

const { verifyAuth, canAccessAthlete, UUID_REGEX } = require('./lib/auth')
const { allowLimite, MENSAJE_429 } = require('./lib/rate-limit')
const { withTimeout } = require('./lib/http')
const { supabaseGet } = require('./lib/supabase-rest')
const { intervalsPutFtp } = require('./lib/intervals-api')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const TIMEOUT_MS = 8000

const respuesta = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) })

// Lógica con dependencias inyectables (tests sin red)
async function sincronizarFtp({ athleteId, deps }) {
  const fila = await deps.leerFila(athleteId)
  const ftp = fila && Number(fila.ftp_w) > 0 ? Number(fila.ftp_w) : null
  if (!ftp) return respuesta(200, { ok: false, code: 'SIN_FTP' })
  const perfil = await deps.leerPerfil(athleteId)
  if (!perfil?.intervals_api_key || !perfil?.intervals_athlete_id) return respuesta(200, { ok: false, code: 'NO_INTERVALS' })
  const r = await deps.putFtp(perfil.intervals_athlete_id, perfil.intervals_api_key, ftp)
  if (r.status >= 200 && r.status < 300) return respuesta(200, { ok: true, ftp })
  console.error('sync-ftp: Intervals respondió', r.status)
  return respuesta(502, { ok: false, code: 'INTERVALS_ERROR', error: 'Intervals.icu no aceptó el FTP' })
}

function depsReales() {
  const host = new URL(process.env.SUPABASE_URL).hostname
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const fila1 = async (path) => {
    const r = await withTimeout(supabaseGet(host, path, key), TIMEOUT_MS)
    return Array.isArray(r?.json) ? r.json[0] || null : null
  }
  return {
    leerFila: (id) => fila1(`/rest/v1/atleta_potencia?athlete_id=eq.${id}&select=ftp_w`),
    leerPerfil: (id) => fila1(`/rest/v1/profiles?id=eq.${id}&select=intervals_api_key,intervals_athlete_id`),
    putFtp: intervalsPutFtp,
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const auth = await verifyAuth(event)
  if (!auth) return respuesta(401, { error: 'Unauthorized' })
  if (!(await allowLimite('sync_ftp', auth.uid))) return respuesta(429, { error: MENSAJE_429, code: 'RATE_LIMITED' })

  let body
  try { body = JSON.parse(event.body || '{}') } catch { return respuesta(400, { error: 'JSON inválido' }) }
  const { athleteId } = body
  if (!UUID_REGEX.test(athleteId || '')) return respuesta(400, { error: 'athleteId inválido' })
  if (!(await canAccessAthlete(auth, athleteId))) return respuesta(403, { error: 'No autorizado para este atleta' })

  try {
    return await sincronizarFtp({ athleteId, deps: depsReales() })
  } catch (err) {
    console.error('sync-ftp error:', err.message)
    return respuesta(500, { ok: false, error: 'Error interno' })
  }
}

exports._sincronizarFtp = sincronizarFtp
