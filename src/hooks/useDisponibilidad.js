// Carga la disponibilidad de un atleta (lectura; el coach la ve por RLS).
// Si falla, devuelve datos vacíos: los avisos son informativos y nunca deben
// romper la pantalla del coach.
import { useEffect, useState } from 'react'
import { cargarDisponibilidad } from '../lib/disponibilidadApi'

const VACIO = { plantilla: [], excepciones: [] }

export function useDisponibilidad(athleteId, activo = true) {
  const [estado, setEstado] = useState({ athleteId: null, datos: VACIO })
  useEffect(() => {
    if (!athleteId || !activo) return undefined
    let vivo = true
    cargarDisponibilidad(athleteId)
      .then((datos) => vivo && setEstado({ athleteId, datos }))
      .catch(() => vivo && setEstado({ athleteId, datos: VACIO }))
    return () => { vivo = false }
  }, [athleteId, activo])
  return estado.athleteId === athleteId ? estado.datos : VACIO
}
