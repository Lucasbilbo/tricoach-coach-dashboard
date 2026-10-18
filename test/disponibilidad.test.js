// Lógica pura de disponibilidad del atleta (plantilla semanal + excepciones por
// fecha). Semana de referencia: lunes 2026-10-19 … domingo 2026-10-25 (el domingo
// es el cambio de hora a invierno en España). Sin red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DISCIPLINAS_DISPONIBILIDAD,
  disponibilidadDelDia,
  evaluarDisponibilidad,
  resumenSemana,
} from '../src/lib/disponibilidad.js'

const LUN = '2026-10-19'
const MAR = '2026-10-20'
const MIE = '2026-10-21'
const DOM = '2026-10-25'

const plantilla = [
  { dia_semana: 1, disciplina: 'swim', max_minutos: 60 },
  { dia_semana: 1, disciplina: 'run', max_minutos: null }, // sin límite
  { dia_semana: 3, disciplina: 'bike', max_minutos: 90 },
  { dia_semana: 7, disciplina: 'run', max_minutos: 120 },
]

test('constante de disciplinas', () => {
  assert.deepEqual(DISCIPLINAS_DISPONIBILIDAD, ['swim', 'bike', 'run', 'strength'])
})

test('sin datos: ni plantilla ni excepciones → no se avisa', () => {
  assert.equal(disponibilidadDelDia({}, LUN).origen, 'sin_datos')
  assert.equal(disponibilidadDelDia(undefined, LUN).origen, 'sin_datos')
  assert.deepEqual(evaluarDisponibilidad({}, LUN, 'swim', 45), { nivel: 'sin_datos', motivo: null, limite: null })
  assert.deepEqual(evaluarDisponibilidad({ plantilla: [], excepciones: [] }, LUN, 'swim', 45), { nivel: 'sin_datos', motivo: null, limite: null })
})

test('plantilla con límite: dentro, justo en el límite y 1 minuto por encima', () => {
  const datos = { plantilla }
  assert.deepEqual(evaluarDisponibilidad(datos, LUN, 'swim', 45), { nivel: 'ok', motivo: null, limite: 60 })
  assert.deepEqual(evaluarDisponibilidad(datos, LUN, 'swim', 60), { nivel: 'ok', motivo: null, limite: 60 })
  assert.deepEqual(evaluarDisponibilidad(datos, LUN, 'swim', 61), { nivel: 'aviso', motivo: 'excede_minutos', limite: 60 })
})

test('sin límite (max_minutos null): cualquier duración encaja', () => {
  const datos = { plantilla }
  assert.deepEqual(evaluarDisponibilidad(datos, LUN, 'run', 600), { nivel: 'ok', motivo: null, limite: null })
  assert.equal(disponibilidadDelDia(datos, LUN).disciplinas.run, null)
})

test('duración desconocida (sesión por distancia): solo se comprueba la disciplina', () => {
  const datos = { plantilla }
  assert.deepEqual(evaluarDisponibilidad(datos, LUN, 'swim', null), { nivel: 'ok', motivo: null, limite: 60 })
  assert.deepEqual(evaluarDisponibilidad(datos, LUN, 'swim', undefined), { nivel: 'ok', motivo: null, limite: 60 })
  assert.equal(evaluarDisponibilidad(datos, LUN, 'bike', null).motivo, 'disciplina_no_disponible')
})

test('plantilla configurada: disciplina que ese día no marcó → aviso', () => {
  const r = evaluarDisponibilidad({ plantilla }, LUN, 'bike', 60)
  assert.deepEqual(r, { nivel: 'aviso', motivo: 'disciplina_no_disponible', limite: null })
})

test('plantilla configurada: día de la semana sin ninguna fila → nada disponible', () => {
  const dia = disponibilidadDelDia({ plantilla }, MAR)
  assert.equal(dia.origen, 'plantilla')
  assert.deepEqual(dia.disciplinas, {})
  assert.equal(evaluarDisponibilidad({ plantilla }, MAR, 'swim', 30).motivo, 'disciplina_no_disponible')
})

test('excepción limitada: sustituye a la plantilla de ese día entero', () => {
  const excepciones = [{ fecha: LUN, tipo: 'limitada', disciplina: 'bike', max_minutos: 30, nota: 'Reunión' }]
  const datos = { plantilla, excepciones }
  const dia = disponibilidadDelDia(datos, LUN)
  assert.equal(dia.origen, 'excepcion')
  assert.deepEqual(dia.disciplinas, { bike: 30 }) // swim y run de la plantilla ya no cuentan
  assert.equal(dia.nota, 'Reunión')
  assert.equal(evaluarDisponibilidad(datos, LUN, 'swim', 30).motivo, 'disciplina_no_disponible')
  assert.equal(evaluarDisponibilidad(datos, LUN, 'bike', 20).nivel, 'ok')
  assert.deepEqual(
    { n: evaluarDisponibilidad(datos, LUN, 'bike', 40).nivel, m: evaluarDisponibilidad(datos, LUN, 'bike', 40).motivo, l: evaluarDisponibilidad(datos, LUN, 'bike', 40).limite },
    { n: 'aviso', m: 'excede_minutos', l: 30 }
  )
})

