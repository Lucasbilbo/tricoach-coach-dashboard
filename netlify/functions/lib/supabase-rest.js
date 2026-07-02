// lib/supabase-rest.js — acceso REST a Supabase con service key (CommonJS).
// Firma (host, path, key) → { status, json }, usada por las funciones coach-*.
// Extraído de sus copias idénticas (C2).
//
// Nota: send-to-intervals.js y strava-auth.js tienen una variante propia con
// firma distinta (path relativo derivado de SUPABASE_URL de entorno). No se
// migran en este lote: están endurecidas y probadas, y su unificación con esta
// firma sería más riesgo que valor.

const { httpsRequest } = require('./http')

function supabaseGet(host, path, key) {
  return httpsRequest({
    hostname: host,
    path,
    method: 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  })
}

function supabasePatch(host, path, key, payload) {
  const body = JSON.stringify(payload)
  return httpsRequest({
    hostname: host,
    path,
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      Prefer: 'return=representation',
    },
    body,
  })
}

module.exports = { supabaseGet, supabasePatch }
