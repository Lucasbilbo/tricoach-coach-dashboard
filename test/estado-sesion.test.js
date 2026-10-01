import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESTADO, asignarActividades, estadoDeSesion, fechaHaceSemanas, semanasNecesarias } from '../src/lib/estadoSesion.js'

const ses = (id, fecha, disciplina, duracion_min = null) => ({ id, fecha, disciplina, duracion_min })
const act = (id, fecha, disciplina, duracion_min) => ({ id, fecha, disciplina, duracion_min })

test('una actividad completa como mucho una sesión (F6)', () => {
  const s = [ses('a', '2026-09-20', 'run'), ses('b', '2026-09-20', 'run')]
  const m = asignarActividades(s, [act(1, '2026-09-20', 'run', 50)])
  assert.equal(m.size, 1)
})

test('con dos actividades el mismo día, cada sesión coge la de duración más parecida', () => {
  const s = [ses('series', '2026-09-20', 'run', 45), ses('rodaje', '2026-09-20', 'run', 90)]
  const m = asignarActividades(s, [act('largo', '2026-09-20', 'run', 88), act('corto', '2026-09-20', 'run', 47)])
  assert.equal(m.get('series').id, 'corto')
  assert.equal(m.get('rodaje').id, 'largo')
})

test('la disciplina tiene que coincidir', () => {
  const m = asignarActividades([ses('a', '2026-09-20', 'bike')], [act(1, '2026-09-20', 'run', 50)])
  assert.equal(m.size, 0)
})

test('estadoDeSesion: hecha, programada (hoy y futuro), pendiente y sin datos', () => {
  const hoy = '2026-10-01'
  assert.equal(estadoDeSesion(ses('a', '2026-09-20', 'run'), { id: 1 }, hoy, '2026-08-01'), ESTADO.completada)
  assert.equal(estadoDeSesion(ses('a', '2026-10-01', 'run'), null, hoy, '2026-08-01'), ESTADO.programada)
  assert.equal(estadoDeSesion(ses('a', '2026-10-05', 'run'), null, hoy, '2026-08-01'), ESTADO.programada)
  assert.equal(estadoDeSesion(ses('a', '2026-09-20', 'run'), null, hoy, '2026-08-01'), ESTADO.pendiente)
  // más antigua que los datos, o sin datos: nunca un falso "pendiente"
  assert.equal(estadoDeSesion(ses('a', '2026-07-01', 'run'), null, hoy, '2026-08-01'), ESTADO.sinDatos)
  assert.equal(estadoDeSesion(ses('a', '2026-09-20', 'run'), null, hoy, null), ESTADO.sinDatos)
})

test('semanasNecesarias cubre la sesión pasada más antigua, con tope', () => {
  assert.equal(semanasNecesarias(['2026-09-28', '2026-09-14'], '2026-10-01'), 4)
  assert.equal(semanasNecesarias(['2025-01-01'], '2026-10-01'), 26)
  assert.equal(semanasNecesarias(['2026-10-05'], '2026-10-01'), null)
  assert.equal(fechaHaceSemanas('2026-10-01', 4), '2026-09-03')
})
