import { authHeaders } from './authHeaders'

// ¿Tiene el usuario Strava / Intervals conectados? Solo booleanos: los tokens
// nunca llegan al navegador. Ante error devuelve null (estado desconocido).
export async function misConexiones() {
  try {
    const res = await fetch('/.netlify/functions/my-connections', {
      method: 'POST',
      headers: await authHeaders(),
    })
    if (!res.ok) return null
    const json = await res.json()
    return { strava: !!json.strava, intervals: !!json.intervals }
  } catch {
    return null
  }
}
