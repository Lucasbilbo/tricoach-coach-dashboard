// coach-athlete-data.js — Netlify Function (CommonJS)
// POST { athleteId, coachId, weeks } + header x-coach-secret
// Devuelve { atleta, actividades, semanas } leyendo Strava con tokens del perfil
// del atleta en Supabase (service key, nunca expuesto al frontend).

const https = require('https')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-coach-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIMEZONE = 'Europe/Madrid'
const FC_MAX_DEFAULT = 185
const WEEKS_DEFAULT = 8
const WEEKS_MAX = 52

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

function mapDisciplina(tipo) {
  const t = (tipo || '').toLowerCase()
  if (t.includes('run')) return 'run'
  if (t.includes('ride') || t.includes('bike') || t === 'velomobile') return 'bike'
  if (t.includes('swim')) return 'swim'
  if (t.includes('weight') || t.includes('crossfit') || t === 'workout') return 'strength'
  return 'other'
}

function zonaFc(intensidadPct) {
  if (intensidadPct == null) return null
  if (intensidadPct < 60) return 'Z1'
  if (intensidadPct < 70) return 'Z2'
  if (intensidadPct < 80) return 'Z3'
  if (intensidadPct < 90) return 'Z4'
  return 'Z5'
}

function round(value, decimals) {
  if (value == null || Number.isNaN(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// Fecha local (YYYY-MM-DD) en Europe/Madrid para un instante dado
function fechaMadrid(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
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

function transformarActividad(act, fcMax) {
  const duracionMin = act.moving_time ? round(act.moving_time / 60, 1) : null
  const distanciaKm = act.distance ? round(act.distance / 1000, 2) : null
  const disciplina = mapDisciplina(act.sport_type || act.type)
  const fcMedia = act.average_heartrate ? round(act.average_heartrate, 0) : null

  const ritmoMinKm =
    disciplina === 'run' && distanciaKm > 0 && duracionMin
      ? round(duracionMin / distanciaKm, 2)
      : null

  const intensidadPct = fcMedia ? round((fcMedia / fcMax) * 100, 0) : null

  const tssEstimado =
    fcMedia && duracionMin
      ? round((duracionMin / 60) * (intensidadPct / 100) ** 2 * 100, 0)
      : null

  return {
    tipo: act.sport_type || act.type || null,
    disciplina,
    distancia_km: distanciaKm,
    duracion_min: duracionMin,
    fecha: act.start_date_local ? act.start_date_local.slice(0, 10) : fechaMadrid(new Date(act.start_date)),
    ritmo_min_km: ritmoMinKm,
    fc_media: fcMedia,
    fc_maxima_actividad: act.max_heartrate ? round(act.max_heartrate, 0) : null,
    potencia_media: act.average_watts ? round(act.average_watts, 0) : null,
    cadencia_media: act.average_cadence ? round(act.average_cadence, 0) : null,
    desnivel_m: act.total_elevation_gain ? round(act.total_elevation_gain, 0) : null,
    intensidad_pct: intensidadPct,
    zona_fc: zonaFc(intensidadPct),
    tss_estimado: tssEstimado,
    nombre_actividad: act.name || null,
  }
}

function agruparSemanas(actividades) {
  const porLunes = {}
  for (const act of actividades) {
    if (!act.fecha) continue
    const lunes = lunesDeSemana(act.fecha)
    if (!porLunes[lunes]) {
      porLunes[lunes] = {
        semana: lunes,
        km_run: 0,
        km_bike: 0,
        km_swim: 0,
        horas_totales: 0,
        tss_total: 0,
        n_sesiones: 0,
      }
    }
    const s = porLunes[lunes]
    const nueva = {
      ...s,
      km_run: s.km_run + (act.disciplina === 'run' ? act.distancia_km || 0 : 0),
      km_bike: s.km_bike + (act.disciplina === 'bike' ? act.distancia_km || 0 : 0),
      km_swim: s.km_swim + (act.disciplina === 'swim' ? act.distancia_km || 0 : 0),
      horas_totales: s.horas_totales + (act.duracion_min || 0) / 60,
      tss_total: s.tss_total + (act.tss_estimado || 0),
      n_sesiones: s.n_sesiones + 1,
    }
    porLunes[lunes] = nueva
  }
  return Object.values(porLunes)
    .map((s) => ({
      ...s,
      km_run: round(s.km_run, 1),
      km_bike: round(s.km_bike, 1),
      km_swim: round(s.km_swim, 2),
      horas_totales: round(s.horas_totales, 1),
      tss_total: round(s.tss_total, 0),
    }))
    .sort((a, b) => (a.semana < b.semana ? -1 : 1))
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
  const { athleteId, coachId } = parsed
  const weeks = Math.min(Math.max(parseInt(parsed.weeks, 10) || WEEKS_DEFAULT, 1), WEEKS_MAX)
  if (!UUID_REGEX.test(athleteId || '') || !UUID_REGEX.test(coachId || '')) {
    return respuesta(400, { error: 'athleteId y coachId deben ser UUID válidos' })
  }

  try {
    // 4. Verificar relación coach-atleta
    const rel = await withTimeout(
      supabaseGet(
        supabaseHost,
        `/rest/v1/coach_athletes?coach_id=eq.${coachId}&athlete_id=eq.${athleteId}&select=id`,
        SERVICE_KEY
      ),
      5000
    )
    if (!Array.isArray(rel.json) || rel.json.length === 0) {
      return respuesta(403, { error: 'El atleta no pertenece a este coach' })
    }

    // 5. Leer perfil del atleta (tokens Strava) con service key
    const perfilRes = await withTimeout(
      supabaseGet(supabaseHost, `/rest/v1/profiles?id=eq.${athleteId}&select=*`, SERVICE_KEY),
      5000
    )
    const perfil = Array.isArray(perfilRes.json) ? perfilRes.json[0] : null
    if (!perfil) return respuesta(404, { error: 'Perfil del atleta no encontrado' })
    if (!perfil.strava_access_token || !perfil.strava_refresh_token) {
      return respuesta(409, { error: 'El atleta no tiene Strava conectado' })
    }

    // 6. Refrescar token si expirado (margen de 60s)
    let accessToken = perfil.strava_access_token
    const ahora = Math.floor(Date.now() / 1000)
    if (!perfil.strava_expires_at || perfil.strava_expires_at <= ahora + 60) {
      const refresh = await withTimeout(
        refreshStravaToken(STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, perfil.strava_refresh_token),
        5000
      )
      if (!refresh.json || !refresh.json.access_token) {
        return respuesta(502, { error: 'No se pudo refrescar el token de Strava' })
      }
      accessToken = refresh.json.access_token
      await withTimeout(
        supabasePatch(supabaseHost, `/rest/v1/profiles?id=eq.${athleteId}`, SERVICE_KEY, {
          strava_access_token: refresh.json.access_token,
          strava_refresh_token: refresh.json.refresh_token,
          strava_expires_at: refresh.json.expires_at,
        }),
        5000
      )
    }

    // 7. Actividades de Strava desde el inicio del rango
    const after = Math.floor(Date.now() / 1000) - weeks * 7 * 86400
    const actRes = await withTimeout(
      httpsRequest({
        hostname: 'www.strava.com',
        path: `/api/v3/athlete/activities?per_page=200&after=${after}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      10000
    )
    if (actRes.status !== 200 || !Array.isArray(actRes.json)) {
      console.error('Strava error', actRes.status, actRes.json)
      return respuesta(502, { error: 'Error consultando Strava' })
    }

    // 8. Transformar y agrupar
    const fcMax = perfil.fc_max || FC_MAX_DEFAULT
    const actividades = actRes.json
      .map((a) => transformarActividad(a, fcMax))
      .sort((a, b) => (a.fecha > b.fecha ? -1 : 1))
    const semanas = agruparSemanas(actividades)

    return respuesta(200, {
      atleta: { id: perfil.id, nombre: perfil.nombre || perfil.email || 'Atleta' },
      actividades,
      semanas,
    })
  } catch (err) {
    console.error('coach-athlete-data error:', err.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
