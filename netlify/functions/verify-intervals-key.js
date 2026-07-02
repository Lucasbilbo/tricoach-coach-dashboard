// verify-intervals-key.js — Netlify Function (CommonJS)
// Valida un API key de Intervals.icu y devuelve el athlete ID.
// POST { apiKey } + header Authorization: Bearer <jwt de Supabase>
//
// S6: antes era un proxy abierto (cualquiera podía probar API keys de
// Intervals.icu contra la API real usando esta infraestructura). Ahora exige
// JWT válido y aplica rate limit por uid. La key solo se usa para resolver la
// identidad de ESA key (Intervals devuelve el atleta dueño de la key); no
// permite verificar keys "para" otro usuario.

const https = require('https')
const { verifyAuth } = require('./lib/auth')
const { allowRequest } = require('./lib/rate-limit')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Límite: 15 verificaciones cada 10 min por usuario (el flujo legítimo son unas
// pocas pulsaciones de "Verificar").
const RL_MAX = 15
const RL_WINDOW_S = 600

function intervalsGet(apiKey) {
  const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64')
  return new Promise((resolve) => {
    const options = {
      hostname: 'intervals.icu',
      path: '/api/v1/athlete/0',
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
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
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

  // Exigir sesión válida (S6)
  const auth = await verifyAuth(event)
  if (!auth) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ ok: false, error: 'Unauthorized' }) }
  }

  // Rate limit por uid autenticado
  const permitido = await allowRequest('verify_intervals', auth.uid, RL_MAX, RL_WINDOW_S)
  if (!permitido) {
    return {
      statusCode: 429,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'Demasiados intentos. Espera unos minutos.', code: 'RATE_LIMITED' }),
    }
  }

  let parsed
  try { parsed = JSON.parse(event.body || '{}') }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ ok: false, error: 'JSON inválido' }) } }

  const { apiKey } = parsed
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ ok: false, error: 'apiKey requerido' }),
    }
  }

  const result = await intervalsGet(apiKey.trim())

  if (result.status === 200 && result.body && result.body.id) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, athleteId: result.body.id, nombre: result.body.name }),
    }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error: 'API key inválido' }),
  }
}
