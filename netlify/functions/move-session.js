// move-session.js — Netlify Function (CommonJS)
// Mueve una sesión prescrita de día y/o hora desde la agenda (coach o atleta).
// POST { sessionId, fecha: 'YYYY-MM-DD', hora_inicio_min: number|null }
//   + header Authorization: Bearer <jwt de Supabase>
//
// Por qué una función y no un UPDATE desde el cliente:
// - El atleta NO tiene permiso de escritura en coach_sessions (RLS). Aquí solo
//   se tocan fecha, hora_inicio_min y movida_* — nunca el contenido del entreno.
// - Si la sesión ya está en Intervals.icu (→ reloj), hay que moverla también
//   allí. Mismo orden seguro que send-to-intervals: primero se CREA el evento con
//   la fecha nueva, luego se confirma en BD y solo entonces se borra el viejo.
//   Si Intervals falla, no se mueve nada; si la BD no confirma, se deshace el
//   evento nuevo. Nunca queda el atleta sin entreno ni con dos versiones vivas
//   salvo que falle el último borrado (se informa con anterior_retirado:false).
//
// Autorización: el atleta destinatario o el coach con relación real
// (canCoachSession). Reglas de fecha/hora en lib/mover-reglas.cjs (lo pasado se
// pierde; hoy solo a una hora que no ha llegado).

const { verifyAuth, canCoachSession, UUID_REGEX } = require('./lib/auth')
const { withTimeout, httpsRequest } = require('./lib/http')
const { intervalsPost, intervalsDelete, eventoBorrado } = require('./lib/intervals-api')
const { construirEvento } = require('./lib/intervals-evento')
const { validarMovimiento, ahoraMadrid } = require('./lib/mover-reglas.cjs')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Sesión completa: el texto del reloj se genera con los mismos campos que en send-to-intervals
const CAMPOS_SESION = '*'

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function rest(method, path, payload) {
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const body = payload === undefined ? undefined : JSON.stringify(payload)
  return withTimeout(
    httpsRequest({
      hostname: new URL(process.env.SUPABASE_URL).hostname,
      path: `/rest/v1/${path}`,
      method,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
      ...(body ? { body } : {}),
    }),
    8000
  )
}

// Dependencias reales (en los tests se sustituyen por dobles).
const depsReales = {
  async leerSesion(id) {
    const r = await rest('GET', `coach_sessions?id=eq.${id}&select=${CAMPOS_SESION}`)
    return Array.isArray(r.json) ? r.json[0] || null : null
  },
  async leerPerfil(athleteId) {
    const r = await rest('GET', `profiles?id=eq.${athleteId}&select=intervals_api_key,intervals_athlete_id`)
    return Array.isArray(r.json) ? r.json[0] || null : null
  },
  // PATCH con reintentos; true solo si la BD confirma la fila.
  async guardar(id, cambios) {
    let espera = 300
    for (let i = 0; i < 3; i++) {
      try {
        const r = await rest('PATCH', `coach_sessions?id=eq.${id}`, cambios)
        if (r.status >= 200 && r.status < 300 && Array.isArray(r.json) && r.json.length === 1) return true
      } catch { /* reintento */ }
      if (i < 2) { await sleep(espera); espera *= 2 }
    }
    return false
  },
  puedeCoach: canCoachSession,
  intervalsPost,
  intervalsDelete,
  eventoBorrado,
}

const res = (status, body) => ({ status, body })

