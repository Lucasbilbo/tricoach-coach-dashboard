// coach-activity-detail.js — Netlify Function (CommonJS)
// POST { activityId, athleteId, coachId } + header x-coach-secret
// Devuelve { actividad, vueltas } con el detalle completo de una actividad
// de Strava (splits, laps, polyline). Misma verificación que coach-athlete-data.

const https = require('https')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-coach-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIVITY_ID_REGEX = /^\d+$/
const FC_MAX_DEFAULT = 185
// Ritmos fuera de este rango son outliers (GPS roto, cinta sin footpod) → null
const RITMO_MIN_PLAUSIBLE_S = 2.0 * 60
const RITMO_MAX_PLAUSIBLE_S = 20.0 * 60

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

// Segundos por km → "M:SS"
function formatRitmo(segundosPorKm) {
  if (segundosPorKm == null || !Number.isFinite(segundosPorKm)) return null
  let min = Math.floor(segundosPorKm / 60)
  let seg = Math.round(segundosPorKm % 60)
  if (seg === 60) {
    min += 1
    seg = 0
  }
  return `${min}:${String(seg).padStart(2, '0')}`
}

function ritmoDesdeTiempos(movingTimeS, distanciaM) {
  if (!movingTimeS || !distanciaM || distanciaM <= 0) return null
  const segundosPorKm = movingTimeS / (distanciaM / 1000)
  if (segundosPorKm < RITMO_MIN_PLAUSIBLE_S || segundosPorKm > RITMO_MAX_PLAUSIBLE_S) return null
  return formatRitmo(segundosPorKm)
}

function transformarSplits(splitsMetric) {
  if (!Array.isArray(splitsMetric)) return []
  return splitsMetric.map((s) => ({
    km: s.split,
    elapsed_time_s: s.elapsed_time ?? null,
    moving_time_s: s.moving_time ?? null,
    distancia_m: s.distance != null ? round(s.distance, 0) : null,
    ritmo_min_km: ritmoDesdeTiempos(s.moving_time, s.distance),
    fc_media: s.average_heartrate != null ? round(s.average_heartrate, 0) : null,
    velocidad_ms: s.average_speed ?? null,
    desnivel_m: s.elevation_difference != null ? round(s.elevation_difference, 0) : null,
  }))
}

function transformarVueltas(laps) {
  if (!Array.isArray(laps)) return []
  return laps.map((lap) => ({
    indice: lap.lap_index,
    nombre: lap.name || `Vuelta ${lap.lap_index}`,
    distancia_km: lap.distance != null ? round(lap.distance / 1000, 2) : null,
    elapsed_time_s: lap.elapsed_time ?? null,
    moving_time_s: lap.moving_time ?? null,
    ritmo_min_km: ritmoDesdeTiempos(lap.moving_time, lap.distance),
    velocidad_media_kmh: lap.average_speed != null ? round(lap.average_speed * 3.6, 1) : null,
    velocidad_max_kmh: lap.max_speed != null ? round(lap.max_speed * 3.6, 1) : null,
    fc_media: lap.average_heartrate != null ? round(lap.average_heartrate, 0) : null,
    fc_max: lap.max_heartrate != null ? round(lap.max_heartrate, 0) : null,
    potencia_media: lap.average_watts != null ? round(lap.average_watts, 0) : null,
    cadencia_media: lap.average_cadence != null ? round(lap.average_cadence, 0) : null,
    desnivel_m: lap.total_elevation_gain != null ? round(lap.total_elevation_gain, 0) : null,
  }))
}

