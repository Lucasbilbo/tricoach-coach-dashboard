// lib/intervals-evento.js — cuerpo del evento de Intervals.icu para una sesión
// (CommonJS). Compartido por send-to-intervals (enviar/reenviar) y move-session
// (mover de día u hora = reenviar con la fecha nueva).

const { buildIntervalsText } = require('./intervals-text.cjs')

const DISCIPLINE_TYPE = {
  swim: 'Swim',
  bike: 'Ride',
  run: 'Run',
  strength: 'WeightTraining',
  other: 'Workout',
}

const dosDigitos = (n) => String(n).padStart(2, '0')

// 'YYYY-MM-DDTHH:MM:00'. Sin hora → medianoche (como siempre: el reloj lo pone
// ese día sin hora concreta).
function inicioLocal(fecha, horaInicioMin) {
  if (!Number.isInteger(horaInicioMin)) return `${fecha}T00:00:00`
  return `${fecha}T${dosDigitos(Math.floor(horaInicioMin / 60))}:${dosDigitos(horaInicioMin % 60)}:00`
}

function construirEvento(session) {
  const piscina = session.workout_steps?.piscina || '25'
  const isSwim = session.disciplina === 'swim'
  const isOpen = piscina === 'open'
  const evento = {
    category: 'WORKOUT',
    start_date_local: inicioLocal(session.fecha, session.hora_inicio_min),
    type: DISCIPLINE_TYPE[session.disciplina] || 'Workout',
    name: session.workout_steps?.nombre || session.descripcion?.substring(0, 60) || 'Entrenamiento',
    // incluirNotas:false SIEMPRE — las notas del entrenador no llegan al reloj
    description: buildIntervalsText(session, { incluirNotas: false }),
    indoor: isSwim && !isOpen,
  }
  if (isSwim && !isOpen) {
    evento.pool_length = piscina === '50' ? 50 : 25
    evento.pool_length_unit = 'Meters'
  }
  return evento
}

module.exports = { construirEvento, inicioLocal, DISCIPLINE_TYPE }