// Núcleo testeable: decide y ejecuta el movimiento.
async function moverSesion({ auth, body, ahora, deps, ahoraIso = new Date().toISOString() }) {
  const { sessionId, fecha } = body || {}
  const hora = body?.hora_inicio_min ?? null
  if (!UUID_REGEX.test(sessionId || '')) return res(400, { error: 'sessionId inválido' })

  const sesion = await deps.leerSesion(sessionId)
  if (!sesion) return res(404, { error: 'Sesión no encontrada' })

  const esAtleta = auth.uid === sesion.athlete_id
  if (!esAtleta && !(await deps.puedeCoach(auth, sesion))) {
    return res(403, { error: 'No autorizado para esta sesión' })
  }

  const v = validarMovimiento({
    origen: { fecha: sesion.fecha, hora: sesion.hora_inicio_min ?? null },
    destino: { fecha, hora },
    ahora,
  })
  if (!v.ok) return res(409, { error: v.error, code: v.code })

  const cambios = {
    fecha,
    hora_inicio_min: hora,
    movida_por: esAtleta ? 'atleta' : 'coach',
    movida_at: ahoraIso,
  }

  // No está en el reloj: basta con la BD.
  if (!sesion.intervals_event_id) {
    if (!(await deps.guardar(sessionId, cambios))) {
      return res(502, { error: 'No se pudo guardar el cambio. Inténtalo de nuevo.', code: 'PERSIST_FAILED' })
    }
    return res(200, { ok: true, sesion: { ...sesion, ...cambios }, reloj: 'sin_envio' })
  }

  // Está en Intervals: hay que moverla también allí (si no, el reloj seguiría
  // con la fecha vieja).
  const perfil = await deps.leerPerfil(sesion.athlete_id)
  if (!perfil?.intervals_api_key || !perfil?.intervals_athlete_id) {
    return res(409, { error: 'La sesión está en el reloj pero el atleta ya no tiene Intervals.icu conectado', code: 'NO_INTERVALS' })
  }
  const nueva = { ...sesion, ...cambios }
  const creado = await deps.intervalsPost(perfil.intervals_athlete_id, perfil.intervals_api_key, construirEvento(nueva))
  if (creado.status < 200 || creado.status >= 300) {
    console.error('move-session: error de Intervals', creado.status, JSON.stringify(creado.body))
    return res(502, { error: 'No se pudo mover el entreno en Intervals.icu; no se ha cambiado nada', code: 'INTERVALS_ERROR' })
  }
  const nuevoId = creado.body?.id ? String(creado.body.id) : null

  const persistido = await deps.guardar(sessionId, {
    ...cambios,
    intervals_event_id: nuevoId,
    enviado_a_garmin: true,
    garmin_enviado_at: ahoraIso,
  })
  if (!persistido) {
    if (nuevoId) await deps.intervalsDelete(perfil.intervals_athlete_id, perfil.intervals_api_key, nuevoId)
    console.error(`move-session: PATCH no confirmado para ${sessionId}; evento nuevo revertido`)
    return res(502, { error: 'No se pudo confirmar el cambio; no se ha movido nada. Inténtalo de nuevo.', code: 'PERSIST_FAILED' })
  }

  let anteriorRetirado = true
  if (sesion.intervals_event_id !== nuevoId) {
    const del = await deps.intervalsDelete(perfil.intervals_athlete_id, perfil.intervals_api_key, sesion.intervals_event_id)
    anteriorRetirado = deps.eventoBorrado(del)
    if (!anteriorRetirado) console.error(`move-session: no se pudo retirar el evento ${sesion.intervals_event_id} (status ${del.status})`)
  }

  return res(200, {
    ok: true,
    sesion: { ...nueva, intervals_event_id: nuevoId, enviado_a_garmin: true, garmin_enviado_at: ahoraIso },
    reloj: 'actualizado',
    anterior_retirado: anteriorRetirado,
  })
}

exports.moverSesion = moverSesion

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase no configurado' }) }
  }

  const auth = await verifyAuth(event)
  if (!auth) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }

  let body
  try { body = JSON.parse(event.body || '{}') }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) } }

  try {
    const r = await moverSesion({ auth, body, ahora: ahoraMadrid(), deps: depsReales })
    return { statusCode: r.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(r.body) }
  } catch (err) {
    console.error('ERROR GLOBAL move-session:', err)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Error interno', code: 'INTERNAL_ERROR' }) }
  }
}
