// Tests de la Temporada: `npm test` (node --test, sin dependencias nuevas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  alertaInscripcion,
  agruparPorMes,
  diasEntre,
  eventoAFormulario,
  filtrarEventos,
  formatFechaEvento,
  hoyMadrid,
  inscripcionesPendientes,
  mesesTemporada,
  proximasPruebas,
  textoAutoria,
} from '../src/lib/season.js'

const require = createRequire(import.meta.url)
const { validarEvento, resumirCambio } = require('../netlify/functions/lib/season-validate.js')

// ── Backend: validación ──────────────────────────────────────────────────
test('validarEvento normaliza un evento mínimo', () => {
  const r = validarEvento({ nombre: '  Getxo olímpico ', deporte: 'tri' })
  assert.equal(r.ok, true)
  assert.equal(r.evento.nombre, 'Getxo olímpico')
  assert.equal(r.evento.estado, 'candidata')
  assert.equal(r.evento.prioridad, null)
  assert.equal(r.evento.fecha, null)
  assert.equal(r.evento.fecha_aprox, false)
})

test('validarEvento convierte strings vacíos en null', () => {
  const r = validarEvento({ nombre: 'X', deporte: 'run', distancia: '', precio: '  ', fecha: '', prioridad: '' })
  assert.equal(r.ok, true)
  assert.equal(r.evento.distancia, null)
  assert.equal(r.evento.precio, null)
  assert.equal(r.evento.prioridad, null)
})

test('validarEvento rechaza valores fuera de catálogo y fechas imposibles', () => {
  const r = validarEvento({ nombre: 'X', deporte: 'padel', estado: 'quizá', prioridad: 'D', fecha: '2027-02-30' })
  assert.equal(r.ok, false)
  assert.ok(r.errores.includes('deporte inválido'))
  assert.ok(r.errores.includes('estado inválido'))
  assert.ok(r.errores.includes('prioridad inválida'))
  assert.ok(r.errores.some((e) => e.startsWith('fecha')))
})

test('validarEvento exige nombre y enlace http(s)', () => {
  const r = validarEvento({ nombre: '', deporte: 'run', url: 'javascript:alert(1)' })
  assert.equal(r.ok, false)
  assert.ok(r.errores.includes('nombre requerido'))
  assert.ok(r.errores.some((e) => e.includes('http')))
})

test('validarEvento ignora campos fuera de la whitelist (athlete_id, created_by)', () => {
  const r = validarEvento({ nombre: 'X', deporte: 'run', athlete_id: 'otro', created_by: 'otro', id: 'x' })
  assert.equal(r.ok, true)
  assert.equal('athlete_id' in r.evento, false)
  assert.equal('created_by' in r.evento, false)
  assert.equal('id' in r.evento, false)
})

test('validarEvento rechaza body no objeto', () => {
  assert.equal(validarEvento(null).ok, false)
  assert.equal(validarEvento([]).ok, false)
})

// ── Backend: resumen de cambios ──────────────────────────────────────────
test('resumirCambio describe la creación', () => {
  assert.equal(resumirCambio(null, { nombre: 'Bibe' }), 'Añade Bibe')
})

test('resumirCambio lista solo lo que cambia', () => {
  const antes = { nombre: 'Getxo', estado: 'candidata', prioridad: null, notas: 'a' }
  const despues = { nombre: 'Getxo', estado: 'confirmada', prioridad: 'A', notas: 'b' }
  assert.equal(
    resumirCambio(antes, despues),
    'Getxo: estado candidata → confirmada, prioridad – → A, notas actualizado'
  )
})

test('resumirCambio devuelve null si no hay cambios', () => {
  const e = { nombre: 'Getxo', estado: 'confirmada', fecha: '2027-09-26' }
  assert.equal(resumirCambio(e, { ...e }), null)
})

// ── Frontend: helpers ────────────────────────────────────────────────────
test('formatFechaEvento: exacta, aproximada y sin fecha', () => {
  assert.equal(formatFechaEvento({ fecha: '2027-06-05' }), '5 jun 2027')
  assert.equal(formatFechaEvento({ fecha: '2027-03-14', fecha_aprox: true }), '~ mar 2027')
  assert.equal(formatFechaEvento({ fecha: null }), 'Sin fecha')
})

