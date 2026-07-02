// lib/rate-limit.js — rate limiting best-effort vía RPC en Supabase (CommonJS).
// Netlify plan nf_team_dev no da rate limiting nativo de funciones; se apoya en
// la RPC check_rate_limit (migración 005). Fail-open: si el limiter falla
// (red/BD), se permite la petición y se loguea — el rate limit es defensa
// anti-abuso, no autenticación.

const https = require('https')

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ])
}

function rpcCall(body) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const hostname = new URL(SUPABASE_URL).hostname
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path: '/rest/v1/rpc/check_rate_limit',
        method: 'POST',
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try { resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }) }
          catch { resolve({ status: res.statusCode, json: null }) }
        })
      }
    )
    req.on('error', reject)
    req.write(bodyStr)
    req.end()
  })
}

// Devuelve true si la petición está permitida (dentro del límite), false si se
// excedió. Fail-open ante error del limiter.
async function allowRequest(bucket, subject, max, windowSeconds) {
  if (!subject) subject = 'unknown'
  try {
    const res = await withTimeout(
      rpcCall({ p_bucket: bucket, p_subject: subject, p_max: max, p_window_seconds: windowSeconds }),
      3000
    )
    if (res.status >= 200 && res.status < 300 && typeof res.json === 'boolean') {
      return res.json
    }
    console.error('rate-limit: respuesta inesperada', res.status, JSON.stringify(res.json))
    return true
  } catch (err) {
    console.error('rate-limit: fallo del limiter (fail-open):', err.message)
    return true
  }
}

// Extrae la IP del cliente de los headers de Netlify.
function clientIp(event) {
  const h = event.headers || {}
  return (
    h['x-nf-client-connection-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  )
}

module.exports = { allowRequest, clientIp }
