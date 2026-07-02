// lib/http.js — helpers HTTP compartidos por las funciones que hablan con
// Strava y con la REST API de Supabase (CommonJS). Extraído de las 3 funciones
// coach-* que tenían copias idénticas (C2).

const https = require('https')

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ])
}

// Petición HTTPS con cuerpo opcional. Resuelve { status, json } (json = null si
// la respuesta no es JSON válido). Rechaza solo ante error de red.
function httpsRequest({ hostname, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method, headers }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null })
        } catch {
          resolve({ status: res.statusCode, json: null })
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

module.exports = { withTimeout, httpsRequest }
