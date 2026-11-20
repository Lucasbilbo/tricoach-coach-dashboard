import { test } from 'node:test'
import assert from 'node:assert/strict'
import metrics from '../netlify/functions/lib/metrics.js'
import potenciaLib from '../netlify/functions/lib/potencia.js'

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

test('ajustes de carga: fuente única (fila → potenciómetro, FTP solo con interruptor, FC umbral)', async () => {
  const { ajustesDeFila, leerAjustes } = potenciaLib
  assert.deepEqual(ajustesDeFila(null), { potenciometro: false, ftp: null, fcUmbral: null })
  assert.deepEqual(ajustesDeFila({ potenciometro: false, ftp_w: 250, fc_umbral: 168 }), { potenciometro: false, ftp: null, fcUmbral: 168 })
  assert.deepEqual(ajustesDeFila({ potenciometro: true, ftp_w: 250, fc_umbral: null }), { potenciometro: true, ftp: 250, fcUmbral: null })
  let pedido = ''
  const r = await leerAjustes(async (p) => { pedido = p; return [{ potenciometro: true, ftp_w: 230 }] }, 'abc')
  assert.match(pedido, /^atleta_potencia\?athlete_id=eq\.abc&select=potenciometro,ftp_w,fc_umbral$/)
  assert.equal(r.ftp, 230)
  // Si la lectura falla no lanza: todo por pulso
  assert.deepEqual(await leerAjustes(async () => { throw new Error('x') }, 'abc'), { potenciometro: false, ftp: null, fcUmbral: null })
})

test('pulso con FC umbral del atleta y potencia en la misma escala', () => {
  // 1 h a la FC umbral del atleta (165) = 100, igual que 1 h a FTP
  assert.equal(Math.round(cargaActividad(3600, 165, 190, 'bike', null, 165).tss), 100)
  assert.equal(Math.round(cargaActividad(3600, 165, 190, 'bike', { np: 250, ftp: 250, medidor: true }, 165).tss), 100)
})

test('detalle de actividad: con potencia real enseña también el TSS por pulso y la eficiencia', async () => {
  const { default: det } = await import('../netlify/functions/coach-activity-detail.js')
  const act = { sport_type: 'Ride', moving_time: 3600, average_heartrate: 150, weighted_average_watts: 200, device_watts: true, start_date: '2026-11-20T08:00:00Z' }
  const a = det._transformarActividad(act, 190, { ftp: 200, fcUmbral: 150 })
  assert.equal(a.tss_estimado, 100)
  assert.equal(a.tss_por_potencia, true)
  assert.equal(a.tss_pulso, 100)
  assert.equal(a.eficiencia, 1.33)
  // Sin medidor: TSS por pulso, sin eficiencia ni doble TSS
  const b = det._transformarActividad({ ...act, device_watts: false }, 190, { ftp: 200, fcUmbral: 150 })
  assert.equal(b.tss_por_potencia, false)
  assert.equal(b.tss_pulso, null)
  assert.equal(b.eficiencia, null)
})
