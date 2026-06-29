// verify-intervals-key.js — Netlify Function (CommonJS)
// Verifica un API key de Intervals.icu y devuelve el athlete ID.
// POST { apiKey } — sin autenticación (llamado desde el onboarding del atleta)

const https = require('https')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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
    req.on('error', (e) => resolve({ status: 500, body: { error: e.message } }))
    req.end()
  })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' }

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
