// set-fc-max.js — Netlify Function (CommonJS)
// Guarda la FC máxima de un atleta (profiles.fc_maxima), de la que salen su
// TSS, sus zonas y su CTL. POST { athleteId, fcMax } + header
// Authorization: Bearer <jwt de Supabase>.
//
// Autorización: el propio atleta o un coach con relación real en coach_athletes
// (canAccessAthlete). La RLS de `profiles` solo deja a cada usuario editar SU
// perfil, por eso Jon no podía ponérsela a sus atletas desde el navegador.
// Solo toca la columna fc_maxima; la identidad sale del JWT, athleteId del body
// se verifica contra la relación.

const { verifyAuth, canAccessAthlete, UUID_REGEX } = require('./lib/auth')
const { withTimeout, httpsRequest } = require('./lib/http')
const { validarFcMax, FC_MAX_MIN, FC_MAX_MAX } = require('./lib/fc-max.cjs')
const { allowRequest, MENSAJE_429 } = require('./lib/rate-limit')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIMEOUT_MS = 8000
// Es un ajuste que se toca una vez; 20 cada 10 min por usuario sobra.
const RL_MAX = 20
const RL_WINDOW_S = 600

function respuesta(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) }
}

function patchPerfil(athleteId, fcMax) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const body = JSON.stringify({ fc_maxima: fcMax })
  return withTimeout(
    httpsRequest({
      hostname: new URL(SUPABASE_URL).hostname,
      path: `/rest/v1/profiles?id=eq.${athleteId}`,
      method: 'PATCH',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Prefer: 'return=representation',
      },
      body,
    }),
    TIMEOUT_MS
  )
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  const auth = await verifyAuth(event)
  if (!auth) return respuesta(401, { error: 'Unauthorized' })

  if (!(await allowRequest('set_fc_max', auth.uid, RL_MAX, RL_WINDOW_S))) {
    return respuesta(429, { error: MENSAJE_429, code: 'RATE_LIMITED' })
  }

  let parsed
  try { parsed = JSON.parse(event.body || '{}') }
  catch { return respuesta(400, { error: 'JSON inválido' }) }

  const { athleteId } = parsed
  if (!UUID_REGEX.test(athleteId || '')) return respuesta(400, { error: 'athleteId inválido' })

  const fcMax = validarFcMax(parsed.fcMax)
  if (fcMax === null) {
    return respuesta(400, { error: `La FC máxima debe ser un número entero entre ${FC_MAX_MIN} y ${FC_MAX_MAX}`, code: 'FC_MAX_INVALIDA' })
  }

  if (!(await canAccessAthlete(auth, athleteId))) return respuesta(403, { error: 'No autorizado para este atleta' })

  try {
    const res = await patchPerfil(athleteId, fcMax)
    const ok = res && res.status >= 200 && res.status < 300 && Array.isArray(res.json) && res.json.length === 1
    if (!ok) {
      console.error('set-fc-max: no se pudo guardar', res && res.status)
      return respuesta(502, { error: 'No se pudo guardar la FC máxima. Inténtalo de nuevo.', code: 'PERSIST_FAILED' })
    }
    return respuesta(200, { ok: true, fc_maxima: fcMax })
  } catch (err) {
    console.error('set-fc-max error:', err.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
