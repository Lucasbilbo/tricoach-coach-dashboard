// coach-activity-detail.js — Netlify Function (CommonJS)
// POST { activityId, athleteId } + header Authorization: Bearer <jwt de Supabase>
// Autorización: el propio atleta (uid === athleteId) o un coach con relación
// verificada en coach_athletes. Misma verificación que coach-athlete-data.
// Devuelve { actividad, vueltas } con el detalle completo de una actividad
// de Strava (splits, laps, polyline).

const { verifyAuth, canAccessAthlete } = require('./lib/auth')
const { withTimeout, httpsRequest } = require('./lib/http')
const { supabaseGet } = require('./lib/supabase-rest')
const { getStravaAccessToken } = require('./lib/strava')
const { round, mapDisciplina, zonaFc } = require('./lib/metrics')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // x-coach-secret solo para que el preflight de bundles antiguos no falle por CORS
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-coach-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIVITY_ID_REGEX = /^\d+$/
const FC_MAX_DEFAULT = 185
// Ritmos fuera de este rango son outliers (GPS roto, cinta sin footpod) → null
const RITMO_MIN_PLAUSIBLE_S = 2.0 * 60
const RITMO_MAX_PLAUSIBLE_S = 20.0 * 60
// Natación: min/100m plausibles (fuera de rango → null)
const RITMO_SWIM_MIN_PLAUSIBLE_S = 0.8 * 60
const RITMO_SWIM_MAX_PLAUSIBLE_S = 6.0 * 60

// Segundos por unidad de distancia (km o 100 m) → "M:SS"
function formatRitmo(segundosPorUnidad) {
  if (segundosPorUnidad == null || !Number.isFinite(segundosPorUnidad)) return null
  let min = Math.floor(segundosPorUnidad / 60)
  let seg = Math.round(segundosPorUnidad % 60)
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

function ritmo100DesdeTiempos(movingTimeS, distanciaM) {
  if (!movingTimeS || !distanciaM || distanciaM <= 0) return null
  const segundosPor100m = movingTimeS / (distanciaM / 100)
  if (segundosPor100m < RITMO_SWIM_MIN_PLAUSIBLE_S || segundosPor100m > RITMO_SWIM_MAX_PLAUSIBLE_S) return null
  return formatRitmo(segundosPor100m)
}

function transformarSplits(splitsMetric, disciplina) {
  if (!Array.isArray(splitsMetric)) return []
  return splitsMetric.map((s) => ({
    km: s.split,
    elapsed_time_s: s.elapsed_time ?? null,
    moving_time_s: s.moving_time ?? null,
    distancia_m: s.distance != null ? round(s.distance, 0) : null,
    ritmo_min_km: disciplina === 'swim' ? null : ritmoDesdeTiempos(s.moving_time, s.distance),
    ritmo_min_100m: disciplina === 'swim' ? ritmo100DesdeTiempos(s.moving_time, s.distance) : null,
    fc_media: s.average_heartrate != null ? round(s.average_heartrate, 0) : null,
    velocidad_ms: s.average_speed ?? null,
    desnivel_m: s.elevation_difference != null ? round(s.elevation_difference, 0) : null,
  }))
}

function transformarVueltas(laps, disciplina) {
  if (!Array.isArray(laps)) return []
  return laps.map((lap) => ({
    indice: lap.lap_index,
    nombre: lap.name || `Vuelta ${lap.lap_index}`,
    distancia_km: lap.distance != null ? round(lap.distance / 1000, 2) : null,
    distancia_m: lap.distance != null ? round(lap.distance, 0) : null,
    elapsed_time_s: lap.elapsed_time ?? null,
    moving_time_s: lap.moving_time ?? null,
    ritmo_min_km: disciplina === 'swim' ? null : ritmoDesdeTiempos(lap.moving_time, lap.distance),
    ritmo_min_100m: disciplina === 'swim' ? ritmo100DesdeTiempos(lap.moving_time, lap.distance) : null,
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

  const splits = transformarSplits(act.splits_metric, disciplina)
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
    ritmo_min_100m: disciplina === 'swim' ? ritmo100DesdeTiempos(act.moving_time, act.distance) : null,
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
  const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID
  const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
  if (!SUPABASE_URL || !SERVICE_KEY || !STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return respuesta(500, { error: 'Server misconfigured' })
  }
  const supabaseHost = SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')

  // 2. Verificar JWT (la identidad nunca viene del body)
  const auth = await verifyAuth(event)
  if (!auth) return respuesta(401, { error: 'Unauthorized' })

  // 3. Parse + validación de input
  let parsed
  try {
    parsed = JSON.parse(event.body || '{}')
  } catch {
    return respuesta(400, { error: 'JSON inválido' })
  }
  const { activityId, athleteId } = parsed
  if (!ACTIVITY_ID_REGEX.test(String(activityId || ''))) {
    return respuesta(400, { error: 'activityId debe ser un id numérico de Strava' })
  }
  if (!UUID_REGEX.test(athleteId || '')) {
    return respuesta(400, { error: 'athleteId debe ser un UUID válido' })
  }

  try {
    // 4. Autorización: el propio atleta o un coach con relación en coach_athletes
    const permitido = await canAccessAthlete(auth, athleteId)
    if (!permitido) {
      return respuesta(403, { error: 'No autorizado para este atleta' })
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

    // 6. Access token válido (refresca+persiste si expira). Vista de 1 atleta:
    // si el refresh falla, 502.
    const env = { supabaseHost, SERVICE_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET }
    const accessToken = await getStravaAccessToken(perfil, env)
    if (!accessToken) {
      return respuesta(502, { error: 'No se pudo refrescar el token de Strava' })
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
    const disciplina = mapDisciplina(actRes.json.sport_type || actRes.json.type)
    return respuesta(200, {
      actividad: transformarActividad(actRes.json, fcMax),
      vueltas: transformarVueltas(laps, disciplina),
    })
  } catch (err) {
    console.error('coach-activity-detail error:', err.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
