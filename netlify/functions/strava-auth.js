// strava-auth.js — Netlify Function (CommonJS)
// OAuth de Strava para atletas del coach dashboard.
//
// Flujo (S4 — state firmado contra CSRF de vinculación):
//   1. POST /.netlify/functions/strava-auth?action=start  (con Authorization: Bearer)
//      → verifica el JWT, firma un state con el uid y devuelve { authUrl }.
//      El frontend redirige el navegador a esa authUrl.
//   2. GET  /.netlify/functions/strava-auth?action=callback&code=...&state=...
//      → Strava redirige aquí; se verifica el HMAC del state y el uid sale de
//        ahí (nunca de un query manipulable), luego se guardan los tokens.

const https = require('https')
const { verifyAuth } = require('./lib/auth')
const { signState, verifyState } = require('./lib/oauth-state')

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function getSiteUrl() {
  return process.env.URL || 'https://jongarcia.getricoach.com'
}

function supabaseGet(path) {
  const hostname = new URL(SUPABASE_URL).hostname
  return new Promise((resolve) => {
    const options = {
      hostname,
      path: `/rest/v1/${path}`,
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.end()
  })
}

function supabasePatch(userId, body) {
  const hostname = new URL(SUPABASE_URL).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const options = {
      hostname,
      path: `/rest/v1/profiles?id=eq.${userId}`,
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Prefer: 'return=minimal',
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', () => resolve({ status: 500, body: null }))
    req.write(bodyStr)
    req.end()
  })
}

function stravaTokenExchange(postData) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'www.strava.com',
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
    })
    req.on('error', () => resolve({}))
    req.write(postData)
    req.end()
  })
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      return { statusCode: 500, headers: CORS, body: 'Strava no configurado en el servidor' }
    }

    const params = event.queryStringParameters || {}
    const { action } = params
    const siteUrl = getSiteUrl()
    const redirectUri = `${siteUrl}/.netlify/functions/strava-auth?action=callback`

    // ── start: inicia OAuth (autenticado). Devuelve la authUrl de Strava ─────
    if (action === 'start') {
      if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) }
      }
      const auth = await verifyAuth(event)
      if (!auth) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }
      }

      const state = signState(auth.uid)
      const authUrl = new URL('https://www.strava.com/oauth/authorize')
      authUrl.searchParams.set('client_id', STRAVA_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'activity:read_all')
      authUrl.searchParams.set('state', state)

      return {
        statusCode: 200,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ authUrl: authUrl.toString() }),
      }
    }

    // ── callback: Strava redirige aquí (GET). El uid sale del state firmado ──
    if (action === 'callback') {
      if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }
      }

      const { code, state } = params
      const verified = verifyState(state)
      if (!code || !verified) {
        return {
          statusCode: 302,
          headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
          body: '',
        }
      }
      const userId = verified.uid

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return { statusCode: 500, headers: CORS, body: 'Supabase no configurado' }
      }

      const postData = new URLSearchParams({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString()

      const stravaData = await stravaTokenExchange(postData)

      if (!stravaData.access_token) {
        console.error('strava-auth: intercambio sin access_token')
        return {
          statusCode: 302,
          headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
          body: '',
        }
      }

      const patchResult = await supabasePatch(userId, {
        strava_token: stravaData.access_token,
        strava_refresh_token: stravaData.refresh_token,
        strava_token_expires_at: stravaData.expires_at,
      })

      if (patchResult.status >= 300) {
        console.error('strava-auth: PATCH fallido', patchResult.status)
        return {
          statusCode: 302,
          headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
          body: '',
        }
      }

      const perfiles = await supabaseGet(`profiles?id=eq.${userId}&select=intervals_api_key`)
      const tieneIntervals = Array.isArray(perfiles) && !!perfiles[0]?.intervals_api_key

      const destino = tieneIntervals ? `${siteUrl}/home` : `${siteUrl}/setup/intervals`
      return { statusCode: 302, headers: { Location: destino }, body: '' }
    }

    return { statusCode: 400, headers: CORS, body: 'Parámetro action requerido: start o callback' }
  } catch (err) {
    console.error('strava-auth ERROR:', err)
    const siteUrl = getSiteUrl()
    return {
      statusCode: 302,
      headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
      body: '',
    }
  }
}
