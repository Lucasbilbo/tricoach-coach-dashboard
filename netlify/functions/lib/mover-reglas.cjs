// mover-reglas.cjs — reglas PURAS para mover una sesión de día u hora.
// Fuente única: la usa la Netlify Function `move-session` (require) y el
// frontend (re-export en src/lib/agenda.js) para no ofrecer lo que el backend
// va a rechazar. CommonJS (.cjs) por el mismo motivo que intervals-text.cjs.
//
// Reglas (decididas con Lucas, 2026-10-22):
// - Lo pasado se pierde: no se mueve una sesión de un día pasado ni a un día
//   pasado. Hoy sí, pero solo a una hora que todavía no ha llegado.
// - Mover es libre (atleta o coach), sin aprobación: el coach ve la marca.
// - Horas en minutos desde las 0:00, múltiplos de 5 (la agenda ajusta a 30).

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/
const ZONA = 'Europe/Madrid'

function fechaValida(f) {
  if (typeof f !== 'string' || !FECHA_RE.test(f)) return false
  const d = new Date(f + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f
}

// null = sin hora. Si no, entero 0..1435 múltiplo de 5.
function horaValida(h) {
  if (h === null || h === undefined) return true
  return Number.isInteger(h) && h >= 0 && h <= 1435 && h % 5 === 0
}

// Fecha (YYYY-MM-DD) y minuto del día en Madrid.
function ahoraMadrid(now = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value])
  )
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    min: Number(partes.hour) * 60 + Number(partes.minute),
  }
}

const err = (code, error) => ({ ok: false, code, error })

// origen / destino: { fecha, hora } (hora null = sin hora). ahora: ahoraMadrid().
function validarMovimiento({ origen, destino, ahora }) {
  if (!origen || !fechaValida(origen.fecha)) return err('ORIGEN_INVALIDO', 'La sesión no tiene una fecha válida')
  if (!destino || !fechaValida(destino.fecha)) return err('FECHA_INVALIDA', 'Fecha no válida')
  if (!horaValida(destino.hora)) return err('HORA_INVALIDA', 'Hora no válida')
  if (origen.fecha < ahora.fecha) return err('ORIGEN_PASADO', 'Las sesiones de días pasados no se mueven')
  if (destino.fecha < ahora.fecha) return err('DESTINO_PASADO', 'No se puede mover a un día pasado')
  if (destino.fecha === ahora.fecha && destino.hora != null && destino.hora < ahora.min) {
    return err('HORA_PASADA', 'Esa hora de hoy ya ha pasado')
  }
  if (origen.fecha === destino.fecha && (origen.hora ?? null) === (destino.hora ?? null)) {
    return err('SIN_CAMBIOS', 'La sesión ya está ahí')
  }
  return { ok: true }
}

// ¿Se puede coger esta sesión para moverla? (solo hoy y días futuros)
const esMovible = (fecha, ahora) => fechaValida(fecha) && fecha >= ahora.fecha

// Ajusta un minuto al tramo más cercano (por defecto 30 min), dentro del día.
function ajustar(min, paso = 30) {
  const m = Math.round(min / paso) * paso
  return Math.min(Math.max(m, 0), 1440 - paso)
}

module.exports = { fechaValida, horaValida, ahoraMadrid, validarMovimiento, esMovible, ajustar }
