// coach-dashboard-data.js — Netlify Function (CommonJS)
// POST { coachId } + header x-coach-secret
// Devuelve métricas de los últimos 7 días por atleta del coach:
// [{ athlete_id, nombre, km_semana, horas_semana, tss_semana, ultima_actividad_dias }]

const https = require('https')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-coach-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FC_MAX_DEFAULT = 185
const DIA_MS = 86400000
const VENTANA_DIAS = 7
const SEMANAS_SPARKLINE = 4

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ])
}

function httpsRequest({ hostname, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, (res) => {
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
    if (body) req.write(body)
    req.end()
  })
}

function supabaseGet(supabaseHost, path, key) {
  return httpsRequest({
    hostname: supabaseHost,
    path,
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  })
}

function supabasePatch(supabaseHost, path, key, payload) {
  const body = JSON.stringify(payload)
  return httpsRequest({
    hostname: supabaseHost,
    path,
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Prefer: 'return=representation',
    },
    body,
  })
}

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

function round(value, decimals) {
  if (value == null || Number.isNaN(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// Lunes (YYYY-MM-DD) de la semana de una fecha local YYYY-MM-DD
function lunesDeSemana(fechaLocal) {
  const [y, m, d] = fechaLocal.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() // 0=domingo
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(date.getTime() - offset * 86400000)
  return monday.toISOString().slice(0, 10)
}

// Últimas N semanas con TSS agregado, ordenadas de más antigua a más reciente
function semanasRecientes(actividades, fcMax, n) {
  const porLunes = actividades.reduce((acc, a) => {
    if (!a.start_date_local) return acc
    const lunes = lunesDeSemana(a.start_date_local.slice(0, 10))
    return { ...acc, [lunes]: (acc[lunes] || 0) + tssEstimado(a, fcMax) }
  }, {})

  return Object.keys(porLunes)
    .sort()
    .slice(-n)
    .map((lunes) => ({ semana: lunes, tss_total: round(porLunes[lunes], 0) }))
}

function tssEstimado(act, fcMax) {
  const fcMedia = act.average_heartrate
  const duracionMin = act.moving_time ? act.moving_time / 60 : null
  if (!fcMedia || !duracionMin) return 0
  const intensidadPct = (fcMedia / fcMax) * 100
  return (duracionMin / 60) * (intensidadPct / 100) ** 2 * 100
}

// Devuelve un access token válido, refrescándolo y persistiéndolo si ha expirado
async function obtenerAccessToken(perfil, env) {
  const ahora = Math.floor(Date.now() / 1000)
  if (perfil.strava_token_expires_at && perfil.strava_token_expires_at > ahora + 60) {
    return perfil.strava_token
  }
  const refresh = await withTimeout(
    refreshStravaToken(env.STRAVA_CLIENT_ID, env.STRAVA_CLIENT_SECRET, perfil.strava_refresh_token),
    5000
  )
  if (!refresh.json || !refresh.json.access_token) return null
  await withTimeout(
    supabasePatch(env.supabaseHost, `/rest/v1/profiles?id=eq.${perfil.id}`, env.SERVICE_KEY, {
      strava_token: refresh.json.access_token,
      strava_refresh_token: refresh.json.refresh_token,
      strava_token_expires_at: refresh.json.expires_at,
    }),
    5000
  )
  return refresh.json.access_token
}

async function procesarAtleta(athleteId, env) {
  const base = {
    athlete_id: athleteId,
    nombre: 'Atleta',
    km_semana: null,
    horas_semana: null,
    tss_semana: null,
    ultima_actividad_dias: null,
    semanas_recientes: [],
  }

  try {
    const perfilRes = await withTimeout(
      supabaseGet(env.supabaseHost, `/rest/v1/profiles?id=eq.${athleteId}&select=*`, env.SERVICE_KEY),
      5000
    )
    const perfil = Array.isArray(perfilRes.json) ? perfilRes.json[0] : null
    if (!perfil) return base

    const conNombre = { ...base, nombre: perfil.nombre || perfil.email || 'Atleta' }
    if (!perfil.strava_token || !perfil.strava_refresh_token) return conNombre

    const accessToken = await obtenerAccessToken(perfil, env)
    if (!accessToken) return conNombre

    // Una sola llamada sin filtro de fecha: sirve para los 7 días y para
    // saber cuándo fue la última actividad aunque sea anterior a la ventana
    const actRes = await withTimeout(
      httpsRequest({
        hostname: 'www.strava.com',
        path: '/api/v3/athlete/activities?per_page=100',
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      10000
    )
    if (actRes.status !== 200 || !Array.isArray(actRes.json)) return conNombre

    const actividades = actRes.json
    const ahoraMs = Date.now()
    const corteSemana = ahoraMs - VENTANA_DIAS * DIA_MS
    const fcMax = perfil.fc_maxima || FC_MAX_DEFAULT

    const semana = actividades.filter(
      (a) => a.start_date && new Date(a.start_date).getTime() >= corteSemana
    )

    const totales = semana.reduce(
      (acc, a) => ({
        km: acc.km + (a.distance || 0) / 1000,
        horas: acc.horas + (a.moving_time || 0) / 3600,
        tss: acc.tss + tssEstimado(a, fcMax),
      }),
      { km: 0, horas: 0, tss: 0 }
    )

    const ultimaFecha = actividades.length > 0 ? new Date(actividades[0].start_date).getTime() : null
    const ultimaDias = ultimaFecha != null ? Math.floor((ahoraMs - ultimaFecha) / DIA_MS) : null

    return {
      ...conNombre,
      km_semana: round(totales.km, 1),
      horas_semana: round(totales.horas, 1),
      tss_semana: round(totales.tss, 0),
      ultima_actividad_dias: ultimaDias,
      semanas_recientes: semanasRecientes(actividades, fcMax, SEMANAS_SPARKLINE),
    }
  } catch (err) {
    console.error(`procesarAtleta ${athleteId} error:`, err.message)
    return base
  }
}

function respuesta(statusCode, payload) {
  return { statusCode, headers: CORS, body: JSON.stringify(payload) }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return respuesta(405, { error: 'Method Not Allowed' })

  // 1. Validar env vars
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const COACH_SECRET = process.env.COACH_FUNCTION_SECRET
  const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID
  const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
  if (!SUPABASE_URL || !SERVICE_KEY || !COACH_SECRET || !STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return respuesta(500, { error: 'Server misconfigured' })
  }
  const supabaseHost = SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')

  // 2. Verificar secret
  const secret = event.headers['x-coach-secret']
  if (secret !== COACH_SECRET) return respuesta(401, { error: 'Unauthorized' })

  // 3. Parse + validación de input
  let parsed
  try {
    parsed = JSON.parse(event.body || '{}')
  } catch {
    return respuesta(400, { error: 'JSON inválido' })
  }
  const { coachId } = parsed
  if (!UUID_REGEX.test(coachId || '')) {
    return respuesta(400, { error: 'coachId debe ser un UUID válido' })
  }

  try {
    // 4. Verificar que es coach y leer sus atletas
    const coachRes = await withTimeout(
      supabaseGet(supabaseHost, `/rest/v1/coaches?id=eq.${coachId}&select=id`, SERVICE_KEY),
      5000
    )
    if (!Array.isArray(coachRes.json) || coachRes.json.length === 0) {
      return respuesta(403, { error: 'No es un coach válido' })
    }

    const relRes = await withTimeout(
      supabaseGet(
        supabaseHost,
        `/rest/v1/coach_athletes?coach_id=eq.${coachId}&select=athlete_id`,
        SERVICE_KEY
      ),
      5000
    )
    const atletaIds = Array.isArray(relRes.json) ? relRes.json.map((r) => r.athlete_id) : []
    if (atletaIds.length === 0) return respuesta(200, [])

    // 5. Procesar atletas en paralelo (cada uno con su propio try/catch)
    const env = { supabaseHost, SERVICE_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET }
    const resultados = await Promise.all(atletaIds.map((id) => procesarAtleta(id, env)))

    return respuesta(200, resultados)
  } catch (err) {
    console.error('coach-dashboard-data error:', err.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
