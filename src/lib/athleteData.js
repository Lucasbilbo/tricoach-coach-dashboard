// Cliente único de coach-athlete-data con caché (ver athleteDataCache.js).
// Todos los componentes piden los datos del atleta por aquí, no con fetch directo.
import { authHeaders } from './authHeaders'
import { createAthleteDataCache } from './athleteDataCache'
import { registrarCache } from './clientCache'
import { invalidarDashboard } from './panelData'
import { invalidarPlanCarga } from './planCarga'

// Atletas para los que el usuario pidió "Actualizar": las peticiones de los
// próximos segundos llevan force:true y el backend resincroniza con Strava
// (también limpia actividades borradas allí). Caduca sola.
const FORZAR_MS = 15000
const forzados = new Map() // athleteId → hasta (ms)

async function request(athleteId, weeks, records) {
  const force = (forzados.get(athleteId) || 0) > Date.now()
  const res = await fetch('/.netlify/functions/coach-athlete-data', {
    method: 'POST',
    headers: await authHeaders(),
    // records:false y force solo se envían cuando hacen falta
    body: JSON.stringify({ athleteId, weeks, ...(records ? {} : { records: false }), ...(force ? { force: true } : {}) }),
  })
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

const cache = createAthleteDataCache({ request })
registrarCache(cache.clear)

// { ok, status, json } — json puede ser null si el cuerpo no era JSON.
// Los objetos devueltos se comparten entre consumidores: no mutarlos.
export const pedirDatosAtleta = cache.get
// Cambiar sesiones del atleta también cambia sus km de 7 días en el dashboard
// y su carga planificada
export function invalidarDatosAtleta(athleteId) {
  cache.invalidate(athleteId)
  invalidarDashboard()
  invalidarPlanCarga(athleteId)
}

// Botón "Actualizar": olvida lo cacheado y pide al backend datos recién traídos de Strava
export function forzarDatosAtleta(athleteId) {
  forzados.set(athleteId, Date.now() + FORZAR_MS)
  invalidarDatosAtleta(athleteId)
}
