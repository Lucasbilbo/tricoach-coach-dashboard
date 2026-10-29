// Datos simulados para el repaso visual: Jon (coach) y Lucas (atleta), fechas
// relativas a hoy (Madrid). Sesiones pasadas y futuras de todos los tipos.
const C = '538f0be3-6ca4-4b21-b635-67567829ff22'
const A = 'fcd0f6cb-771e-482e-b541-1ff093ab871b'
const B = '22222222-2222-4222-8222-222222222222' // segundo atleta (dashboard)

const DIA = 86400000
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
const HOY = hoyMadrid()
const fecha = (delta) => new Date(Date.parse(HOY + 'T00:00:00Z') + delta * DIA).toISOString().slice(0, 10)

let n = 0
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

const step = (cantidad, unidad, zona, extra = {}) => ({ tipo: 'step', cantidad, unidad, nombre: null, material: [], objetivo_tipo: zona ? 'zona' : null, objetivo_valor: zona || null, ...extra })
const rep = (veces, pasos, nombre = '') => ({ tipo: 'repeat', repeticiones: veces, nombre, pasos })

function ses(delta, disciplina, descripcion, bloques, extra = {}) {
  return {
    id: uid(), coach_id: C, athlete_id: A, fecha: fecha(delta), disciplina, descripcion,
    duracion_min: null, intensidad: null, notas: null, created_at: new Date().toISOString(),
    workout_steps: bloques ? { bloques, notas: '', ...(disciplina === 'swim' ? { piscina: '25' } : {}) } : null,
    intervals_event_id: null, enviado_a_garmin: false, garmin_enviado_at: null,
    hora_inicio_min: null, movida_por: null, movida_at: null, ...extra,
  }
}

const sesiones = [
  // ── pasadas ──
  ses(-6, 'run', 'Rodaje largo 15 km', [step(15, 'km', 'Z2')], { hora_inicio_min: 600 }),
  ses(-5, 'swim', 'Técnica + series', [step(400, 'mtr', null, { tipo: 'warmup', nombre: 'Calentar' }), rep(8, [step(100, 'mtr', 'Z3'), step(20, 's', null, { nombre: 'Descanso' })]), step(200, 'mtr', null, { tipo: 'cooldown', nombre: 'Soltar' })], { hora_inicio_min: 1080, enviado_a_garmin: true, intervals_event_id: '111' }),
  ses(-4, 'bike', 'Tempo 2h', [step(30, 'min', 'Z1', { tipo: 'warmup' }), rep(3, [step(15, 'min', 'Z3'), step(5, 'min', 'Z1')]), step(30, 'min', 'Z2', { tipo: 'cooldown' })], { duracion_min: 120, hora_inicio_min: 1080, enviado_a_garmin: true, intervals_event_id: '112' }),
  // doble de carrera el mismo día
  ses(-3, 'run', 'Series 8 km', [step(8, 'km', 'Z4')], { hora_inicio_min: 450 }),
  ses(-3, 'run', 'Rodaje 18 km', [step(18, 'km', 'Z2')], { hora_inicio_min: 1110 }),
  ses(-2, 'strength', 'Hyrox', null, { duracion_min: 60, workout_steps: { bloques: [], adjunto: { texto: '4 rondas:\n- 1000 m remo\n- 20 wall balls\n- 50 m sled push', imagenes: [] } } }),
  ses(-1, 'run', 'Fartlek', [step(15, 'min', 'Z1'), rep(8, [step(1, 'min', 'Z5'), step(1, 'min', 'Z1')]), step(10, 'min', 'Z1')], { duracion_min: 41, movida_por: 'atleta', movida_at: new Date().toISOString() }),
  // ── hoy ──
  ses(0, 'bike', 'Rodillo Z2', [step(75, 'min', 'Z2')], { duracion_min: 75, hora_inicio_min: 1110, enviado_a_garmin: true, intervals_event_id: '113' }),
  // ── futuras ──
  ses(1, 'swim', 'Nado 2000', [step(2000, 'mtr', null, { nombre: 'Continuo' })], { hora_inicio_min: 420 }),
  ses(2, 'run', 'Tirada 21 km', [step(21, 'km', 'Z2')], { hora_inicio_min: 540 }),
  ses(3, 'bike', 'Bici larga 3h', [step(3, 'h', 'Z2')], { duracion_min: 180 }),
  ses(5, 'run', 'Series 6x1 km', [step(15, 'min', 'Z1', { tipo: 'warmup' }), rep(6, [step(1, 'km', 'Z4'), step(2, 'min', null, { nombre: 'Descanso' })]), step(10, 'min', 'Z1', { tipo: 'cooldown' })], { hora_inicio_min: 1080 }),
  ...Array.from({ length: 12 }, (_, i) => ses(7 + i, ['run', 'bike', 'swim'][i % 3], `Sesión futura ${i + 1}`, [step(45 + (i % 3) * 15, 'min', 'Z2')], { duracion_min: 45 + (i % 3) * 15 })),
]
const porDesc = (d) => sesiones.find((s) => s.descripcion === d)