function transformarActividad(act, fcMax) {
  const disciplina = mapDisciplina(act.sport_type || act.type)
  const distanciaKm = act.distance ? round(act.distance / 1000, 2) : null
  const duracionMovMin = act.moving_time ? round(act.moving_time / 60, 1) : null
  const fcMedia = act.average_heartrate ? round(act.average_heartrate, 0) : null
  const intensidadPct = fcMedia ? round((fcMedia / fcMax) * 100, 0) : null
  const tssEstimado =
    fcMedia && duracionMovMin
      ? round((duracionMovMin / 60) * (intensidadPct / 100) ** 2 * 100, 0)
      : null

  const splits = transformarSplits(act.splits_metric)
  const desnivelNeg = splits.reduce(
    (acc, s) => (s.desnivel_m != null && s.desnivel_m < 0 ? acc + Math.abs(s.desnivel_m) : acc),
    0
  )

  return {
    id: act.id,
    nombre: act.name || null,
    tipo: act.sport_type || act.type || null,
    disciplina,
    fecha: act.start_date_local ? act.start_date_local.slice(0, 10) : null,
    distancia_km: distanciaKm,
    duracion_min: act.elapsed_time ? round(act.elapsed_time / 60, 1) : null,
    duracion_mov_min: duracionMovMin,
    ritmo_min_km: disciplina === 'run' ? ritmoDesdeTiempos(act.moving_time, act.distance) : null,
    velocidad_media_kmh: act.average_speed != null ? round(act.average_speed * 3.6, 1) : null,
    velocidad_max_kmh: act.max_speed != null ? round(act.max_speed * 3.6, 1) : null,
    fc_media: fcMedia,
    fc_maxima_actividad: act.max_heartrate ? round(act.max_heartrate, 0) : null,
    potencia_media: act.average_watts != null ? round(act.average_watts, 0) : null,
    potencia_max: act.max_watts != null ? round(act.max_watts, 0) : null,
    potencia_normalizada: act.weighted_average_watts != null ? round(act.weighted_average_watts, 0) : null,
    cadencia_media: act.average_cadence != null ? round(act.average_cadence, 0) : null,
    cadencia_max: act.max_cadence != null ? round(act.max_cadence, 0) : null,
    desnivel_pos_m: act.total_elevation_gain != null ? round(act.total_elevation_gain, 0) : null,
    desnivel_neg_m: splits.length > 0 ? round(desnivelNeg, 0) : null,
    altitud_max_m: act.elev_high != null ? round(act.elev_high, 0) : null,
    altitud_min_m: act.elev_low != null ? round(act.elev_low, 0) : null,
    calorias: act.calories != null ? round(act.calories, 0) : null,
    descripcion: act.description || null,
    zona_fc: zonaFc(intensidadPct),
    intensidad_pct: intensidadPct,
    tss_estimado: tssEstimado,
    polyline: act.map?.polyline || act.map?.summary_polyline || null,
    splits_km: splits,
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
  const { activityId, athleteId, coachId } = parsed
  if (!ACTIVITY_ID_REGEX.test(String(activityId || ''))) {
    return respuesta(400, { error: 'activityId debe ser un id numérico de Strava' })
  }
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
    if (!perfil.strava_token || !perfil.strava_refresh_token) {
      return respuesta(409, { error: 'El atleta no tiene Strava conectado' })
    }

    // 6. Refrescar token si expirado (margen de 60s)
    let accessToken = perfil.strava_token
    const ahora = Math.floor(Date.now() / 1000)
    if (!perfil.strava_token_expires_at || perfil.strava_token_expires_at <= ahora + 60) {
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
          strava_token: refresh.json.access_token,
          strava_refresh_token: refresh.json.refresh_token,
          strava_token_expires_at: refresh.json.expires_at,
        }),
        5000
      )
    }

    // 7. Detalle de actividad + vueltas en paralelo
    const stravaHeaders = { Authorization: `Bearer ${accessToken}` }
    const [actRes, lapsRes] = await Promise.all([
      withTimeout(
        httpsRequest({
          hostname: 'www.strava.com',
          path: `/api/v3/activities/${activityId}`,
          method: 'GET',
          headers: stravaHeaders,
        }),
        10000
      ),
      withTimeout(
        httpsRequest({
          hostname: 'www.strava.com',
          path: `/api/v3/activities/${activityId}/laps`,
          method: 'GET',
          headers: stravaHeaders,
        }),
        10000
      ),
    ])

    if (actRes.status === 404) {
      return respuesta(404, { error: 'Actividad no encontrada en Strava' })
    }
    if (actRes.status !== 200 || !actRes.json) {
      console.error('Strava activity error', actRes.status, actRes.json)
      return respuesta(502, { error: 'Error consultando la actividad en Strava' })
    }

    // Las vueltas son opcionales: si fallan, devolvemos la actividad igualmente
    const laps = lapsRes.status === 200 && Array.isArray(lapsRes.json) ? lapsRes.json : []

    const fcMax = perfil.fc_maxima || FC_MAX_DEFAULT
    return respuesta(200, {
      actividad: transformarActividad(actRes.json, fcMax),
      vueltas: transformarVueltas(laps),
    })
  } catch (err) {
    console.error('coach-activity-detail error:', err.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
