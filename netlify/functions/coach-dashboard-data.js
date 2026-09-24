// coach-dashboard-data.js — Netlify Function (CommonJS)
// POST + header Authorization: Bearer <jwt de Supabase>
// El coach se deriva del JWT verificado (nunca del body). Solo coaches.
// Devuelve métricas de los últimos 7 días por atleta del coach:
// [{ athlete_id, nombre, km_semana, horas_semana, tss_semana, ultima_actividad_dias }]

const { verifyAuth } = require('./lib/auth')
const { withTimeout, httpsRequest } = require('./lib/http')
const { supabaseGet } = require('./lib/supabase-rest')
const { getStravaAccessToken } = require('./lib/strava')
const { round, cargaActividad, fechaMadrid, mapDisciplina } = require('./lib/metrics')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // x-coach-secret se mantiene solo para que el preflight de bundles antiguos
  // en caché no falle con error de CORS (recibirán 401, no un fallo opaco)
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-coach-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FC_MAX_DEFAULT = 185
const DIA_MS = 86400000
const VENTANA_DIAS = 7
const SEMANAS_SPARKLINE = 4

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
    if (!a.start_date) return acc
    const disc = mapDisciplina(a.sport_type || a.type)
    if (disc === 'other') return acc // B1: excluir no-tri
    // Semana en Europe/Madrid a partir del instante UTC (no de start_date_local)
    const lunes = lunesDeSemana(fechaMadrid(new Date(a.start_date)))
    return { ...acc, [lunes]: (acc[lunes] || 0) + (cargaActividad(a.moving_time, a.average_heartrate, fcMax, disc).tss || 0) }
  }, {})

  return Object.keys(porLunes)
    .sort()
    .slice(-n)
    .map((lunes) => ({ semana: lunes, tss_total: round(porLunes[lunes], 0) }))
}

// El perfil se pasa ya cargado (todos los perfiles se traen en UNA query batch
// en el handler, en vez de una por atleta — evita el N+1 sobre profiles).
async function procesarAtleta(athleteId, perfil, env) {
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
    if (!perfil) return base

    const conNombre = { ...base, nombre: perfil.nombre || perfil.email || 'Atleta' }
    if (!perfil.strava_token || !perfil.strava_refresh_token) return conNombre

    const accessToken = await getStravaAccessToken(perfil, env)
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
      (a) => a.start_date && new Date(a.start_date).getTime() >= corteSemana &&
        mapDisciplina(a.sport_type || a.type) !== 'other' // B1: excluir no-tri del volumen
    )

    const totales = semana.reduce(
      (acc, a) => ({
        km: acc.km + (a.distance || 0) / 1000,
        horas: acc.horas + (a.moving_time || 0) / 3600,
        tss: acc.tss + (cargaActividad(a.moving_time, a.average_heartrate, fcMax, mapDisciplina(a.sport_type || a.type)).tss || 0),
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
  const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID
  const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET
  if (!SUPABASE_URL || !SERVICE_KEY || !STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return respuesta(500, { error: 'Server misconfigured' })
  }
  const supabaseHost = SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')

  // 2. Verificar JWT y derivar el coach del token (nunca del body)
  const auth = await verifyAuth(event)
  if (!auth) return respuesta(401, { error: 'Unauthorized' })
  if (!auth.isCoach) return respuesta(403, { error: 'Solo coaches' })
  const coachId = auth.uid

  try {
    // 3. Leer sus atletas
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

    // 4. Traer TODOS los perfiles en una sola query (filtro in) — evita el N+1
    const perfilesRes = await withTimeout(
      supabaseGet(
        supabaseHost,
        `/rest/v1/profiles?id=in.(${atletaIds.join(',')})&select=*`,
        SERVICE_KEY
      ),
      5000
    )
    const perfilPorId = new Map()
    if (Array.isArray(perfilesRes.json)) {
      for (const p of perfilesRes.json) perfilPorId.set(p.id, p)
    }

    // 5. Procesar atletas en paralelo (cada uno con su propio try/catch)
    const env = { supabaseHost, SERVICE_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET }
    const resultados = await Promise.all(
      atletaIds.map((id) => procesarAtleta(id, perfilPorId.get(id) || null, env))
    )

    return respuesta(200, resultados)
  } catch (err) {
    console.error('coach-dashboard-data error:', err.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
