// Carga la disponibilidad de un atleta (lectura; el coach la ve por RLS).
// Si falla, devuelve datos vacíos: los avisos son informativos y nunca deben
// romper la pantalla del coach.
//
// Caché en memoria por atleta (5 min, se revalida siempre al montar): así el
// creador de entrenos, que se abre DESPUÉS de la agenda, tiene los datos desde
// el primer render y no pinta todas las disciplinas para luego quitar unas.
import { useEffect, useState } from 'react'
import { cargarDisponibilidad } from '../lib/disponibilidadApi'
import { registrarCache } from '../lib/clientCache'

const VACIO = { plantilla: [], excepciones: [] }
const TTL_MS = 5 * 60 * 1000
const cache = new Map() // athleteId -> { datos, at }
registrarCache(() => cache.clear())

function enCache(athleteId) {
  const c = cache.get(athleteId)
  return c && Date.now() - c.at < TTL_MS ? c.datos : null
}

// { datos, cargada }: `cargada` = ya hay datos de este atleta (de la caché o de
// la red), aunque estén vacíos. Mientras es false, `datos` está vacío.
export function useDisponibilidadConEstado(athleteId, activo = true) {
  const [estado, setEstado] = useState(() => {
    const d = athleteId ? enCache(athleteId) : null
    return { athleteId: d ? athleteId : null, datos: d || VACIO }
  })
  useEffect(() => {
    if (!athleteId || !activo) return undefined
    let vivo = true
    cargarDisponibilidad(athleteId)
      .then((datos) => {
        cache.set(athleteId, { datos, at: Date.now() })
        if (vivo) setEstado({ athleteId, datos })
      })
      .catch(() => vivo && setEstado((e) => (e.athleteId === athleteId ? e : { athleteId, datos: VACIO })))
    return () => { vivo = false }
  }, [athleteId, activo])
  if (estado.athleteId === athleteId) return { datos: estado.datos, cargada: true }
  const d = athleteId ? enCache(athleteId) : null
  return d ? { datos: d, cargada: true } : { datos: VACIO, cargada: false }
}

export function useDisponibilidad(athleteId, activo = true) {
  return useDisponibilidadConEstado(athleteId, activo).datos
}
