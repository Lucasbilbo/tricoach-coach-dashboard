// Lógica pura de disponibilidad por tramos horarios (plantilla semanal +
// excepciones por fecha). Semana de referencia: lunes 2026-10-19 … domingo
// 2026-10-25 (cambio de hora a invierno). Horas = minutos desde las 00:00.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DISCIPLINAS_DISPONIBILIDAD, claveSlot, disponibilidadDelDia, evaluarDisponibilidad, filasExcepcion,
  formatHora, formatTramo, formatTramoCorto, mismaPlantilla, minutosPlanificados, pintarRango,
  resumenSemana, slotsAVentanas, textoAviso, ventanasASlots,
} from '../src/lib/disponibilidad.js'

const LUN = '2026-10-19'
const MAR = '2026-10-20'
const DOM = '2026-10-25'
const h = (x) => x * 60

const plantilla = [
  { dia_semana: 1, disciplina: 'swim', inicio_min: h(7), fin_min: h(8) },
  { dia_semana: 1, disciplina: 'run', inicio_min: h(18), fin_min: h(20) },
  { dia_semana: 3, disciplina: 'bike', inicio_min: h(18), fin_min: h(19.5) },
  { dia_semana: 7, disciplina: 'run', inicio_min: h(8), fin_min: h(10) },
]

test('constante de disciplinas', () => {
  assert.deepEqual(DISCIPLINAS_DISPONIBILIDAD, ['swim', 'bike', 'run', 'strength'])
})

test('formato de horas', () => {
  assert.equal(formatHora(450), '7:30')
  assert.equal(formatHora(0), '0:00')
  assert.equal(formatTramo({ inicio_min: h(7), fin_min: h(8.5) }), '7:00–8:30')
  assert.equal(formatTramoCorto({ inicio_min: h(7), fin_min: h(8) }), '7–8')
  assert.equal(formatTramoCorto({ inicio_min: h(7.5), fin_min: h(9) }), '7:30–9')
})

test('sin datos: ni plantilla ni excepciones → no se avisa', () => {
  assert.equal(disponibilidadDelDia({}, LUN).origen, 'sin_datos')
  assert.equal(disponibilidadDelDia(undefined, LUN).origen, 'sin_datos')
  assert.deepEqual(evaluarDisponibilidad({}, LUN, 'swim', 45), { nivel: 'sin_datos', motivo: null, limite: null })
  assert.equal(evaluarDisponibilidad({ plantilla: [], excepciones: [] }, LUN, 'swim', 45).nivel, 'sin_datos')
})

test('plantilla: tramo del día, límite = su duración', () => {
  const dia = disponibilidadDelDia({ plantilla }, LUN)
  assert.equal(dia.origen, 'plantilla')
  assert.deepEqual(dia.disciplinas, {
    swim: [{ inicio_min: h(7), fin_min: h(8) }],
    run: [{ inicio_min: h(18), fin_min: h(20) }],
  })
  assert.deepEqual(evaluarDisponibilidad({ plantilla }, LUN, 'swim', 45), { nivel: 'ok', motivo: null, limite: 60 })
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'swim', 60).nivel, 'ok')
  assert.deepEqual(evaluarDisponibilidad({ plantilla }, LUN, 'swim', 61), { nivel: 'aviso', motivo: 'excede_minutos', limite: 60 })
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'run', 120).nivel, 'ok')
})

test('varios tramos de la misma disciplina: manda el más largo; tramos pegados se unen', () => {
  const p = [
    { dia_semana: 1, disciplina: 'bike', inicio_min: h(7), fin_min: h(8) },
    { dia_semana: 1, disciplina: 'bike', inicio_min: h(18), fin_min: h(20) },
  ]
  assert.equal(evaluarDisponibilidad({ plantilla: p }, LUN, 'bike', 110).nivel, 'ok')
  assert.equal(evaluarDisponibilidad({ plantilla: p }, LUN, 'bike', 130).limite, 120)
  const pegados = [
    { dia_semana: 1, disciplina: 'run', inicio_min: h(7), fin_min: h(8) },
    { dia_semana: 1, disciplina: 'run', inicio_min: h(8), fin_min: h(9) },
  ]
  assert.deepEqual(disponibilidadDelDia({ plantilla: pegados }, LUN).disciplinas.run, [{ inicio_min: h(7), fin_min: h(9) }])
})

test('duración desconocida: solo se comprueba la disciplina', () => {
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'swim', null).nivel, 'ok')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'swim', undefined).nivel, 'ok')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'bike', null).motivo, 'disciplina_no_disponible')
})

