import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  periodoSemanas,
  periodoSemana,
  periodoSemanaPasada,
  periodoRango,
  periodoRangoPorDefecto,
  normalizarRango,
  moverSemana,
  rangoDe,
  terminaHoy,
  esVistaDiaria,
  semanasCarga,
  etiquetaPeriodo,
  claveArchivo,
  limiteMinimo,
  diasEntre,
} from '../src/lib/periodo.js'

const HOY = '2026-11-17' // martes

test('preset: rango = últimas N semanas hasta hoy', () => {
  assert.deepEqual(rangoDe(periodoSemanas(8), HOY), { desde: '2026-09-22', hasta: HOY })
  assert.equal(terminaHoy(periodoSemanas(4), HOY), true)
})

test('semana: lunes→domingo; la semana en curso se corta en hoy', () => {
  assert.deepEqual(periodoSemana('2026-10-14', HOY), { tipo: 'semana', desde: '2026-10-12', hasta: '2026-10-18' })
  assert.deepEqual(periodoSemana('2026-11-17', HOY), { tipo: 'semana', desde: '2026-11-16', hasta: '2026-11-17' })
  assert.equal(terminaHoy(periodoSemana('2026-11-17', HOY), HOY), true)
  assert.equal(terminaHoy(periodoSemana('2026-10-14', HOY), HOY), false)
})

test('semana pasada por defecto: completa, lunes a domingo', () => {
  assert.deepEqual(periodoSemanaPasada(HOY), { tipo: 'semana', desde: '2026-11-09', hasta: '2026-11-15' })
})

test('moverSemana: atrás y adelante, sin pasar de la semana actual', () => {
  const pasada = periodoSemanaPasada(HOY)
  assert.deepEqual(moverSemana(pasada, -1, HOY), { tipo: 'semana', desde: '2026-11-02', hasta: '2026-11-08' })
  assert.deepEqual(moverSemana(pasada, 1, HOY), { tipo: 'semana', desde: '2026-11-16', hasta: '2026-11-17' })
  assert.equal(moverSemana(moverSemana(pasada, 1, HOY), 1, HOY), null) // futuro
  assert.equal(moverSemana(periodoSemanas(8), 1, HOY), null) // no es una semana
})

test('moverSemana: no sale de las 52 semanas que sirve el backend', () => {
  let p = periodoSemana(HOY, HOY)
  let pasos = 0
  while (moverSemana(p, -1, HOY)) {
    p = moverSemana(p, -1, HOY)
    pasos++
  }
  assert.equal(pasos, 52)
  assert.ok(p.hasta >= limiteMinimo(HOY))
})

test('normalizarRango: ordena, recorta al futuro y al límite, rechaza lo incompleto', () => {
  assert.deepEqual(normalizarRango('2026-10-20', '2026-10-05', HOY), { desde: '2026-10-05', hasta: '2026-10-20' })
  assert.deepEqual(normalizarRango('2026-11-01', '2027-01-01', HOY), { desde: '2026-11-01', hasta: HOY })
  assert.deepEqual(normalizarRango('2020-01-01', '2026-11-01', HOY), { desde: limiteMinimo(HOY), hasta: '2026-11-01' })
  assert.equal(normalizarRango('', '2026-11-01', HOY), null)
  assert.equal(normalizarRango('2026-02-30', '2026-11-01', HOY), null) // fecha imposible
  assert.equal(normalizarRango('2027-01-01', '2027-02-01', HOY), null) // todo en el futuro
  assert.equal(normalizarRango('2019-01-01', '2019-02-01', HOY), null) // todo más allá del límite
  assert.equal(periodoRango('', '', HOY), null)
})

test('vista diaria: hasta 14 días en semana/rango; nunca en presets', () => {
  assert.equal(esVistaDiaria(periodoSemanaPasada(HOY), HOY), true)
  assert.equal(esVistaDiaria(periodoRango('2026-11-01', '2026-11-14', HOY), HOY), true) // 14 días
  assert.equal(esVistaDiaria(periodoRango('2026-11-01', '2026-11-15', HOY), HOY), false) // 15 días
  assert.equal(esVistaDiaria(periodoSemanas(4), HOY), false)
})

test('semanasCarga: 26 con presets; en rangos viejos, calentamiento antes del inicio con tope 52', () => {
  assert.equal(semanasCarga(periodoSemanas(8), HOY), 26)
  // empieza hace 3 semanas → 3 + 26
  assert.equal(semanasCarga(periodoRango('2026-10-27', '2026-11-03', HOY), HOY), 29)
  // empieza hace ~40 semanas → tope
  assert.equal(semanasCarga(periodoRango('2026-02-10', '2026-02-20', HOY), HOY), 52)
})

test('etiquetas: preset, semana, rango, un solo día y año distinto', () => {
  assert.equal(etiquetaPeriodo(periodoSemanas(8), HOY), 'últimas 8 semanas')
  assert.equal(etiquetaPeriodo(periodoSemana('2026-10-14', HOY), HOY), '12 Oct – 18 Oct')
  assert.equal(etiquetaPeriodo(periodoRango('2026-10-14', '2026-10-14', HOY), HOY), '14 Oct')
  assert.equal(etiquetaPeriodo({ tipo: 'rango', desde: '2025-12-20', hasta: '2026-01-05' }, HOY), '20 Dic 2025 – 5 Ene')
})

test('nombre de archivo del CSV', () => {
  assert.equal(claveArchivo(periodoSemanas(8)), '8sem')
  assert.equal(claveArchivo(periodoSemana('2026-10-14', HOY)), '2026-10-12_2026-10-18')
})

test('rango por defecto: últimos 28 días', () => {
  const p = periodoRangoPorDefecto(HOY)
  assert.equal(diasEntre(p.desde, p.hasta) + 1, 28)
  assert.equal(p.hasta, HOY)
})
