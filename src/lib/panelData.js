// Datos del panel del coach con caché de 5 min (ver valueCache.js): ir de un
// atleta al dashboard y volver ya no repite coach-dashboard-data (llama a Strava
// por cada atleta) ni el resumen de temporadas.
import { authHeaders } from './authHeaders'
import { crearCacheValores } from './valueCache'
import { registrarCache } from './clientCache'
import { resumenTemporadas } from './seasonApi'

const cache = crearCacheValores({ ttl: 5 * 60 * 1000 })

// Copia PERSISTENTE (localStorage) de la última respuesta del dashboard, por
// uid: al entrar se pinta al instante y se actualiza en segundo plano
// (rendimiento 2026-11-25: coach-dashboard-data tarda segundos porque las
// functions están en Ohio y Supabase en Frankfurt). Caduca a los 7 días y se
// borra al cerrar sesión o cambiar de usuario (clientCache). localStorage
// puede fallar (modo privado, cuota): siempre en try/catch.
const PREFIJO_LS = 'getricoach:dashboard:'
const CADUCIDAD_LS = 7 * 24 * 3600 * 1000

export function dashboardGuardado(uid) {
  if (!uid) return null
  try {
    const raw = localStorage.getItem(PREFIJO_LS + uid)
    if (!raw) return null
    const { t, valor } = JSON.parse(raw)
    if (!Array.isArray(valor) || !(Date.now() - t < CADUCIDAD_LS)) return null
    return valor
  } catch {
    return null
  }
}

function guardarDashboard(uid, valor) {
  if (!uid) return
  try {
    localStorage.setItem(PREFIJO_LS + uid, JSON.stringify({ t: Date.now(), valor }))
  } catch {
    // sin persistencia: no pasa nada
  }
}

function borrarGuardados() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIJO_LS)) localStorage.removeItem(k)
    }
  } catch {
    // nada
  }
}

registrarCache(() => {
  cache.clear()
  borrarGuardados()
})

// Lanza Error (con el mensaje del backend) si falla; los fallos no se cachean.
// `uid` (opcional) guarda la respuesta buena en la copia persistente.
export function datosDashboard({ force = false, uid = null } = {}) {
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
      const valor = Array.isArray(json) ? json : []
      guardarDashboard(uid, valor)
      return valor
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
