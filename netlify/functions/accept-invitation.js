// accept-invitation.js — Netlify Function (CommonJS)
// Registra a un atleta vía token de invitación: crea usuario, perfil y relación coach-atleta.
// POST { token, email, password, nombre }
// No requiere x-coach-secret: la seguridad está en el token de invitación.

const https = require('https')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function supabasePost(path, body, extraHeaders) {
  const hostname = new URL(SUPABASE_URL).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const options = {
      hostname,
      path: `/rest/v1/${path}`,
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        Prefer: 'return=representation',
        ...(extraHeaders || {}),
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
    req.on('error', () => resolve({ status: 500, body: null }))
    req.write(bodyStr)
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

// Crea usuario en Supabase Auth (Admin API) con email ya confirmado
function createAuthUser(email, password) {
  const hostname = new URL(SUPABASE_URL).hostname
  const bodyStr = JSON.stringify({ email, password, email_confirm: true })
  return new Promise((resolve) => {
    const options = {
      hostname,
      path: '/auth/v1/admin/users',
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
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
    req.on('error', () => resolve({ status: 500, body: null }))
    req.write(bodyStr)
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Supabase no configurado' }) }
  }

  let parsed
  try { parsed = JSON.parse(event.body || '{}') }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) } }

  const { token, email, password, nombre } = parsed
  if (!token || !email || !password || !nombre) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'token, email, password y nombre son requeridos' }) }
  }

  // Verificar token de invitación
  const invitaciones = await supabaseGet(
    `athlete_invitations?token=eq.${encodeURIComponent(token)}&used=eq.false&select=*`
  )
  if (!Array.isArray(invitaciones) || invitaciones.length === 0) {
    return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Token de invitación inválido o ya usado' }) }
  }
  const invitacion = invitaciones[0]

  // Verificar email si la invitación lo tenía
  if (invitacion.email && invitacion.email.toLowerCase() !== email.toLowerCase()) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'El email no coincide con la invitación' }) }
  }

  // Crear usuario en Auth (auto-confirmado)
  const authResult = await createAuthUser(email, password)
  if (authResult.status !== 200 || !authResult.body?.id) {
    const msg = authResult.body?.msg || authResult.body?.message || 'Error creando la cuenta'
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: msg }) }
  }
  const athleteId = authResult.body.id

  // Crear perfil
  await supabasePost('profiles', { id: athleteId, nombre, email })

  // Crear relación coach-atleta
  await supabasePost('coach_athletes', {
    coach_id: invitacion.coach_id,
    athlete_id: athleteId,
  })

  // Marcar invitación como usada
  await supabasePatch(`athlete_invitations?token=eq.${encodeURIComponent(token)}`, {
    used: true,
    athlete_id: athleteId,
    used_at: new Date().toISOString(),
  })

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, athleteId }),
  }
}