test('plantilla configurada: disciplina no marcada ese día, o día sin nada → aviso', () => {
  assert.deepEqual(evaluarDisponibilidad({ plantilla }, LUN, 'bike', 60), { nivel: 'aviso', motivo: 'disciplina_no_disponible', limite: null })
  const dia = disponibilidadDelDia({ plantilla }, MAR)
  assert.equal(dia.origen, 'plantilla')
  assert.deepEqual(dia.disciplinas, {})
  assert.equal(evaluarDisponibilidad({ plantilla }, MAR, 'swim', 30).motivo, 'disciplina_no_disponible')
})

test('excepción limitada sustituye a la plantilla de ese día', () => {
  const excepciones = [{ fecha: LUN, tipo: 'limitada', disciplina: 'bike', inicio_min: h(12), fin_min: h(12.5), nota: 'Reunión' }]
  const datos = { plantilla, excepciones }
  const dia = disponibilidadDelDia(datos, LUN)
  assert.equal(dia.origen, 'excepcion')
  assert.deepEqual(dia.disciplinas, { bike: [{ inicio_min: h(12), fin_min: h(12.5) }] })
  assert.equal(dia.nota, 'Reunión')
  assert.equal(evaluarDisponibilidad(datos, LUN, 'swim', 30).motivo, 'disciplina_no_disponible')
  assert.equal(evaluarDisponibilidad(datos, LUN, 'bike', 20).nivel, 'ok')
  assert.equal(evaluarDisponibilidad(datos, LUN, 'bike', 40).limite, 30)
})

test('excepción no_disponible: día libre con nota, y manda sobre una limitada', () => {
  const libre = [{ fecha: LUN, tipo: 'no_disponible', disciplina: null, inicio_min: null, fin_min: null, nota: 'Viaje' }]
  assert.deepEqual(disponibilidadDelDia({ plantilla, excepciones: libre }, LUN), { origen: 'dia_libre', disciplinas: {}, nota: 'Viaje' })
  assert.deepEqual(evaluarDisponibilidad({ plantilla, excepciones: libre }, LUN, 'swim', 30), { nivel: 'aviso', motivo: 'dia_libre', limite: null, nota: 'Viaje' })
  const mezcla = [{ fecha: LUN, tipo: 'limitada', disciplina: 'run', inicio_min: h(7), fin_min: h(8) }, ...libre]
  assert.equal(disponibilidadDelDia({ plantilla, excepciones: mezcla }, LUN).origen, 'dia_libre')
})

test('una excepción de otra fecha no afecta; sin plantilla pero con excepción ese día sí se evalúa', () => {
  const excepciones = [{ fecha: MAR, tipo: 'no_disponible', disciplina: null, inicio_min: null, fin_min: null }]
  assert.equal(disponibilidadDelDia({ plantilla, excepciones }, LUN).origen, 'plantilla')
  assert.equal(evaluarDisponibilidad({ plantilla: [], excepciones }, MAR, 'run', 30).motivo, 'dia_libre')
  assert.equal(evaluarDisponibilidad({ plantilla: [], excepciones }, LUN, 'run', 30).nivel, 'sin_datos')
})

test('domingo = 7 y cambio de hora', () => {
  assert.deepEqual(evaluarDisponibilidad({ plantilla }, DOM, 'run', 100), { nivel: 'ok', motivo: null, limite: 120 })
  assert.equal(evaluarDisponibilidad({ plantilla }, DOM, 'run', 130).motivo, 'excede_minutos')
  assert.equal(evaluarDisponibilidad({ plantilla }, '2026-10-26', 'swim', 60).nivel, 'ok')
})

