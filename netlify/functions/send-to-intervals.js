// send-to-intervals.js — Netlify Function (CommonJS)
// Envía un workout estructurado de coach_sessions a Intervals.icu (→ Garmin)
// POST { sessionId, coachId, athleteId } + header x-coach-secret

const https = require('https')

const FUNCTION_SECRET = process.env.COACH_FUNCTION_SECRET
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, x-coach-secret',
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
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(null) } })
    })
    req.on('error', () => resolve(null))
    req.write(bodyStr)
    req.end()
  })
}

// ── Intervals.icu helpers ────────────────────────────────────────────────────

function unidadIntervals(unidad) {
  if (unidad === 'min') return 'm'
  return unidad || ''
}

function defaultZona(disciplina) {
  if (disciplina === 'swim') return ' Z1 Pace'
  if (disciplina === 'run') return ' Z1 HR'
  if (disciplina === 'bike') return ' Z1'
  return ''
}

function objetivoStr(step, disciplina) {
  const tipo = step.objetivo_tipo
  const valor = step.objetivo_valor
  if (!tipo || !valor) return ''
  if (tipo === 'zona') {
    if (disciplina === 'swim') return ` ${valor} Pace`
    if (disciplina === 'run') return ` ${valor} HR`
    return ` ${valor}`
  }
  if (tipo === 'fc') return ` ${valor}% HR`
  if (tipo === 'potencia') return ` ${valor}%`
  if (tipo === 'ritmo') {
    if (disciplina === 'swim') return ` ${valor}/100m Pace`
    if (disciplina === 'run') return ` ${valor}/km Pace`
  }
  return ''
}

function buildIntervalsDescription(session) {
  const { disciplina } = session
  const ws = session.workout_steps || {}
  const bloques = ws.bloques || []
  const material = ws.material || session.material || []
  const notas = ws.notas || session.notas || ''

  const partes = []

  if (Array.isArray(material) && material.length > 0) {
    partes.push('Material: ' + material.join(', '))
  }

  for (const bloque of bloques) {
    if (bloque.tipo === 'warmup') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push('Warmup ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj)
    } else if (bloque.tipo === 'cooldown') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push('Cooldown ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj)
    } else if (bloque.tipo === 'step') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push('- ' + bloque.cantidad + unidadIntervals(bloque.unidad) + obj)
    } else if (bloque.tipo === 'repeat') {
      const lines = [(bloque.nombre || 'Serie') + ' ' + bloque.repeticiones + 'x']
      for (const paso of (bloque.pasos || [])) {
        lines.push('- ' + paso.cantidad + unidadIntervals(paso.unidad) + objetivoStr(paso, disciplina))
      }
      partes.push(lines.join('\n'))
    }
  }

  if (notas) {
    partes.push('---\n' + notas)
  }

  return partes.join('\n\n')
}


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

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

    const secret = event.headers['x-coach-secret']
    if (!FUNCTION_SECRET || secret !== FUNCTION_SECRET) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) }
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase no configurado' }) }
    }

    let parsed
    try { parsed = JSON.parse(event.body || '{}') }
    catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) } }

    const { sessionId, coachId, athleteId } = parsed
    if (!sessionId || !coachId || !athleteId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'sessionId, coachId y athleteId son requeridos' }) }
    }
    if (!UUID_REGEX.test(sessionId) || !UUID_REGEX.test(coachId) || !UUID_REGEX.test(athleteId)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'IDs inválidos' }) }
    }

    // Verificar relación coach-atleta
    const relacion = await supabaseGet(
      `coach_athletes?coach_id=eq.${coachId}&athlete_id=eq.${athleteId}&select=id`
    )
    if (!Array.isArray(relacion) || relacion.length === 0) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'No autorizado para este atleta' }) }
    }

    // Leer perfil del atleta
    const perfiles = await supabaseGet(
      `profiles?id=eq.${athleteId}&select=intervals_api_key,intervals_athlete_id`
    )
    if (!Array.isArray(perfiles) || perfiles.length === 0) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Atleta no encontrado' }) }
    }
    const { intervals_api_key, intervals_athlete_id } = perfiles[0]
    if (!intervals_api_key || !intervals_athlete_id) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'El atleta no tiene Intervals.icu configurado' }) }
    }

    // Leer sesión completa
    const sesiones = await supabaseGet(
      `coach_sessions?id=eq.${sessionId}&coach_id=eq.${coachId}&select=*`
    )
    if (!Array.isArray(sesiones) || sesiones.length === 0) {
      return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Sesión no encontrada' }) }
    }
    const session = sesiones[0]

    console.log('session.workout_steps:', JSON.stringify(session.workout_steps))

    const tipoIntervals = DISCIPLINE_TYPE[session.disciplina] || 'Workout'
    const description = buildIntervalsDescription(session)

    console.log('DESCRIPTION COMPLETO:\n' + description)

    const result = await intervalsPost(intervals_athlete_id, intervals_api_key, {
      category: 'WORKOUT',
      start_date_local: session.fecha + 'T00:00:00',
      type: tipoIntervals,
      name: session.descripcion || 'Entrenamiento',
      description,
    })

    console.log('intervals result:', result.status, JSON.stringify(result.body))

    if (result.status < 200 || result.status >= 300) {
      return {
        statusCode: 502,
        headers: CORS,
        body: JSON.stringify({ error: 'Error enviando a Intervals.icu', details: result.body }),
      }
    }

    const intervals_event_id = result.body?.id ? String(result.body.id) : null

    await supabasePatch(`coach_sessions?id=eq.${sessionId}`, {
      intervals_event_id,
      enviado_a_garmin: true,
      garmin_enviado_at: new Date().toISOString(),
    })

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, intervals_event_id }),
    }
  } catch (err) {
    console.error('ERROR GLOBAL send-to-intervals:', err)
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: err.message, stack: err.stack }),
    }
  }
}
