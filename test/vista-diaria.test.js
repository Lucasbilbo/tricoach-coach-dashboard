import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTransitionColumnsDiarias, tssPorDiaDelTramo } from '../src/lib/athleteStats.js'

const act = (fecha, disciplina, duracion_min, tss_estimado = 50) => ({ fecha, disciplina, duracion_min, tss_estimado })

// semana del lunes 12 al domingo 18 de octubre de 2026
const DESDE = '2026-10-12'
const HASTA = '2026-10-18'

test('una columna por día del tramo, también los días sin actividad', () => {
  const cols = buildTransitionColumnsDiarias([act('2026-10-13', 'run', 60)], DESDE, HASTA, '2026-11-17')
  assert.equal(cols.length, 7)
  assert.deepEqual(cols.map((c) => c.label), ['Lun 12', 'Mar 13', 'Mié 14', 'Jue 15', 'Vie 16', 'Sáb 17', 'Dom 18'])
  assert.equal(cols[1].statusLabel, '1h 0m')
  assert.equal(cols[0].statusLabel, '—')
  assert.equal(cols[1].heightPct, 100)
  assert.equal(cols[0].heightPct, 2)
})

test('segmenta por disciplina y suma varias sesiones del mismo día', () => {
  const cols = buildTransitionColumnsDiarias(
    [act('2026-10-14', 'swim', 30), act('2026-10-14', 'bike', 90), act('2026-10-14', 'run', 30)],
    DESDE, HASTA, '2026-11-17'
  )
  const dia = cols[2]
  assert.deepEqual(dia.segments.map((s) => [s.disciplina, s.pct]), [['swim', 20], ['bike', 60], ['run', 20]])
})

test("'other' (golf, paseos) no cuenta, y lo de fuera del tramo tampoco", () => {
  const cols = buildTransitionColumnsDiarias(
    [act('2026-10-15', 'other', 200), act('2026-10-11', 'run', 60), act('2026-10-19', 'run', 60)],
    DESDE, HASTA, '2026-11-17'
  )
  assert.ok(cols.every((c) => c.statusLabel === '—'))
})

test('marca hoy solo si cae en el tramo', () => {
  assert.equal(buildTransitionColumnsDiarias([], DESDE, HASTA, '2026-10-14').filter((c) => c.isToday).length, 1)
  assert.equal(buildTransitionColumnsDiarias([], DESDE, HASTA, '2026-11-17').filter((c) => c.isToday).length, 0)
})

test('TSS por día: suma las sesiones, ceros en los días vacíos, ignora lo de fuera', () => {
  const serie = tssPorDiaDelTramo(
    [act('2026-10-13', 'run', 60, 70), act('2026-10-13', 'swim', 30, 30), act('2026-10-20', 'run', 60, 99), act('2026-10-12', 'run', 60, null)],
    DESDE, HASTA
  )
  assert.equal(serie.length, 7)
  assert.equal(serie[1].tss_total, 100)
  assert.equal(serie[1].semana, '2026-10-13')
  assert.equal(serie.reduce((a, d) => a + d.tss_total, 0), 100)
})