test('resumenSemana: 7 días desde el lunes', () => {
  const sem = resumenSemana({ plantilla }, LUN)
  assert.deepEqual(sem.map((d) => d.fecha), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
  assert.deepEqual(Object.keys(sem[0].disciplinas).sort(), ['run', 'swim'])
  assert.deepEqual(sem[1].disciplinas, {})
  assert.deepEqual(sem[2].disciplinas.bike, [{ inicio_min: h(18), fin_min: h(19.5) }])
  assert.ok(resumenSemana({}, LUN).every((d) => d.origen === 'sin_datos'))
  assert.deepEqual(resumenSemana({ plantilla }, null), [])
})

test('calendario: filas ↔ franjas es reversible y une franjas contiguas', () => {
  const slots = ventanasASlots(plantilla)
  assert.ok(slots.has(claveSlot(1, 14, 'swim')) && slots.has(claveSlot(1, 15, 'swim')))
  assert.ok(!slots.has(claveSlot(1, 16, 'swim')))
  assert.deepEqual(slotsAVentanas(slots), [...plantilla].sort((a, b) => a.dia_semana - b.dia_semana || a.inicio_min - b.inicio_min))
  assert.equal(mismaPlantilla(plantilla, slots), true)
})

test('calendario: pintar y borrar rangos, en cualquier orden de extremos, sin mutar', () => {
  const vacio = new Set()
  const p = pintarRango(vacio, 2, 16, 14, 'swim') // 7:00–8:30 (extremos al revés)
  assert.equal(vacio.size, 0)
  assert.deepEqual(slotsAVentanas(p), [{ dia_semana: 2, disciplina: 'swim', inicio_min: h(7), fin_min: h(8.5) }])
  // dos disciplinas en la misma franja
  const dos = pintarRango(p, 2, 14, 15, 'run')
  assert.equal(slotsAVentanas(dos).length, 2)
  // borrar solo una disciplina
  assert.deepEqual(slotsAVentanas(pintarRango(dos, 2, 14, 15, 'run', true)).map((f) => f.disciplina), ['swim'])
  // borrar todo en un rango
  assert.equal(slotsAVentanas(pintarRango(dos, 2, 0, 47, null, true)).length, 0)
  // un hueco parte el tramo en dos
  const hueco = pintarRango(p, 2, 15, 15, 'swim', true)
  assert.deepEqual(slotsAVentanas(hueco).map((f) => [f.inicio_min, f.fin_min]), [[h(7), h(7.5)], [h(8), h(8.5)]])
  // límites del día y disciplina inválida
  assert.equal(pintarRango(vacio, 1, -5, 99, 'bike').size, 48)
  assert.equal(pintarRango(vacio, 1, 0, 3, 'golf').size, 0)
})

test('mismaPlantilla detecta cambios', () => {
  const slots = ventanasASlots(plantilla)
  assert.equal(mismaPlantilla(plantilla, pintarRango(slots, 4, 20, 22, 'bike')), false)
  assert.equal(mismaPlantilla([], new Set()), true)
})

test('filasExcepcion: día libre, tramos y entradas inválidas', () => {
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'no_disponible', nota: '  Viaje  ' }),
    [{ fecha: LUN, tipo: 'no_disponible', disciplina: null, inicio_min: null, fin_min: null, nota: 'Viaje' }])
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'limitada', tramos: [{ disciplina: 'run', inicio_min: h(7), fin_min: h(8) }, { disciplina: 'run', inicio_min: h(9), fin_min: h(8) }, { disciplina: 'golf', inicio_min: 0, fin_min: 60 }] }),
    [{ fecha: LUN, tipo: 'limitada', disciplina: 'run', inicio_min: h(7), fin_min: h(8), nota: null }])
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'limitada', tramos: [] }), [])
  assert.deepEqual(filasExcepcion({ fecha: 'x', tipo: 'no_disponible' }), [])
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'otro' }), [])
  assert.equal(filasExcepcion({ fecha: LUN, tipo: 'no_disponible', nota: 'a'.repeat(300) })[0].nota.length, 200)
})

test('minutosPlanificados', () => {
  assert.deepEqual(minutosPlanificados([{ duracion_min: 60 }, { duracion_min: 45 }, { duracion_min: null }, {}]), { minutos: 105, sinDuracion: 2 })
  assert.deepEqual(minutosPlanificados(null), { minutos: 0, sinDuracion: 0 })
  assert.deepEqual(minutosPlanificados([null, { duracion_min: 0 }]), { minutos: 0, sinDuracion: 1 })
})

test('textoAviso: frases por motivo y silencio si no hay aviso', () => {
  const datos = { plantilla, excepciones: [{ fecha: MAR, tipo: 'no_disponible', disciplina: null, inicio_min: null, fin_min: null, nota: 'Viaje' }] }
  assert.match(textoAviso(evaluarDisponibilidad(datos, MAR, 'run', 30), 'run'), /no disponible \(«Viaje»\)/)
  assert.match(textoAviso(evaluarDisponibilidad(datos, LUN, 'bike', 30), 'bike'), /ciclismo/)
  assert.match(textoAviso(evaluarDisponibilidad(datos, LUN, 'swim', 90), 'swim'), /60 min/)
  assert.equal(textoAviso(evaluarDisponibilidad(datos, LUN, 'swim', 30), 'swim'), null)
  assert.equal(textoAviso(evaluarDisponibilidad({}, LUN, 'swim', 30), 'swim'), null)
  assert.equal(textoAviso(null, 'swim'), null)
})

test('entradas raras no lanzan excepciones', () => {
  assert.doesNotThrow(() => disponibilidadDelDia(null, LUN))
  assert.doesNotThrow(() => disponibilidadDelDia({ plantilla: null, excepciones: 'x' }, LUN))
  assert.equal(disponibilidadDelDia({ plantilla: [null, 3, 'a', { disciplina: 'run' }], excepciones: [null, 5] }, LUN).origen, 'sin_datos')
  assert.equal(evaluarDisponibilidad({ plantilla }, 'no-es-fecha', 'swim', 30).nivel, 'sin_datos')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'golf', 30).nivel, 'sin_datos')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'swim', 'mucho').nivel, 'ok')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'swim', NaN).nivel, 'ok')
  assert.deepEqual([...ventanasASlots(null)], [])
  assert.deepEqual(slotsAVentanas(null), [])
})
