// lib/strava.js — refresh y obtención de access token de Strava (CommonJS).
// Extraído de las 3 funciones coach-* (C2). refreshStravaToken era idéntico en
// las tres. La lógica de "token válido / refrescar / persistir" también, salvo
// el manejo del fallo del refresh: aquí se devuelve null y CADA llamante decide
// qué hacer (el dashboard degrada ese atleta; la vista de detalle devuelve 502).

const { httpsRequest, withTimeout } = require('./http')
const { supabasePatch } = require('./supabase-rest')

const MARGEN_S = 60 // refrescar si el token expira dentro de este margen
const TIMEOUT_MS = 5000

function refreshStravaToken(clientId, clientSecret, refreshToken) {
  const body = JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  return httpsRequest({
    hostname: 'www.strava.com',
    path: '/api/v3/oauth/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    body,
  })
}

// Devuelve un access token válido para el perfil dado. Si el token vigente aún
// no expira (con margen), lo devuelve tal cual; si no, lo refresca y persiste
// los 3 campos en profiles. Devuelve null si el refresh falla.
// env: { supabaseHost, SERVICE_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET }
async function getStravaAccessToken(perfil, env) {
  const ahora = Math.floor(Date.now() / 1000)
  if (perfil.strava_token_expires_at && perfil.strava_token_expires_at > ahora + MARGEN_S) {
    return perfil.strava_token
  }

  const refresh = await withTimeout(
    refreshStravaToken(env.STRAVA_CLIENT_ID, env.STRAVA_CLIENT_SECRET, perfil.strava_refresh_token),
    TIMEOUT_MS
  )
  if (!refresh.json || !refresh.json.access_token) return null

  await withTimeout(
    supabasePatch(env.supabaseHost, `/rest/v1/profiles?id=eq.${perfil.id}`, env.SERVICE_KEY, {
      strava_token: refresh.json.access_token,
      strava_refresh_token: refresh.json.refresh_token,
      strava_token_expires_at: refresh.json.expires_at,
    }),
    TIMEOUT_MS
  )
  return refresh.json.access_token
}

module.exports = { refreshStravaToken, getStravaAccessToken }
