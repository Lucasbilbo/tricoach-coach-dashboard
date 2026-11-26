// strava-webhook.js — Netlify Function (CommonJS). Receptor de eventos de Strava.
//
// INERTE hasta que se configure: sin STRAVA_WEBHOOK_VERIFY_TOKEN no valida
// ninguna suscripción, y sin STRAVA_WEBHOOK_ACTIVO=1 el panel sigue con la
// frescura de 5 min de siempre (los eventos que lleguen no hacen daño).
// Pasos para activarlo: ver docs/rendimiento.md («Webhook de Strava»).
//
// GET  → validación de la suscripción (hub.challenge).
// POST → evento de actividad: se busca qué atleta es (owner_id = id de Strava,
//        sale de sus actividades guardadas) y se envejece su strava_sync.
// Siempre responde 200 a los POST (Strava reintenta y acaba desactivando la
// suscripción si fallan); los errores solo se registran.

const { supabaseGet, supabasePatch } = require('./lib/supabase-rest')
const { withTimeout } = require('./lib/http')
const { responderValidacion, interpretarEvento } = require('./lib/strava-webhook')

const JSON_H = { 'Content-Type': 'application/json' }

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const r = responderValidacion(event.queryStringParameters, process.env.STRAVA_WEBHOOK_VERIFY_TOKEN)
    return { ...r, headers: JSON_H }
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: JSON_H, body: '' }

  const ok = { statusCode: 200, headers: JSON_H, body: '{}' }
  const SUPABASE_URL = process.env.SUPABASE_URL
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_KEY || !process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) return ok

  let evento
  try {
    evento = JSON.parse(event.body || '{}')
  } catch {
    return ok
  }
  const accion = interpretarEvento(evento, { subscriptionId: process.env.STRAVA_WEBHOOK_SUBSCRIPTION_ID || null })
  if (!accion) return ok

  const host = new URL(SUPABASE_URL).hostname
  try {
    await withTimeout(
      (async () => {
        const q = `datos->athlete->>id=eq.${accion.ownerId}&select=athlete_id&limit=1`
        const res = await supabaseGet(host, `/rest/v1/strava_actividades?${q}`, SERVICE_KEY)
        const athleteId = Array.isArray(res.json) && res.json[0] ? res.json[0].athlete_id : null
        if (!athleteId) return // atleta sin copia todavía: su primera lectura irá a Strava igual
        // Solo hacia atrás: si la sync ya era más vieja que la marca, no se toca
        const marca = encodeURIComponent(accion.marcaIso)
        await supabasePatch(
          host,
          `/rest/v1/strava_sync?athlete_id=eq.${athleteId}&sincronizado_at=gt.${marca}`,
          SERVICE_KEY,
          { sincronizado_at: accion.marcaIso }
        )
      })(),
      1500
    )
  } catch (err) {
    console.error('strava-webhook:', err.message)
  }
  return ok
}
