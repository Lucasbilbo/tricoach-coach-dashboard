// delete-session.js — Netlify Function (CommonJS)
// Borra una sesión prescrita Y su entreno en Intervals.icu (y por tanto en el
// reloj). Antes el borrado era solo en Supabase y el workout seguía en el Garmin.
// POST { sessionId } + header Authorization: Bearer <jwt de Supabase>
// Autorización: solo el coach dueño de la sesión (session.coach_id).

const { verifyAuth, UUID_REGEX } = require('./lib/auth')
const { withTimeout, httpsRequest } = require('./lib/http')
const { intervalsDelete, eventoBorrado } = require('./lib/intervals-api')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respuesta(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) }
}

function rest(method, path) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  return withTimeout(
    httpsRequest({
      hostname: new URL(process.env.SUPABASE_URL).hostname,
      path: `/rest/v1/${path}`,
      method,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
    }),
    8000
  )
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return respuesta(405, { error: 'Method Not Allowed' })

  const auth = await verifyAuth(event)
  if (!auth) return respuesta(401, { error: 'Unauthorized' })

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return respuesta(400, { error: 'JSON inválido' })
  }
  const { sessionId } = body
  if (!UUID_REGEX.test(sessionId || '')) return respuesta(400, { error: 'sessionId inválido' })

  try {
    const ses = await rest('GET', `coach_sessions?id=eq.${sessionId}&select=id,coach_id,athlete_id,intervals_event_id`)
    const sesion = Array.isArray(ses.json) ? ses.json[0] : null
    if (!sesion) return respuesta(404, { error: 'Sesión no encontrada' })
    if (sesion.coach_id !== auth.uid) return respuesta(403, { error: 'Solo el entrenador que la creó puede borrarla' })

    // 1) Retirar del calendario de Intervals (→ reloj). Si falla, NO se borra
    //    de la BD: así la sesión sigue visible y se puede reintentar, en vez de
    //    dejar un entreno fantasma en el reloj.
    if (sesion.intervals_event_id) {
      const perf = await rest('GET', `profiles?id=eq.${sesion.athlete_id}&select=intervals_api_key,intervals_athlete_id`)
      const perfil = Array.isArray(perf.json) ? perf.json[0] : null
      if (perfil?.intervals_api_key && perfil?.intervals_athlete_id) {
        const del = await intervalsDelete(perfil.intervals_athlete_id, perfil.intervals_api_key, sesion.intervals_event_id)
        if (!eventoBorrado(del)) {
          console.error(`delete-session: Intervals no borró el evento ${sesion.intervals_event_id} (status ${del.status})`)
          return respuesta(502, {
            error: 'No se pudo quitar el entreno del reloj. Inténtalo de nuevo en un momento.',
            code: 'INTERVALS_ERROR',
          })
        }
      }
    }

    // 2) Borrar la sesión.
    const del = await rest('DELETE', `coach_sessions?id=eq.${sessionId}&coach_id=eq.${auth.uid}`)
    if (del.status < 200 || del.status >= 300) return respuesta(502, { error: 'No se pudo borrar la sesión' })
    return respuesta(200, { ok: true })
  } catch (err) {
    console.error('delete-session:', err?.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
