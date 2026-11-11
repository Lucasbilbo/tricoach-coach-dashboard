// Cliente de set-fc-max: guarda la FC máxima de un atleta (el propio atleta o su
// coach) y olvida lo cacheado, porque TSS, zonas y CTL se recalculan con ella.
import { authHeaders } from './authHeaders'
import { invalidarDatosAtleta } from './athleteData'

// → { ok: true, fcMax } | { ok: false, error }
export async function guardarFcMax(athleteId, fcMax) {
  try {
    const res = await fetch('/.netlify/functions/set-fc-max', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ athleteId, fcMax }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || !json?.ok) return { ok: false, error: json?.error || 'No se pudo guardar la FC máxima' }
    invalidarDatosAtleta(athleteId)
    return { ok: true, fcMax: json.fc_maxima }
  } catch {
    return { ok: false, error: 'Error de conexión guardando la FC máxima' }
  }
}