const feedback = [
  { session_id: porDesc('Rodaje largo 15 km').id, athlete_id: A, rpe: 6, sensacion: 4, comentario: 'Bien, las piernas respondieron', molestias: false, molestias_texto: null, updated_at: new Date().toISOString() },
  { session_id: porDesc('Series 8 km').id, athlete_id: A, rpe: 8, sensacion: 2, comentario: null, molestias: true, molestias_texto: 'Gemelo derecho al final', updated_at: new Date().toISOString() },
]

const nutricion = [
  { session_id: porDesc('Rodaje largo 15 km').id, athlete_id: A, carbohidratos_g_h: 45, liquido_ml_h: 600, sodio_mg_h: 400, notas: 'Gel en el km 7', tomado_carbohidratos_g_h: 25, tomado_liquido_ml_h: 400, estomago: 1, tomado_notas: 'El gel me sentó fatal', actualizado_por: A, updated_at: new Date().toISOString() },
  { session_id: porDesc('Tirada 21 km').id, athlete_id: A, carbohidratos_g_h: 60, liquido_ml_h: 600, sodio_mg_h: 500, notas: 'Gel cada 30 min, empezando en el 40', tomado_carbohidratos_g_h: null, tomado_liquido_ml_h: null, estomago: null, tomado_notas: null, actualizado_por: C, updated_at: new Date().toISOString() },
]

const tramo = (dia, disciplina, ini, fin) => ({ id: uid(), athlete_id: A, dia_semana: dia, disciplina, inicio_min: ini * 60, fin_min: fin * 60 })
const dispSemana = [1, 2, 3, 4, 5].flatMap((d) => [tramo(d, 'swim', 7, 8), tramo(d, 'run', 18, 19.5), tramo(d, 'bike', 17.5, 20)])
  .concat([tramo(6, 'bike', 8, 13), tramo(6, 'run', 9, 12), tramo(7, 'run', 9, 11), tramo(7, 'swim', 10, 12)])

const db = {
  coaches: [{ id: C }],
  profiles: [
    { id: C, nombre: 'Jon García', email: 'jon@example.com' },
    { id: A, nombre: 'Lucas', email: 'lucas@example.com', fc_maxima: 188 },
    { id: B, nombre: 'Leire', email: 'leire@example.com' },
  ],
  coach_athletes: [{ id: uid(), coach_id: C, athlete_id: A }, { id: uid(), coach_id: C, athlete_id: B }],
  coach_sessions: sesiones,
  sesion_feedback: feedback,
  sesion_nutricion: nutricion,
  atleta_disponibilidad_semana: dispSemana,
  atleta_disponibilidad_fecha: [{ id: uid(), athlete_id: A, fecha: fecha(4), tipo: 'no_disponible', disciplina: null, inicio_min: null, fin_min: null, nota: 'Viaje' }],
  coach_plantillas: [],
  athlete_invitations: [],
}

// ── Actividades de Strava (formato /athlete/activities) ──
const actividades = []
let idAct = 9000
function act(delta, sport, minutos, km, hr, horaUtc = 17) {
  const f = fecha(delta)
  const start = `${f}T${String(horaUtc).padStart(2, '0')}:00:00Z`
  actividades.push({
    id: ++idAct, name: `${sport} ${f}`, type: sport, sport_type: sport, start_date: start, start_date_local: start,
    moving_time: minutos * 60, elapsed_time: Math.round(minutos * 60 * (sport === 'Swim' ? 1.15 : 1.03)),
    distance: km * 1000, average_heartrate: hr, max_heartrate: hr + 25, total_elevation_gain: sport === 'Ride' ? 400 : 60,
    average_speed: (km * 1000) / (minutos * 60), map: { summary_polyline: null },
  })
}
// historial de 26 semanas: patrón semanal
for (let w = 26; w >= 1; w--) {
  const base = -w * 7
  act(base + 1, 'Swim', 40, 1.8, 135, 6)
  act(base + 2, 'Run', 50, 9, 148)
  act(base + 3, 'Ride', 90, 40, 138)
  act(base + 5, 'Run', 40, 7.5, 152)
  if (w % 2 === 0) act(base + 6, 'Ride', 150, 70, 135, 8)
}
// las pasadas prescritas
act(-6, 'Run', 85, 15.1, 147, 9)
act(-5, 'Swim', 38, 2.0, 140)
act(-4, 'Ride', 118, 56, 142)
act(-3, 'Run', 98, 17.8, 146, 17) // tarde: el rodaje largo
act(-3, 'Run', 44, 8.2, 165, 6)   // mañana: las series
act(-1, 'Run', 30, 5.5, 150)      // se quedó corto
act(-2, 'Golf', 180, 6, 95, 9)    // no computa

const temporada = {
  eventos: [
    { id: uid(), athlete_id: A, nombre: 'Triatlón de Bilbao', deporte: 'tri', distancia: 'Olímpico', fecha: fecha(40), fecha_aprox: null, estado: 'inscrito', prioridad: 'A', escenario: null, precio: '85 €', url: null, inscripcion_antes: null, notas: null, created_by: A, updated_by: A, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: uid(), athlete_id: A, nombre: 'Media de Vitoria', deporte: 'run', distancia: '21 km', fecha: fecha(18), fecha_aprox: null, estado: 'confirmada', prioridad: 'B', escenario: null, precio: null, url: null, inscripcion_antes: fecha(5), notas: null, created_by: C, updated_by: C, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ],
  cambios: [],
}

module.exports = { C, A, B, db, actividades, temporada, HOY }