test('excepción limitada con varias disciplinas, una sin límite', () => {
  const excepciones = [
    { fecha: MIE, tipo: 'limitada', disciplina: 'swim', max_minutos: 30 },
    { fecha: MIE, tipo: 'limitada', disciplina: 'run', max_minutos: null },
  ]
  assert.deepEqual(disponibilidadDelDia({ plantilla, excepciones }, MIE).disciplinas, { swim: 30, run: null })
})

test('excepción no_disponible: día libre con nota', () => {
  const excepciones = [{ fecha: LUN, tipo: 'no_disponible', disciplina: null, max_minutos: null, nota: 'Viaje' }]
  const datos = { plantilla, excepciones }
  assert.deepEqual(disponibilidadDelDia(datos, LUN), { origen: 'dia_libre', disciplinas: {}, nota: 'Viaje' })
  assert.deepEqual(evaluarDisponibilidad(datos, LUN, 'swim', 30), { nivel: 'aviso', motivo: 'dia_libre', limite: null, nota: 'Viaje' })
})

test('día libre manda sobre una limitada de la misma fecha', () => {
  const excepciones = [
    { fecha: LUN, tipo: 'limitada', disciplina: 'run', max_minutos: 30 },
    { fecha: LUN, tipo: 'no_disponible', disciplina: null, max_minutos: null },
  ]
  assert.equal(disponibilidadDelDia({ plantilla, excepciones }, LUN).origen, 'dia_libre')
})

test('una excepción de otra fecha no afecta; sin plantilla pero con excepción ese día sí se evalúa', () => {
  const excepciones = [{ fecha: MAR, tipo: 'no_disponible', disciplina: null, max_minutos: null }]
  assert.equal(disponibilidadDelDia({ plantilla, excepciones }, LUN).origen, 'plantilla')
  assert.equal(evaluarDisponibilidad({ plantilla: [], excepciones }, MAR, 'run', 30).motivo, 'dia_libre')
  assert.equal(evaluarDisponibilidad({ plantilla: [], excepciones }, LUN, 'run', 30).nivel, 'sin_datos')
})

test('domingo = 7 y cambio de hora (2026-10-25)', () => {
  const datos = { plantilla }
  assert.deepEqual(evaluarDisponibilidad(datos, DOM, 'run', 100), { nivel: 'ok', motivo: null, limite: 120 })
  assert.equal(evaluarDisponibilidad(datos, DOM, 'run', 130).motivo, 'excede_minutos')
  assert.equal(evaluarDisponibilidad(datos, '2026-10-26', 'swim', 60).nivel, 'ok') // lunes siguiente = dia 1
})

test('resumenSemana: 7 días consecutivos desde el lunes, también al cruzar mes y cambio de hora', () => {
  const sem = resumenSemana({ plantilla }, LUN)
  assert.equal(sem.length, 7)
  assert.deepEqual(sem.map((d) => d.fecha), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
  assert.deepEqual(sem[0].disciplinas, { swim: 60, run: null })
  assert.deepEqual(sem[1].disciplinas, {})
  assert.deepEqual(sem[2].disciplinas, { bike: 90 })
  assert.deepEqual(sem[6].disciplinas, { run: 120 })
  assert.ok(sem.every((d) => d.origen === 'plantilla'))
  assert.deepEqual(resumenSemana({}, '2026-10-26').map((d) => d.fecha).slice(-2), ['2026-10-31', '2026-11-01'])
  assert.ok(resumenSemana({}, LUN).every((d) => d.origen === 'sin_datos'))
})

test('entradas raras no lanzan excepciones', () => {
  assert.doesNotThrow(() => disponibilidadDelDia(null, LUN))
  assert.doesNotThrow(() => disponibilidadDelDia({ plantilla: null, excepciones: 'x' }, LUN))
  assert.equal(disponibilidadDelDia({ plantilla: [null, undefined, 3, 'a'], excepciones: [null, 5] }, LUN).origen, 'sin_datos')
  assert.equal(evaluarDisponibilidad({ plantilla }, 'no-es-fecha', 'swim', 30).nivel, 'sin_datos')
  assert.equal(evaluarDisponibilidad({ plantilla }, undefined, 'swim', 30).nivel, 'sin_datos')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'golf', 30).nivel, 'sin_datos')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, undefined, 30).nivel, 'sin_datos')
  assert.deepEqual(resumenSemana({ plantilla }, null), [])
  assert.deepEqual(resumenSemana({ plantilla }, 'x'), [])
  // max_minutos con un tipo inesperado se trata como sin límite (no rompe)
  assert.equal(evaluarDisponibilidad({ plantilla: [{ dia_semana: 1, disciplina: 'swim', max_minutos: '60' }] }, LUN, 'swim', 500).nivel, 'ok')
  // duración no numérica se ignora
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'swim', 'mucho').nivel, 'ok')
  assert.equal(evaluarDisponibilidad({ plantilla }, LUN, 'swim', NaN).nivel, 'ok')
})

