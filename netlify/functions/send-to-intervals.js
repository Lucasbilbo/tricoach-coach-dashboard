// send-to-intervals.js — Netlify Function (CommonJS)
// Envía un workout estructurado de coach_sessions a Intervals.icu (→ Garmin)
// POST { sessionId } + header Authorization: Bearer <jwt de Supabase>
// Autorización: el coach dueño de la sesión (session.coach_id) o el atleta
// destinatario (session.athlete_id). coach/atleta se derivan de la sesión y
// del JWT, nunca del body.

const https = require('https')
const { verifyAuth } = require('./lib/auth')
const { buildIntervalsText } = require('./lib/intervals-text.cjs')

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // x-coach-secret solo para que el preflight de bundles antiguos no falle por CORS
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-coach-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DISCIPLINE_TYPE = {
  swim: 'Swim',
  bike: 'Ride',
  run: 'Run',
  strength: 'WeightTraining',
  other: 'Workout',
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

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

function supabasePatch(path, body) {
  const hostname = new URL(SUPABASE_URL).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const options = {
      hostname,
      path: `/rest/v1/${path}`,
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Prefer: 'return=representation',
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(data) } catch { parsed = null }
        resolve({ status: res.statusCode, body: parsed })
      })
    })
    req.on('error', () => resolve({ status: 0, body: null }))
    req.write(bodyStr)
    req.end()
  })
}

// Persiste el resultado del envío en coach_sessions con reintentos + backoff.
// Devuelve true si algún intento confirma (2xx). La mayoría de fallos del PATCH
// son transitorios; reintentar evita el caso en que el evento ya está en
// Intervals pero la sesión queda marcada como no-enviada (F4c).
async function patchConReintentos(sessionId, payload, intentos = 3) {
  let espera = 300
  for (let i = 0; i < intentos; i++) {
    const res = await supabasePatch(`coach_sessions?id=eq.${sessionId}`, payload)
    if (res.status >= 200 && res.status < 300) return true
    if (i < intentos - 1) {
      await sleep(espera)
      espera *= 2
    }
  }
  return false
}

// ── Intervals.icu helpers ────────────────────────────────────────────────────
// El texto del entrenamiento se genera con el módulo compartido
// (lib/intervals-text). El envío usa incluirNotas:false SIEMPRE: las notas del
// entrenador no llegan al reloj (congelan el Garmin).

function intervalsPost(athleteId, apiKey, body) {
  const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64')
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const options = {
      hostname: 'intervals.icu',
      path: `/api/v1/athlete/${athleteId}/events`,
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: null }) }
      })
    })
    req.on('error', (e) => resolve({ status: 500, body: { error: e.message } }))
    req.write(bodyStr)
    req.end()
  })
}

