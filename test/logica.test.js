// Lógica pura de métricas: TSS/zonas, carga EWMA, agrupación semanal, fechas
// Europe/Madrid y stats del análisis. Casos reales + bordes (umbrales, DST,
// semanas vacías, domingos). Sin red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { computeCargaDiaria, computeCargaHoy } from '../src/lib/carga.js'
import { lunesDeSemana, sumarDias, decimalToRitmo, ritmoToDecimal, formatFechaCorta, formatHorasMin } from '../src/lib/chartUtils.js'
import { computePaceTrend, buildTransitionColumns, computeZonas, computeResumenStats } from '../src/lib/athleteStats.js'

const require = createRequire(import.meta.url)
const M = require('../netlify/functions/lib/metrics.js')
const { agruparSemanas } = require('../netlify/functions/lib/semanas.js')
const { _semanasRecientes } = require('../netlify/functions/coach-dashboard-data.js')

const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`)

// ── metrics ─────────────────────────────────────────────────────────────
test('mapDisciplina: tipos reales de Strava', () => {
  const casos = {
    Run: 'run', TrailRun: 'run', VirtualRun: 'run',
    Ride: 'bike', VirtualRide: 'bike', GravelRide: 'bike', MountainBikeRide: 'bike', EBikeRide: 'bike', Velomobile: 'bike',
    Swim: 'swim',
    WeightTraining: 'strength', Crossfit: 'strength', Workout: 'strength',
    Golf: 'other', Walk: 'other', Hike: 'other', Yoga: 'other', Rowing: 'other',
    '': 'other', undefined: 'other',
  }
  for (const [tipo, esperado] of Object.entries(casos)) {
    assert.equal(M.mapDisciplina(tipo === 'undefined' ? undefined : tipo), esperado, tipo)
  }
})

test('zonaFc: umbrales exactos, sin redondear antes (79.96 % es Z3)', () => {
  assert.equal(M.zonaFc(59.99), 'Z1')
  assert.equal(M.zonaFc(60), 'Z2')
  assert.equal(M.zonaFc(79.96), 'Z3')
  assert.equal(M.zonaFc(80), 'Z4')
  assert.equal(M.zonaFc(90), 'Z5')
  assert.equal(M.zonaFc(null), null)
  // 147.93 ppm / 185 = 79.96 %: con la intensidad sin redondear sigue en Z3
  assert.equal(M.zonaFc(M.intensidadPct(147.93, 185)), 'Z3')
})

test('intensidadPct: sin FC → null; FC máx 0/ausente → 185 por defecto', () => {
  assert.equal(M.intensidadPct(null, 190), null)
  cerca(M.intensidadPct(185, 0), 100)
  cerca(M.intensidadPct(185, undefined), 100)
  cerca(M.intensidadPct(150, 200), 75)
})

test('hrTSS: 1 h a la FC máx = 100; 1 h al 75 % = 56.25; sin FC o duración → null', () => {
  cerca(M.tssEstimado(3600, 185, 185), 100)
  cerca(M.tssEstimado(3600, 150, 200), 56.25)
  assert.equal(M.tssEstimado(3600, null, 185), null)
  assert.equal(M.tssEstimado(0, 150, 185), null)
})

test('cargaActividad: con FC, sin FC (estimado por disciplina) y "other"', () => {
  assert.deepEqual(M.cargaActividad(3600, 150, 200, 'run'), { tss: 56.25, estimado: false })
  for (const [disc, porHora] of Object.entries(M.TSS_POR_HORA_SIN_FC)) {
    const r = M.cargaActividad(1800, null, 185, disc)
    assert.equal(r.estimado, true)
    cerca(r.tss, porHora / 2)
  }
  assert.deepEqual(M.cargaActividad(3600, 150, 185, 'other'), { tss: null, estimado: false })
  assert.deepEqual(M.cargaActividad(0, null, 185, 'run'), { tss: null, estimado: false })
})

test('fechaMadrid: el día sale del instante UTC en hora de Madrid (verano e invierno)', () => {
  // Verano (UTC+2): 22:30 UTC del domingo ya es lunes en Madrid
  assert.equal(M.fechaMadrid(new Date('2026-10-04T22:30:00Z')), '2026-10-05')
  assert.equal(M.fechaMadrid(new Date('2026-10-04T21:59:00Z')), '2026-10-04')
  // Invierno (UTC+1)
  assert.equal(M.fechaMadrid(new Date('2026-12-31T23:30:00Z')), '2027-01-01')
  assert.equal(M.fechaMadrid(new Date('2026-12-31T22:30:00Z')), '2026-12-31')
  // Noche del cambio de hora (25 oct 2026, 03:00 → 02:00)
  assert.equal(M.fechaMadrid(new Date('2026-10-25T22:30:00Z')), '2026-10-25')
  assert.equal(M.fechaMadrid(new Date('2026-10-25T23:30:00Z')), '2026-10-26')
})

test('round: null/NaN → null; redondeo normal', () => {
  assert.equal(M.round(null, 1), null)
  assert.equal(M.round(NaN, 1), null)
  assert.equal(M.round(1.25, 1), 1.3)
  assert.equal(M.round(5.555, 2), 5.56)
})

// ── carga EWMA ──────────────────────────────────────────────────────────
test('EWMA: un día de 100 TSS da ATL=100·(1−e^−1/7) y CTL=100·(1−e^−1/42) ese día', () => {
  const dias = computeCargaDiaria([{ fecha: '2026-10-01', tss_estimado: 100 }], '2026-10-01')
  assert.equal(dias.length, 1)
  cerca(dias[0].atl, 100 * (1 - Math.exp(-1 / 7)))
  cerca(dias[0].ctl, 100 * (1 - Math.exp(-1 / 42)))
})

test('EWMA: la carga decae hasta HOY aunque no haya actividad reciente', () => {
  const acts = [{ fecha: '2026-09-01', tss_estimado: 100 }]
  const ayer = computeCargaHoy(acts, '2026-09-10')
  const hoy = computeCargaHoy(acts, '2026-09-30')
  assert.ok(hoy.atl < ayer.atl && hoy.ctl < ayer.ctl)
  const dias = computeCargaDiaria(acts, '2026-09-30')
  assert.equal(dias.length, 30)
  assert.equal(dias[dias.length - 1].fecha, '2026-09-30')
})

test('EWMA: misma fecha se suma; TSS null se ignora; orden de entrada irrelevante', () => {
  const a = computeCargaHoy([
    { fecha: '2026-09-02', tss_estimado: 40 },
    { fecha: '2026-09-01', tss_estimado: 60 },
    { fecha: '2026-09-02', tss_estimado: 20 },
    { fecha: '2026-09-02', tss_estimado: null },
  ], '2026-09-05')
  const b = computeCargaHoy([{ fecha: '2026-09-01', tss_estimado: 60 }, { fecha: '2026-09-02', tss_estimado: 60 }], '2026-09-05')
  assert.deepEqual(a, b)
})

test('EWMA: sin datos o con hoy anterior a la primera actividad → vacío', () => {
  assert.deepEqual(computeCargaDiaria([], '2026-10-01'), [])
  assert.deepEqual(computeCargaHoy([], '2026-10-01'), { ctl: null, atl: null, tsb: null })
  assert.deepEqual(computeCargaDiaria([{ fecha: '2026-10-05', tss_estimado: 50 }], '2026-10-01'), [])
})

test('EWMA: carga constante converge a ese valor (CTL≈ATL≈TSS diario, TSB≈0)', () => {
  const acts = []
  for (let i = 0; i < 400; i++) acts.push({ fecha: sumarDias('2025-01-01', i), tss_estimado: 60 })
  const r = computeCargaHoy(acts, sumarDias('2025-01-01', 399))
  assert.equal(r.ctl, 60)
  assert.equal(r.atl, 60)
  assert.equal(r.tsb, 0)
})

// ── agrupación semanal ──────────────────────────────────────────────────
const act = (fecha, disciplina, extra = {}) => ({ fecha, disciplina, distancia_km: 10, duracion_min: 60, tss_estimado: 50, ...extra })

test('agruparSemanas: rellena las semanas vacías (lesión/vacaciones) a cero', () => {
  const s = agruparSemanas([act('2026-09-01', 'run'), act('2026-09-22', 'bike')], { desde: '2026-09-01', hasta: '2026-10-08' })
  assert.deepEqual(s.map((x) => x.semana), ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'])
  assert.deepEqual(s.map((x) => x.tss_total), [50, 0, 0, 50, 0, 0])
  assert.equal(s[1].n_sesiones, 0)
})

test('agruparSemanas: el domingo es de la semana del lunes anterior; "other" no cuenta', () => {
  const s = agruparSemanas([act('2026-10-04', 'run'), act('2026-10-05', 'swim'), act('2026-10-05', 'other')])
  assert.equal(s.length, 2)
  assert.equal(s[0].semana, '2026-09-28')
  assert.equal(s[0].km_run, 10)
  assert.equal(s[1].semana, '2026-10-05')
  assert.equal(s[1].km_swim, 10)
  assert.equal(s[1].n_sesiones, 1)
})

test('agruparSemanas: suma por disciplina y redondea; sin rango ni datos → []', () => {
  const s = agruparSemanas([
    act('2026-10-06', 'run', { distancia_km: 5.04, duracion_min: 25, tss_estimado: 30.4 }),
    act('2026-10-07', 'run', { distancia_km: 5.04, duracion_min: 26, tss_estimado: 30.4 }),
    act('2026-10-07', 'bike', { distancia_km: 40.06, duracion_min: 80, tss_estimado: 70.3 }),
  ])
  assert.equal(s.length, 1)
  assert.equal(s[0].km_run, 10.1)
  assert.equal(s[0].km_bike, 40.1)
  assert.equal(s[0].horas_totales, 2.2)
  assert.equal(s[0].tss_total, 131)
  assert.deepEqual(agruparSemanas([]), [])
  assert.deepEqual(agruparSemanas(null), [])
})

test('sparkline del dashboard: 4 semanas de calendario hasta hoy, también si el atleta paró', () => {
  const strava = (iso, tipo, min, fc) => ({ start_date: iso, sport_type: tipo, moving_time: min * 60, average_heartrate: fc })
  // Atleta parado desde agosto: el sparkline debe ser 0,0,0,0 (antes: semanas de agosto)
  const parado = _semanasRecientes([strava('2026-08-10T08:00:00Z', 'Run', 60, 150)], 185, 4, '2026-10-08')
  assert.deepEqual(parado.map((s) => s.semana), ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'])
  assert.deepEqual(parado.map((s) => s.tss_total), [0, 0, 0, 0])
  // 22:30 UTC del domingo 4-oct es lunes 5 en Madrid → semana actual
  const r = _semanasRecientes([strava('2026-10-04T22:30:00Z', 'Run', 60, 185), strava('2026-10-01T08:00:00Z', 'Golf', 120, 120)], 185, 4, '2026-10-08')
  assert.deepEqual(r.map((s) => s.tss_total), [0, 0, 0, 100])
})

// ── fechas y formato (frontend) ─────────────────────────────────────────
test('lunesDeSemana y sumarDias: domingos, cambio de mes/año y de hora', () => {
  assert.equal(lunesDeSemana('2026-10-04'), '2026-09-28') // domingo
  assert.equal(lunesDeSemana('2026-10-05'), '2026-10-05') // lunes
  assert.equal(lunesDeSemana('2027-01-01'), '2026-12-28')
  assert.equal(sumarDias('2026-10-24', 2), '2026-10-26') // atraviesa el cambio de hora
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01')
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28')
})

test('ritmos: 4.999 → 5:00 (sin 4:60); "5:14" ⇄ decimal; basura → null/—', () => {
  assert.equal(decimalToRitmo(4.999), '5:00')
  assert.equal(decimalToRitmo(5 + 14 / 60), '5:14')
  assert.equal(decimalToRitmo(null), '—')
  cerca(ritmoToDecimal('5:14'), 5 + 14 / 60)
  assert.equal(ritmoToDecimal('x:y'), null)
  assert.equal(ritmoToDecimal(null), null)
  assert.equal(formatFechaCorta('2026-10-08'), 'Oct 8')
  assert.equal(formatHorasMin(2.25), '2h 15m')
})

// ── stats del análisis ──────────────────────────────────────────────────
test('ritmo semanal ponderado por distancia (un trote corto no pesa como la tirada larga)', () => {
  const t = computePaceTrend([
    { fecha: '2026-10-06', disciplina: 'run', ritmo_min_km: 6, distancia_km: 2 },
    { fecha: '2026-10-07', disciplina: 'run', ritmo_min_km: 5, distancia_km: 18 },
  ])
  assert.equal(t.length, 1)
  assert.equal(t[0].pace, '5:06') // (12 + 90) / 20 = 5.1 min/km; la media simple daría 5:30
})

test('Línea de Transición: excluye "other" y la semana vacía sale con —', () => {
  const cols = buildTransitionColumns(
    [act('2026-09-29', 'run'), act('2026-09-30', 'other', { duracion_min: 240 })],
    [{ semana: '2026-09-28' }, { semana: '2026-10-05' }]
  )
  assert.equal(cols[0].statusLabel, '1h 0m')
  assert.equal(cols[0].segments.length, 1)
  assert.equal(cols[1].statusLabel, '—')
  assert.equal(cols[1].isToday, true)
})

test('zonas FC: minutos por zona relativos a la zona máxima; sin FC → []', () => {
  const z = computeZonas([
    { zona_fc: 'Z2', duracion_min: 90 },
    { zona_fc: 'Z4', duracion_min: 30 },
    { zona_fc: null, duracion_min: 60 },
  ])
  assert.equal(z.find((x) => x.label === 'Z2').pct, 100)
  assert.equal(z.find((x) => x.label === 'Z4').pct, 33)
  assert.deepEqual(computeZonas([{ zona_fc: null, duracion_min: 60 }]), [])
})

test('resumen: el volumen no cuenta "other"; ritmo de la última carrera', () => {
  const r = computeResumenStats([
    { fecha: '2026-10-01', disciplina: 'run', duracion_min: 60, ritmo_min_km: 5.5, tss_estimado: 60 },
    { fecha: '2026-10-03', disciplina: 'run', duracion_min: 30, ritmo_min_km: 5, tss_estimado: 40 },
    { fecha: '2026-10-02', disciplina: 'other', duracion_min: 240, tss_estimado: null },
  ])
  assert.equal(r.volumen, '1h 30m')
  assert.equal(r.ritmoUltima, '5:00')
  assert.equal(r.tssAcum, 100)
})

test('límites de Strava: holgados para el uso real y por debajo de la cuota', () => {
  const { LIMITES } = require('../netlify/functions/lib/rate-limit.js')
  for (const l of Object.values(LIMITES)) {
    assert.equal(l.ventana, 900)
    assert.ok(l.max >= 30, 'abrir varios atletas y cambiar el selector no debe bloquear')
  }
})
