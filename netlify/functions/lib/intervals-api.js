// lib/intervals-api.js — llamadas a la API de eventos de Intervals.icu (CommonJS).
// Compartido por send-to-intervals (crear/reemplazar) y delete-session (borrar).
// Resuelven siempre { status, body }; nunca rechazan.

const https = require('https')

function authHeader(apiKey) {
  return 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64')
}

function intervalsPost(athleteId, apiKey, body) {
  const bodyStr = JSON.stringify(body)
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'intervals.icu',
        path: `/api/v1/athlete/${athleteId}/events`,
        method: 'POST',
        headers: {
          Authorization: authHeader(apiKey),
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
          catch { resolve({ status: res.statusCode, body: null }) }
        })
      }
    )
    req.on('error', (e) => resolve({ status: 500, body: { error: e.message } }))
    req.write(bodyStr)
    req.end()
  })
}

// Borra un evento. Un 404 (ya no existe) cuenta como borrado: ver eventoBorrado().
function intervalsDelete(athleteId, apiKey, eventId) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'intervals.icu',
        path: `/api/v1/athlete/${athleteId}/events/${encodeURIComponent(eventId)}`,
        method: 'DELETE',
        headers: { Authorization: authHeader(apiKey) },
      },
      (res) => {
        res.on('data', () => {})
        res.on('end', () => resolve({ status: res.statusCode }))
      }
    )
    req.on('error', () => resolve({ status: 0 }))
    req.end()
  })
}

function eventoBorrado(res) {
  return !!res && ((res.status >= 200 && res.status < 300) || res.status === 404)
}

module.exports = { intervalsPost, intervalsDelete, eventoBorrado }
