// Duración de una sesión en las listas: la real ("75 min") o, si va por
// distancia, la estimada con los ritmos ("~80 min", con title que lo explica).
import { FONTS } from '../lib/theme'
import { duracionPrevista } from '../lib/tssPrevisto'

export default function DuracionSesion({ sesion }) {
  const dp = duracionPrevista(sesion)
  if (!dp) return null
  return (
    <span style={{ fontFamily: FONTS.mono }} title={dp.estimada ? 'Estimada con los ritmos de cada paso' : undefined}>
      {dp.estimada ? '~' : ''}{dp.min} min
    </span>
  )
}
