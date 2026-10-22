import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calibrar, cargaSemana, proyectar, pruebaObjetivo, sesionesPendientes, tssPlan } from '../src/lib/proyeccion.js'
import { computeCargaHoy } from '../src/lib/carga.js'

const z2 = (min) => ({ bloques: [{ tipo: 'step', cantidad: min, unidad: 'min', objetivo_tipo: 'zona', objetivo_valor: 'Z2' }] })
const ses = (id, fecha, min, disciplina = 'run') => ({ id, fecha, disciplina, duracion_min: min, workout_steps: z2(min) })
const act = (fecha, tss, extra = {}) => ({ fecha, disciplina: 'run', duracion_min: 40, tss_estimado: tss, ...extra })
const HOY = '2026-10-22'

test('calibra con la mediana de real/previsto y exige muestras suficientes', () => {
  // 40' Z2 = 28 previsto; reales 42, 56, 70 → ratios 1,5 / 2 / 2,5 → mediana 2
  const sesiones = [ses('a', '2026-10-01', 40), ses('b', '2026-10-05', 40), ses('c', '2026-10-09', 40)]
  const acts = [act('2026-10-01', 42), act('2026-10-05', 56), act('2026-10-09', 70)]
  const cal = calibrar(sesiones, acts, HOY)
  assert.equal(cal.run.factor, 2)
  assert.equal(cal.run.muestras, 3)
  assert.equal(tssPlan(ses('x', '2026-10-25', 40), cal), 56)
  // Con 2 muestras no hay calibración
  assert.deepEqual(calibrar(sesiones.slice(0, 2), acts, HOY), {})
})

test('el TSS estimado sin FC no calibra (no es una medida)', () => {
  const sesiones = [ses('a', '2026-10-01', 40), ses('b', '2026-10-05', 40), ses('c', '2026-10-09', 40)]
  const acts = ['2026-10-01', '2026-10-05', '2026-10-09'].map((f) => act(f, 43, { tss_estimado_sin_fc: true }))
  assert.deepEqual(calibrar(sesiones, acts, HOY), {})
})

test('pendientes: futuras y las de hoy aún sin actividad', () => {
  const sesiones = [ses('ayer', '2026-10-21', 40), ses('hoyHecha', HOY, 40), ses('hoyNo', HOY, 30, 'bike'), ses('mañana', '2026-10-23', 40)]
  const ids = sesionesPendientes(sesiones, [act(HOY, 50)], HOY).map((s) => s.id)
  assert.deepEqual(ids, ['hoyNo', 'mañana'])
})

test('prueba objetivo: la próxima A confirmada o inscrito', () => {
  const ev = [
    { nombre: 'B cercana', prioridad: 'B', estado: 'inscrito', fecha: '2026-11-01' },
    { nombre: 'A candidata', prioridad: 'A', estado: 'candidata', fecha: '2026-11-02' },
    { nombre: 'A pasada', prioridad: 'A', estado: 'inscrito', fecha: '2026-10-01' },
    { nombre: 'A lejos', prioridad: 'A', estado: 'confirmada', fecha: '2027-06-05' },
    { nombre: 'A pronto', prioridad: 'A', estado: 'inscrito', fecha: '2026-11-15' },
  ]
  assert.equal(pruebaObjetivo(ev, HOY).nombre, 'A pronto')
})

test('proyecta solo hasta la última sesión planificada y da la forma de la víspera de la prueba', () => {
  const acts = Array.from({ length: 60 }, (_, i) => act(new Date(Date.UTC(2026, 7, 24 + i)).toISOString().slice(0, 10), 50))
  const sesiones = [ses('1', '2026-10-24', 60), ses('2', '2026-10-27', 30), ses('3', '2026-11-01', 20)]
  const eventos = [{ nombre: 'Prueba', prioridad: 'A', estado: 'inscrito', fecha: '2026-10-30' }]
  const p = proyectar({ actividades: acts, sesiones, eventos, hoy: HOY })
  assert.equal(p.hasta, '2026-11-01')
  assert.equal(p.dias[0].fecha, HOY)
  assert.equal(p.dias[p.dias.length - 1].fecha, '2026-11-01')
  // La prueba cae dentro del plan → TSB de la víspera; con menos carga que la
  // habitual (50/día) la forma sube: TSB positivo
  assert.ok(p.prueba && p.prueba.tsb > 0, `TSB ${p.prueba?.tsb}`)
  // Hoy (sin sesiones hoy) coincide con la carga real de hoy
  const real = computeCargaHoy(acts, HOY)
  assert.equal(Math.round(p.dias[0].ctl), real.ctl)
})

test('prueba fuera del plan: no se inventa su forma', () => {
  const p = proyectar({
    actividades: [act('2026-10-20', 50)],
    sesiones: [ses('1', '2026-10-24', 60)],
    eventos: [{ nombre: 'Lejos', prioridad: 'A', estado: 'confirmada', fecha: '2027-06-05' }],
    hoy: HOY,
  })
  assert.equal(p.prueba, null)
  assert.equal(p.evento.nombre, 'Lejos')
  assert.ok(p.final)
})

test('carga de la semana: prevista calibrada y real solo si está cubierta', () => {
  const cal = { run: { factor: 2, muestras: 3 } }
  const semana = [ses('a', '2026-10-19', 40), ses('b', '2026-10-21', 40)] // 28 → 56 cada una
  const acts = [act('2026-10-19', 50), act('2026-10-20', 30), act('2026-10-27', 99)]
  const base = { lunes: '2026-10-19', sesiones: semana, actividades: acts, calibracion: cal, hoy: HOY }
  assert.deepEqual(cargaSemana({ ...base, coberturaDesde: '2026-09-01' }), { prevista: 112, real: 80 })
  assert.deepEqual(cargaSemana({ ...base, coberturaDesde: '2026-10-20' }), { prevista: 112, real: null })
  assert.deepEqual(cargaSemana({ ...base, lunes: '2026-10-26', coberturaDesde: '2026-09-01' }), { prevista: 112, real: null })
  assert.deepEqual(cargaSemana({ ...base, sesiones: [], coberturaDesde: '2026-09-01' }), { prevista: null, real: 80 })
})

test('sin nada planificado no hay proyección', () => {
  assert.equal(proyectar({ actividades: [act('2026-10-20', 50)], sesiones: [ses('a', '2026-10-01', 40)], eventos: [], hoy: HOY }), null)
})
