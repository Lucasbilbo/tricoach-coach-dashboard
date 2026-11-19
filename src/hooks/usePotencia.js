// Potenciómetro y FTP de un atleta (potenciaApi). `disponible` es false mientras
// carga o si la tabla no existe: entonces la bici sigue por pulso.
import { useCallback, useEffect, useState } from 'react'
import { cargarPotencia, guardarPotencia } from '../lib/potenciaApi'

export function usePotencia(athleteId, uid, activo = true) {
  const [estado, setEstado] = useState({ athleteId: null, potenciometro: false, ftp_w: null, ftp_fecha: null, disponible: false })

  useEffect(() => {
    let vivo = true
    if (athleteId && activo) cargarPotencia(athleteId).then((r) => vivo && setEstado({ athleteId, ...r }))
    return () => { vivo = false }
  }, [athleteId, activo])

  const propio = estado.athleteId === athleteId
  const potencia = propio ? estado : { potenciometro: false, ftp_w: null, ftp_fecha: null, disponible: false }

  const guardar = useCallback(async (campos) => {
    const r = await guardarPotencia(athleteId, uid, campos)
    setEstado({ athleteId, ...r })
    return r
  }, [athleteId, uid])

  return { ...potencia, guardar }
}
