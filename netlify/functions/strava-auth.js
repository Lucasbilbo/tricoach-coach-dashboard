// strava-auth.js — Netlify Function (CommonJS)
// OAuth de Strava para atletas del coach dashboard
// GET /.netlify/functions/strava-auth?action=redirect&userId={uid}
// GET /.netlify/functions/strava-auth?action=callback&code={code}&state={userId}

const https = require('https')

const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID
const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    req.on('error', (e) => resolve({ status: 500, body: e.message }))
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
    if (event.httpMethod !== 'GET') {
      return { statusCode: 405, body: 'Method Not Allowed' }
    }

    if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
      return { statusCode: 500, body: 'Strava no configurado en el servidor' }
    }

    const params = event.queryStringParameters || {}
    const { action } = params
    const siteUrl = getSiteUrl()
    const redirectUri = `${siteUrl}/.netlify/functions/strava-auth?action=callback`

    // ── Redirect: iniciar OAuth ──────────────────────────────────────────────
    if (action === 'redirect') {
      const { userId } = params
      if (!userId || !UUID_REGEX.test(userId)) {
        return { statusCode: 400, body: 'userId válido requerido' }
      }

      const authUrl = new URL('https://www.strava.com/oauth/authorize')
      authUrl.searchParams.set('client_id', STRAVA_CLIENT_ID)
      authUrl.searchParams.set('redirect_uri', redirectUri)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('scope', 'activity:read_all')
      authUrl.searchParams.set('state', userId)

      return {
        statusCode: 302,
        headers: { Location: authUrl.toString() },
        body: '',
      }
    }

    // ── Callback: intercambiar code y guardar tokens ─────────────────────────
    if (action === 'callback') {
      const { code, state: userId } = params

      if (!code) {
        return {
          statusCode: 302,
          headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
          body: '',
        }
      }

      if (!userId || !UUID_REGEX.test(userId)) {
        return {
          statusCode: 302,
          headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
          body: '',
        }
      }

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return { statusCode: 500, body: 'Supabase no configurado' }
      }

      // Intercambiar code por tokens
      const postData = new URLSearchParams({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString()

      const stravaData = await stravaTokenExchange(postData)

      if (!stravaData.access_token) {
        console.error('strava-auth: sin access_token', JSON.stringify(stravaData))
        return {
          statusCode: 302,
          headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
          body: '',
        }
      }

      // Guardar tokens en profiles
      const patchResult = await supabasePatch(userId, {
        strava_token: stravaData.access_token,
        strava_refresh_token: stravaData.refresh_token,
        strava_token_expires_at: stravaData.expires_at,
      })

      if (patchResult.status >= 300) {
        console.error('strava-auth: PATCH fallido', patchResult.status, patchResult.body)
        return {
          statusCode: 302,
          headers: { Location: `${siteUrl}/setup/intervals?strava_error=1` },
          body: '',
        }
      }

      // Leer perfil para decidir destino
      const perfiles = await supabaseGet(
        `profiles?id=eq.${userId}&select=intervals_api_key`
      )
      const tieneIntervals = Array.isArray(perfiles) && !!perfiles[0]?.intervals_api_key

      const destino = tieneIntervals ? `${siteUrl}/home` : `${siteUrl}/setup/intervals`
      return {
        statusCode: 302,
        headers: { Location: destino },
        body: '',
      }
    }

    return { statusCode: 400, body: 'Parámetro action requerido: redirect o callback' }
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