test('diasEntre cruza el cambio de hora sin desfase', () => {
  assert.equal(diasEntre('2026-10-24', '2026-10-26'), 2)
  assert.equal(diasEntre('2027-03-27', '2027-03-29'), 2)
})

test('hoyMadrid usa la fecha de Madrid, no la UTC', () => {
  // 23:30 UTC del 31-dic = 00:30 del 1-ene en Madrid
  assert.equal(hoyMadrid(new Date('2026-12-31T23:30:00Z')), '2027-01-01')
})

test('alertaInscripcion: pronto, vencida y no aplica si ya estás inscrito', () => {
  const hoy = '2027-01-01'
  assert.deepEqual(alertaInscripcion({ estado: 'confirmada', inscripcion_antes: '2027-01-15' }, hoy), {
    nivel: 'pronto',
    dias: 14,
  })
  assert.equal(alertaInscripcion({ estado: 'confirmada', inscripcion_antes: '2026-12-20' }, hoy).nivel, 'vencida')
  assert.equal(alertaInscripcion({ estado: 'inscrito', inscripcion_antes: '2027-01-15' }, hoy), null)
  assert.equal(alertaInscripcion({ estado: 'candidata', inscripcion_antes: '2027-06-01' }, hoy), null)
})

test('agruparPorMes ordena por fecha y deja las pruebas sin fecha al final', () => {
  const grupos = agruparPorMes([
    { nombre: 'Getxo', fecha: '2027-09-26' },
    { nombre: 'Bilbao Triathlon', fecha: null },
    { nombre: 'Bilbao-Bilbao', fecha: '2027-03-14' },
    { nombre: 'Lekeitio', fecha: '2027-06-20' },
    { nombre: 'Half Gasteiz', fecha: '2027-06-05' },
  ])
  assert.deepEqual(grupos.map((g) => g.clave), ['2027-03', '2027-06', '2027-09', 'sin-fecha'])
  assert.deepEqual(grupos[1].items.map((e) => e.nombre), ['Half Gasteiz', 'Lekeitio'])
})

test('filtrarEventos: activas excluye descartadas', () => {
  const ev = [{ estado: 'candidata' }, { estado: 'descartada' }, { estado: 'inscrito' }]
  assert.equal(filtrarEventos(ev, 'activas').length, 2)
  assert.equal(filtrarEventos(ev, 'todas').length, 3)
  assert.equal(filtrarEventos(ev, 'inscrito').length, 1)
})

test('proximasPruebas e inscripcionesPendientes para el resumen del coach', () => {
  const hoy = '2027-01-05'
  const ev = [
    { nombre: 'Pasada', fecha: '2026-12-01', estado: 'confirmada' },
    { nombre: 'Descartada', fecha: '2027-05-01', estado: 'descartada' },
    { nombre: 'Bibe', fecha: '2027-06-06', estado: 'candidata', inscripcion_antes: '2027-01-31' },
    { nombre: 'BB', fecha: '2027-03-14', estado: 'confirmada', inscripcion_antes: '2027-01-15' },
  ]
  assert.deepEqual(proximasPruebas(ev, hoy).map((e) => e.nombre), ['BB', 'Bibe'])
  assert.deepEqual(inscripcionesPendientes(ev, hoy).map((x) => x.evento.nombre), ['BB', 'Bibe'])
})

test('mesesTemporada cruza de año', () => {
  const m = mesesTemporada('2026-10-01')
  assert.equal(m.length, 12)
  assert.equal(m[0].clave, '2026-10')
  assert.equal(m[3].clave, '2027-01')
  assert.equal(m[11].clave, '2027-09')
})

test('eventoAFormulario convierte null en cadena vacía', () => {
  const f = eventoAFormulario({ nombre: 'X', deporte: 'run', prioridad: null, fecha_aprox: true })
  assert.equal(f.prioridad, '')
  assert.equal(f.fecha_aprox, true)
  assert.equal(f.notas, '')
})

test('textoAutoria distingue "Tú" del resto', () => {
  const now = new Date('2027-01-01T12:00:00Z')
  assert.equal(textoAutoria('a', { b: 'Jon' }, 'a', '2027-01-01T11:30:00Z', now), 'Tú · hace 30 min')
  assert.equal(textoAutoria('b', { b: 'Jon' }, 'a', '2027-01-01T09:00:00Z', now), 'Jon · hace 3 h')
})
