// Cliente único de coach-athlete-data con caché (ver athleteDataCache.js).
// Todos los componentes piden los datos del atleta por aquí, no con fetch directo.
import { authHeaders } from './authHeaders'
import { createAthleteDataCache } from './athleteDataCache'

async function request(athleteId, weeks, records) {
  const res = await fetch('/.netlify/functions/coach-athlete-data', {
    method: 'POST',
    headers: await authHeaders(),
    // records:false solo se envía cuando hace falta (mismo body que antes)
    body: JSON.stringify(records ? { athleteId, weeks } : { athleteId, weeks, records: false }),
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

const cache = createAthleteDataCache({ request })

// { ok, status, json } — json puede ser null si el cuerpo no era JSON.
// Los objetos devueltos se comparten entre consumidores: no mutarlos.
export const pedirDatosAtleta = cache.get
export const invalidarDatosAtleta = cache.invalidate
export const limpiarDatosAtleta = cache.clear