test('plantillaAEstado y cambiosPlantilla: solo lo cambiado', async () => {
  const { plantillaAEstado, cambiosPlantilla, claveCelda } = await import('../src/lib/disponibilidad.js')
  const estado = plantillaAEstado(plantilla)
  assert.deepEqual(estado[claveCelda(1, 'swim')], { max: 60 })
  assert.deepEqual(estado[claveCelda(1, 'run')], { max: null })
  assert.equal(estado[claveCelda(2, 'run')], undefined)
  // sin tocar nada → sin cambios
  assert.deepEqual(cambiosPlantilla(plantilla, estado), { upsert: [], borrar: [] })
  // cambiar límite, añadir una celda nueva, quitar otra
  const editado = { ...estado, [claveCelda(1, 'swim')]: { max: 45 }, [claveCelda(2, 'bike')]: { max: null } }
  delete editado[claveCelda(7, 'run')]
  const c = cambiosPlantilla(plantilla, editado)
  assert.deepEqual(c.upsert, [
    { dia_semana: 1, disciplina: 'swim', max_minutos: 45 },
    { dia_semana: 2, disciplina: 'bike', max_minutos: null },
  ])
  assert.deepEqual(c.borrar, [{ dia_semana: 7, disciplina: 'run' }])
  // pasar de límite a sin límite cuenta como cambio
  assert.deepEqual(cambiosPlantilla(plantilla, { ...estado, [claveCelda(1, 'swim')]: { max: null } }).upsert,
    [{ dia_semana: 1, disciplina: 'swim', max_minutos: null }])
  // entradas raras
  assert.deepEqual(cambiosPlantilla(null, null), { upsert: [], borrar: [] })
  assert.deepEqual(plantillaAEstado([{ dia_semana: 9, disciplina: 'run' }, { dia_semana: 1, disciplina: 'golf' }]), {})
})

test('filasExcepcion: día libre, limitada y entradas inválidas', async () => {
  const { filasExcepcion } = await import('../src/lib/disponibilidad.js')
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'no_disponible', nota: '  Viaje  ' }),
    [{ fecha: LUN, tipo: 'no_disponible', disciplina: null, max_minutos: null, nota: 'Viaje' }])
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'limitada', disciplinas: { run: 40, swim: null }, nota: '' }), [
    { fecha: LUN, tipo: 'limitada', disciplina: 'swim', max_minutos: null, nota: null },
    { fecha: LUN, tipo: 'limitada', disciplina: 'run', max_minutos: 40, nota: null },
  ])
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'limitada', disciplinas: {} }), [])
  assert.deepEqual(filasExcepcion({ fecha: 'x', tipo: 'no_disponible' }), [])
  assert.deepEqual(filasExcepcion({ fecha: LUN, tipo: 'otro' }), [])
  assert.equal(filasExcepcion({ fecha: LUN, tipo: 'no_disponible', nota: 'a'.repeat(300) })[0].nota.length, 200)
})

test('minutosPlanificados: suma duraciones y cuenta las que no tienen', async () => {
  const { minutosPlanificados } = await import('../src/lib/disponibilidad.js')
  assert.deepEqual(minutosPlanificados([{ duracion_min: 60 }, { duracion_min: 45 }, { duracion_min: null }, {}]), { minutos: 105, sinDuracion: 2 })
  assert.deepEqual(minutosPlanificados([]), { minutos: 0, sinDuracion: 0 })
  assert.deepEqual(minutosPlanificados(null), { minutos: 0, sinDuracion: 0 })
  assert.deepEqual(minutosPlanificados([null, { duracion_min: 0 }]), { minutos: 0, sinDuracion: 1 })
})

test('textoAviso: frases por motivo y silencio si no hay aviso', async () => {
  const { textoAviso } = await import('../src/lib/disponibilidad.js')
  const datos = { plantilla, excepciones: [{ fecha: MAR, tipo: 'no_disponible', disciplina: null, max_minutos: null, nota: 'Viaje' }] }
  assert.match(textoAviso(evaluarDisponibilidad(datos, MAR, 'run', 30), 'run'), /no disponible \(«Viaje»\)/)
  assert.match(textoAviso(evaluarDisponibilidad(datos, LUN, 'bike', 30), 'bike'), /ciclismo/)
  assert.match(textoAviso(evaluarDisponibilidad(datos, LUN, 'swim', 90), 'swim'), /máx\. 60 min/)
  assert.equal(textoAviso(evaluarDisponibilidad(datos, LUN, 'swim', 30), 'swim'), null)
  assert.equal(textoAviso(evaluarDisponibilidad({}, LUN, 'swim', 30), 'swim'), null)
  assert.equal(textoAviso(null, 'swim'), null)
})
