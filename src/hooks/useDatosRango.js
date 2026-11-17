import { useEffect, useState } from 'react'
import { pedirDatosAtleta } from '../lib/athleteData'

// Datos del análisis cuando el periodo es una semana o un rango de fechas (no un
// preset de "últimas N semanas", que sigue el flujo de siempre de cada pantalla).
// Pide el tramo al backend (que calcula marcas y semanas solo de él) por la caché
// común, así que volver a un tramo ya visto no repite la petición.
//
// `refresco` cambia cuando el usuario pulsa "Actualizar" o guarda su FC máxima:
// vuelve a pedir y mientras tanto `cargando` es true.
export function useDatosRango(athleteId, periodo, refresco = 0) {
  const activo = !!athleteId && !!periodo && periodo.tipo !== 'semanas'
  const clave = activo ? `${athleteId}|${periodo.desde}|${periodo.hasta}|${refresco}` : null
  const [estado, setEstado] = useState(null) // { clave, json } | { clave, error }

  useEffect(() => {
    if (!clave) return
    let vivo = true
    async function cargar() {
      try {
        const res = await pedirDatosAtleta(athleteId, 0, { rango: { desde: periodo.desde, hasta: periodo.hasta } })
        if (!vivo) return
        if (!res.ok || !res.json) {
          setEstado({ clave, error: res.json?.error || 'No se pudieron cargar los datos de ese periodo' })
          return
        }
        setEstado({ clave, json: res.json })
      } catch {
        if (vivo) setEstado({ clave, error: 'Error de conexión cargando los datos de ese periodo' })
      }
    }
    cargar()
    return () => { vivo = false }
  }, [clave, athleteId, periodo])

  // Una respuesta de otro periodo no se enseña mientras llega la buena
  const actual = estado?.clave === clave ? estado : null
  return {
    activo,
    cargando: activo && !actual,
    datos: actual?.json ?? null,
    error: actual?.error ?? '',
  }
}
