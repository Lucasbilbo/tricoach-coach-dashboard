import { test } from 'node:test'
import assert from 'node:assert/strict'
import metrics from '../netlify/functions/lib/metrics.js'

const { cargaActividad, tssPotencia, potenciaDe } = metrics

test('TSS por potencia: 1 h a FTP = 100; 1 h a NP 75 % FTP = 56,25', () => {
  assert.equal(tssPotencia(3600, 200, 200), 100)
  assert.equal(tssPotencia(3600, 150, 200), 56.25)
})

test('sin FTP, sin NP o sin duración no hay TSS por potencia', () => {
  assert.equal(tssPotencia(3600, 200, null), null)
  assert.equal(tssPotencia(3600, null, 200), null)
  assert.equal(tssPotencia(0, 200, 200), null)
})

test('bici con medidor real y FTP: usa potencia; marca fuente', () => {
  const c = cargaActividad(3600, 140, 185, 'bike', { np: 200, ftp: 200, medidor: true })
  assert.equal(c.tss, 100)
  assert.equal(c.fuente, 'potencia')
})

test('potencia estimada por Strava (sin medidor) o sin FTP: cae al pulso', () => {
  const hr = cargaActividad(3600, 140, 185, 'bike')
  assert.deepEqual(cargaActividad(3600, 140, 185, 'bike', { np: 200, ftp: 200, medidor: false }), hr)
  assert.deepEqual(cargaActividad(3600, 140, 185, 'bike', { np: 200, ftp: null, medidor: true }), hr)
})

test('la potencia solo cuenta en bici', () => {
  const run = cargaActividad(3600, 150, 185, 'run')
  assert.deepEqual(cargaActividad(3600, 150, 185, 'run', { np: 200, ftp: 200, medidor: true }), run)
})

test('potenciaDe lee los campos de Strava', () => {
  assert.deepEqual(potenciaDe({ weighted_average_watts: 180, device_watts: true }, 250), { np: 180, ftp: 250, medidor: true })
})
