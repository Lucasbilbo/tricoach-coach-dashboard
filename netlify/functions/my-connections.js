// my-connections.js — Netlify Function (CommonJS)
// Devuelve SOLO si el usuario tiene Strava e Intervals conectados, sin exponer
// los tokens. Sustituye a las lecturas de strava_token / intervals_api_key que
// hacía el frontend (deuda anotada en CLAUDE.md: tokens de terceros NUNCA al
// navegador). POST + Authorization: Bearer <jwt>. La identidad sale del JWT.

const { verifyAuth, uidSinVerificar } = require('./lib/auth')
const { supabaseGet } = require('./lib/supabase-rest')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  // El perfil se pide YA con el sub del JWT, en paralelo con la verificación,
  // y solo se usa si coincide con el uid verificado (si no, se repite).
  // Rendimiento 2026-11-25: functions en Ohio, Supabase en Frankfurt.
  const leer = (uid) =>
    supabaseGet(
      new URL(process.env.SUPABASE_URL).hostname,
      `/rest/v1/profiles?id=eq.${uid}&select=strava_token,intervals_api_key,intervals_athlete_id`,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
  const supuesto = uidSinVerificar(event)
  const adelantado = supuesto
    ? Promise.resolve().then(() => leer(supuesto)).then((r) => ({ r }), (err) => ({ err }))
    : null

  const auth = await verifyAuth(event)
  if (!auth) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }

  try {
    let res
    if (adelantado && supuesto === auth.uid) {
      const x = await adelantado
      if (x.err) throw x.err
      res = x.r
    } else {
      res = await leer(auth.uid)
    }
    const p = Array.isArray(res.json) ? res.json[0] : null
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        strava: !!p?.strava_token,
        intervals: !!(p?.intervals_api_key && p?.intervals_athlete_id),
      }),
    }
  } catch (err) {
    console.error('my-connections:', err?.message)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Error interno' }) }
  }
}
