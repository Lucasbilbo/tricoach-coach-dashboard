// lib/strava-webhook.js — lógica pura del webhook de Strava (CommonJS).
//
// Strava avisa (POST) de cada actividad creada, editada o borrada. No mandamos
// a buscarla aquí (Strava exige responder en < 2 s y haría falta refrescar el
// token): solo se ENVEJECE la sincronización de ese atleta en `strava_sync`,
// para que la próxima lectura del panel pida a Strava lo nuevo. Sin evento, la
// copia en Supabase se da por buena (ver frescoSegunEntorno).
//
// Los eventos no van firmados: lo peor que puede hacer uno falso es forzar una
// resincronización. Aun así, si hay STRAVA_WEBHOOK_SUBSCRIPTION_ID se exige.

const { FRESCO_WEBHOOK_MS } = require('./actividades-store')

// GET de validación al crear la suscripción: { statusCode, body }
function responderValidacion(query, verifyToken) {
  const q = query || {}
  if (!verifyToken || q['hub.mode'] !== 'subscribe' || q['hub.verify_token'] !== verifyToken) {
    return { statusCode: 403, body: JSON.stringify({ error: 'verify_token' }) }
  }
  const challenge = String(q['hub.challenge'] || '')
  if (!challenge || challenge.length > 200) return { statusCode: 400, body: JSON.stringify({ error: 'challenge' }) }
  return { statusCode: 200, body: JSON.stringify({ 'hub.challenge': challenge }) }
}

// Evento → { ownerId, marcaIso } si hay que envejecer la sync, o null.
function interpretarEvento(evento, { subscriptionId = null } = {}) {
  if (!evento || typeof evento !== 'object') return null
  if (subscriptionId && String(evento.subscription_id) !== String(subscriptionId)) return null
  if (evento.object_type !== 'activity') return null
  if (!['create', 'update', 'delete'].includes(evento.aspect_type)) return null
  const ownerId = Number(evento.owner_id)
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return null
  const t = Number(evento.event_time)
  const eventoMs = Number.isFinite(t) && t > 0 ? t * 1000 : Date.now()
  // Más vieja que la ventana de frescura (con 1 min de margen): la siguiente
  // lectura pide a Strava desde (marca − 7 días), que cubre la actividad.
  return { ownerId, marcaIso: new Date(eventoMs - FRESCO_WEBHOOK_MS - 60 * 1000).toISOString() }
}

module.exports = { responderValidacion, interpretarEvento }
