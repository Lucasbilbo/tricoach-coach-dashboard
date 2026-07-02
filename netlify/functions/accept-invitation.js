// accept-invitation.js — Netlify Function (CommonJS)
// Registra a un atleta vía token de invitación.
// POST { token, email, password, nombre } — sin JWT (el usuario aún no existe);
// la seguridad está en el token + rate limit por IP.
//
// S5: el alta es atómica. GoTrue crea el usuario en auth.users; luego la RPC
// accept_invitation (migración 005) valida el token, lo marca usado y crea
// profile + coach_athletes en UNA transacción. Si la RPC no confirma (token ya
// usado por una request concurrente, o un insert falla), se compensa borrando
// el usuario Auth recién creado → nunca queda un usuario huérfano.

const https = require('https')
const { allowRequest, clientIp } = require('./lib/rate-limit')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Límite: 10 intentos cada 10 min por IP
const RL_MAX = 10
const RL_WINDOW_S = 600

function request({ path, method, body, extraHeaders }) {
  const hostname = new URL(SUPABASE_URL).hostname
  const bodyStr = body ? JSON.stringify(body) : null
  return new Promise((resolve) => {
    const options = {
      hostname,
      path,
      method,
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        ...(extraHeaders || {}),
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        let parsed
        try { parsed = data ? JSON.parse(data) : null } catch { parsed = null }
        resolve({ status: res.statusCode, body: parsed })
      })
    })
    req.on('error', () => resolve({ status: 500, body: null }))
    if (bodyStr) req.write(bodyStr)
    req.end()
  })
}

function rpc(fn, body) {
  return request({ path: `/rest/v1/rpc/${fn}`, method: 'POST', body })
}

function createAuthUser(email, password) {
  return request({
    path: '/auth/v1/admin/users',
    method: 'POST',
    body: { email, password, email_confirm: true },
  })
}

function deleteAuthUser(id) {
  return request({ path: `/auth/v1/admin/users/${id}`, method: 'DELETE' })
}

function json(statusCode, payload) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json(500, { error: 'Supabase no configurado' })
  }

  // Rate limit por IP (S5c)
  const permitido = await allowRequest('accept_invitation', clientIp(event), RL_MAX, RL_WINDOW_S)
  if (!permitido) {
    return json(429, { error: 'Demasiados intentos. Espera unos minutos.', code: 'RATE_LIMITED' })
  }

  let parsed
  try { parsed = JSON.parse(event.body || '{}') }
  catch { return json(400, { error: 'JSON inválido' }) }

  const { token, email, password, nombre } = parsed
  if (!token || !email || !password || !nombre) {
    return json(400, { error: 'token, email, password y nombre son requeridos' })
  }
  if (!EMAIL_REGEX.test(email)) {
    return json(400, { error: 'Email no válido', code: 'INVALID_EMAIL' })
  }
  if (typeof password !== 'string' || password.length < 6) {
    return json(400, { error: 'La contraseña debe tener al menos 6 caracteres', code: 'WEAK_PASSWORD' })
  }

  // Pre-validación (feedback temprano sin crear el usuario). La RPC revalida de
  // forma atómica igualmente.
  const preRes = await rpc('verify_invitation_token', { p_token: token })
  const pre = Array.isArray(preRes.body) ? preRes.body[0] : preRes.body
  if (!pre?.valid) {
    return json(404, { error: 'Token de invitación inválido o ya usado', code: 'INVALID_TOKEN' })
  }
  if (pre.invitation_email && pre.invitation_email.toLowerCase() !== email.toLowerCase()) {
    return json(400, { error: 'El email no coincide con la invitación', code: 'EMAIL_MISMATCH' })
  }

  // Crear el usuario en Auth (GoTrue)
  const authResult = await createAuthUser(email, password)
  if (authResult.status !== 200 || !authResult.body?.id) {
    // 422 de GoTrue típicamente = email ya registrado
    const codigo = authResult.body?.error_code || authResult.body?.msg || ''
    console.error('accept-invitation: createAuthUser fallo', authResult.status, codigo)
    if (authResult.status === 422) {
      return json(409, { error: 'Ya existe una cuenta con ese email', code: 'EMAIL_TAKEN' })
    }
    return json(400, { error: 'No se pudo crear la cuenta', code: 'AUTH_CREATE_FAILED' })
  }
  const athleteId = authResult.body.id

  // Alta atómica: token + profile + coach_athletes en una transacción
  const acceptRes = await rpc('accept_invitation', {
    p_token: token,
    p_athlete_id: athleteId,
    p_email: email,
    p_nombre: nombre,
  })
  const accept = Array.isArray(acceptRes.body) ? acceptRes.body[0] : acceptRes.body

  if (!accept?.ok) {
    // Compensación: sin registro válido, borrar el usuario Auth recién creado
    await deleteAuthUser(athleteId)
    const code = accept?.error_code
    if (acceptRes.status >= 200 && acceptRes.status < 300 && code === 'EMAIL_MISMATCH') {
      return json(400, { error: 'El email no coincide con la invitación', code: 'EMAIL_MISMATCH' })
    }
    if (acceptRes.status >= 200 && acceptRes.status < 300 && code === 'INVALID_TOKEN') {
      return json(409, { error: 'Token de invitación inválido o ya usado', code: 'INVALID_TOKEN' })
    }
    // Excepción SQL (insert falló) u otro error: genérico
    console.error('accept-invitation: accept_invitation no confirmó', acceptRes.status, JSON.stringify(acceptRes.body))
    return json(500, { error: 'No se pudo completar el registro', code: 'ACCEPT_FAILED' })
  }

  return json(200, { ok: true, athleteId })
}
