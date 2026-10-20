// Datos del panel del coach con caché de 5 min (ver valueCache.js): ir de un
// atleta al dashboard y volver ya no repite coach-dashboard-data (llama a Strava
// por cada atleta) ni el resumen de temporadas.
import { authHeaders } from './authHeaders'
import { crearCacheValores } from './valueCache'
import { registrarCache } from './clientCache'
import { resumenTemporadas } from './seasonApi'

const cache = crearCacheValores({ ttl: 5 * 60 * 1000 })
registrarCache(cache.clear)

// Lanza Error (con el mensaje del backend) si falla; los fallos no se cachean.
export function datosDashboard({ force = false } = {}) {
  return cache.get(
    'dashboard',
    async () => {
      // El coach se deriva del JWT en el backend: no se manda coachId
      const res = await fetch('/.netlify/functions/coach-dashboard-data', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({}),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar los atletas')
      return Array.isArray(json) ? json : []
    },
    { force }
  )
}

export function resumenTemporadasCache({ force = false } = {}) {
  return cache.get('temporadas', resumenTemporadas, { force })
}

// Km de 7 días incluyen metros de técnica de coach_sessions
export const invalidarDashboard = () => cache.invalidate('dashboard')
export const invalidarTemporadas = () => cache.invalidate('temporadas')