// Borra un evento en Intervals. Se usa para el reenvío idempotente (borra el
// evento previo antes de recrear) y para la compensación si el PATCH final no
// se puede confirmar. Best-effort: un 404 (ya no existe) no es un fallo.
function intervalsDelete(athleteId, apiKey, eventId) {
  const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64')
  return new Promise((resolve) => {
    const options = {
      hostname: 'intervals.icu',
      path: `/api/v1/athlete/${athleteId}/events/${eventId}`,
      method: 'DELETE',
      headers: { Authorization: authHeader },
    }
    const req = https.request(options, (res) => {
      res.on('data', () => {})
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    req.on('error', () => resolve({ status: 0 }))
    req.end()
  })
}

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase no configurado' }) }
    }

    // Verificar JWT (la identidad nunca viene del body)
    const auth = await verifyAuth(event)
    if (!auth) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    let parsed
    try { parsed = JSON.parse(event.body || '{}') }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) } }

    const { sessionId } = parsed
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'sessionId (UUID) es requerido' }) }
    }

    // Leer sesión completa: coach y atleta se derivan de ella, no del body
    const sesiones = await supabaseGet(`coach_sessions?id=eq.${sessionId}&select=*`)
    if (!Array.isArray(sesiones) || sesiones.length === 0) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Sesión no encontrada' }) }
    }
    const session = sesiones[0]

    // Autorización: el coach dueño de la sesión o el atleta destinatario
    if (auth.uid !== session.coach_id && auth.uid !== session.athlete_id) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'No autorizado para esta sesión' }) }
    }

    // Leer perfil del atleta destinatario
    const perfiles = await supabaseGet(
      `profiles?id=eq.${session.athlete_id}&select=intervals_api_key,intervals_athlete_id`
    )
    if (!Array.isArray(perfiles) || perfiles.length === 0) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Atleta no encontrado' }) }
    }
    const { intervals_api_key, intervals_athlete_id } = perfiles[0]
    if (!intervals_api_key || !intervals_athlete_id) {
      // code estructurado para que el frontend no dependa del texto (F6)
      return {
        statusCode: 400,
        headers: CORS,
        body: JSON.stringify({ error: 'El atleta no tiene Intervals.icu configurado', code: 'NO_INTERVALS' }),
      }
    }

    const tipoIntervals = DISCIPLINE_TYPE[session.disciplina] || 'Workout'
    // incluirNotas:false SIEMPRE — las notas del entrenador no llegan al reloj
    const description = buildIntervalsText(session, { incluirNotas: false })
    const piscina = session.workout_steps?.piscina || '25'
    const isSwim = session.disciplina === 'swim'
    const isOpen = piscina === 'open'

    const eventBody = {
      category: 'WORKOUT',
      start_date_local: session.fecha + 'T00:00:00',
      type: tipoIntervals,
      name: session.workout_steps?.nombre || session.descripcion?.substring(0, 60) || 'Entrenamiento',
      description,
      indoor: isSwim && !isOpen,
    }
    if (isSwim && !isOpen) {
      eventBody.pool_length = piscina === '50' ? 50 : 25
      eventBody.pool_length_unit = 'Meters'
    }

    // Reenvío idempotente: si ya se había enviado, borrar el evento anterior en
    // Intervals antes de crear el nuevo para no duplicar el workout en el reloj.
    if (session.intervals_event_id) {
      await intervalsDelete(intervals_athlete_id, intervals_api_key, session.intervals_event_id)
    }

    const result = await intervalsPost(intervals_athlete_id, intervals_api_key, eventBody)

    if (result.status < 200 || result.status >= 300) {
      // El detalle de Intervals se loguea server-side; al cliente solo genérico
      console.error('send-to-intervals: error de Intervals', result.status, JSON.stringify(result.body))
      return {
        statusCode: 502,
        headers: CORS,
        body: JSON.stringify({ error: 'No se pudo enviar el entrenamiento a Intervals.icu', code: 'INTERVALS_ERROR' }),
      }
    }

    const intervals_event_id = result.body?.id ? String(result.body.id) : null

    // Persistir con reintentos. Si NO se puede confirmar en BD, deshacer el
    // evento recién creado (compensación) para no dejar un workout huérfano en
    // el reloj que el usuario reenviaría y duplicaría (F4c).
    const persistido = await patchConReintentos(sessionId, {
      intervals_event_id,
      enviado_a_garmin: true,
      garmin_enviado_at: new Date().toISOString(),
    })

    if (!persistido) {
      if (intervals_event_id) {
        await intervalsDelete(intervals_athlete_id, intervals_api_key, intervals_event_id)
      }
      console.error(`send-to-intervals: PATCH no confirmado para sesión ${sessionId}; evento revertido`)
      return {
        statusCode: 502,
        headers: CORS,
        body: JSON.stringify({
          error: 'El entrenamiento se envió pero no se pudo confirmar. Se ha revertido; inténtalo de nuevo.',
          code: 'PERSIST_FAILED',
        }),
      }
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, intervals_event_id }),
    }
  } catch (err) {
    // Detalle completo solo en el log del servidor; al cliente, mensaje genérico
    console.error('ERROR GLOBAL send-to-intervals:', err)
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Error interno', code: 'INTERNAL_ERROR' }),
    }
  }
}
