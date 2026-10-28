// avisosReloj.js — avisos cuando el reloj (Intervals.icu) queda distinto de lo
// que dice el panel. Lógica PURA para node --test.
//
// Al reenviar o mover una sesión que ya estaba en el reloj, el backend crea el
// evento nuevo, lo confirma en BD y DESPUÉS borra el viejo. Si ese último
// borrado falla, responde anterior_retirado:false: el atleta tiene el entreno
// dos veces (fecha vieja y nueva). Antes nadie se enteraba (auditoría
// 2026-10-28, M2); ahora se avisa para borrarlo a mano.
import { formatDiaMes } from './chartUtils'

// respuesta: JSON de send-to-intervals / move-session. fechaAntigua: fecha que
// tenía la sesión antes. quien: 'coach' | 'atleta'. → texto o null.
export function avisoEventoAntiguo(respuesta, fechaAntigua, quien = 'coach') {
  if (!respuesta || respuesta.anterior_retirado !== false) return null
  const cuando = fechaAntigua ? ` del ${formatDiaMes(fechaAntigua).toLowerCase()}` : ''
  return quien === 'atleta'
    ? `Hecho, pero el entreno antiguo${cuando} sigue en tu calendario de Intervals.icu. Bórralo allí para que no te salga dos veces en el reloj.`
    : `Hecho, pero el entreno antiguo${cuando} sigue en el Intervals.icu del atleta. Hay que borrarlo allí para que no le salga dos veces en el reloj.`
}
