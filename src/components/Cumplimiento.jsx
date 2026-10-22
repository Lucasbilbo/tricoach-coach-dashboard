// "62 de 75 min · 83 %" coloreado por banda (lib/cumplimiento.js). Ámbar para
// lo parcial, como el resto de avisos del panel; rojo para lo que queda lejos.
import { COLORS, DISCIPLINE_COLORS, FONTS } from '../lib/theme'
import { NIVEL, cumplimiento } from '../lib/cumplimiento'

const COLOR = { [NIVEL.ok]: COLORS.textSecondary, [NIVEL.parcial]: DISCIPLINE_COLORS.bike, [NIVEL.lejos]: COLORS.error }
const AYUDA = {
  [NIVEL.ok]: 'Dentro de lo prescrito (80–120 %)',
  [NIVEL.parcial]: 'Se aleja algo de lo prescrito (50–79 % o 121–150 %)',
  [NIVEL.lejos]: 'Muy lejos de lo prescrito (menos del 50 % o más del 150 %)',
}

export default function Cumplimiento({ sesion, actividad }) {
  const c = cumplimiento(sesion, actividad)
  if (!c) return null
  return (
    <span title={AYUDA[c.nivel]} style={{ fontSize: 13, color: COLOR[c.nivel], fontWeight: c.nivel === NIVEL.ok ? 400 : 600, whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: FONTS.mono }}>{c.texto}</span>
      {c.nivel !== NIVEL.ok && <span style={{ fontFamily: FONTS.mono }}> · {c.pct} %</span>}
    </span>
  )
}
