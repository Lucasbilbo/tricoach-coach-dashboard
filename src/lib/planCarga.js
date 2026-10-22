// Datos para la carga planificada de un atleta: sus sesiones prescritas (las
// últimas 26 semanas calibran; las futuras se proyectan) y su temporada (la
// prueba objetivo). Caché de 5 min por atleta (valueCache.js): se invalida con
// invalidarDatosAtleta al crear/editar/borrar/mover sesiones.
// Si algo falla, null: el gráfico sigue sin proyección.
import { supabase } from './supabase'
import { crearCacheValores } from './valueCache'
import { registrarCache } from './clientCache'
import { listarTemporada } from './seasonApi'
import { hoyMadrid, sumarDias } from './chartUtils'

const cache = crearCacheValores({ ttl: 5 * 60 * 1000 })
registrarCache(cache.clear)

const SEMANAS_CALIBRACION = 26

export function pedirPlanCarga(athleteId) {
  return cache.get(athleteId, async () => {
    const desde = sumarDias(hoyMadrid(), -SEMANAS_CALIBRACION * 7)
    const [sesionesRes, temporada] = await Promise.all([
      supabase
        .from('coach_sessions')
        .select('id, fecha, disciplina, duracion_min, workout_steps')
        .eq('athlete_id', athleteId)
        .gte('fecha', desde),
      listarTemporada(athleteId).catch(() => null),
    ])
    if (sesionesRes.error) throw sesionesRes.error
    return { sesiones: sesionesRes.data || [], eventos: temporada?.eventos || [] }
  })
}

export const invalidarPlanCarga = (athleteId) => cache.invalidate(athleteId)
