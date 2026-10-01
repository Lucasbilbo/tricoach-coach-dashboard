import { authHeaders } from './authHeaders'

// Cliente de la función `season`. Lanza Error con el mensaje del backend.
async function llamar(payload) {
  const res = await fetch('/.netlify/functions/season', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  })
  let json
  try {
    json = await res.json()
  } catch {
    json = null
  }
  if (!res.ok) throw new Error(json?.error || 'Error de conexión con la temporada')
  return json
}

export const listarTemporada = (athleteId) => llamar({ action: 'list', athleteId })
export const guardarEvento = (athleteId, evento, id) =>
  llamar({ action: 'upsert', athleteId, evento, ...(id ? { id } : {}) })
export const borrarEvento = (athleteId, id) => llamar({ action: 'delete', athleteId, id })
export const resumenTemporadas = () => llamar({ action: 'overview' })
