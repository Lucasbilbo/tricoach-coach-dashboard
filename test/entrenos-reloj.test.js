// Tests de lo que llega al reloj: `npm test` (node --test, sin dependencias).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { duracionTotalMin, ritmoValido, ritmosInvalidos } from '../src/components/workout/constants.js'

const require = createRequire(import.meta.url)
const { buildIntervalsText, cueSeguro, conPausas } = require('../netlify/functions/lib/intervals-text.cjs')
const { eventoBorrado } = require('../netlify/functions/lib/intervals-api.js')

const ses = (disciplina, bloques, extra = {}) => ({ disciplina, workout_steps: { bloques, notas: '', ...extra } })
const paso = (cantidad, unidad, objetivo_tipo = null, objetivo_valor = null, nombre = null, material = []) => ({
  cantidad, unidad, objetivo_tipo, objetivo_valor, nombre, material,
})

test('bici: zonas por pulso y sin potencia por defecto (no hay potenciómetro)', () => {
  const t = buildIntervalsText(ses('bike', [
    { tipo: 'warmup', ...paso(30, 'min', 'zona', 'Z1') },
    { tipo: 'step', ...paso(90, 'min', null, null, 'Tranquilo comodo') },
    { tipo: 'repeat', nombre: '', repeticiones: 3, pasos: [paso(8, 'min', 'zona', 'Z3'), paso(5, 'min', 'zona', 'Z1', 'Descanso')] },
  ]))
  assert.match(t, /- Calentamiento 30m Z1 HR/)
  assert.match(t, /- Tranquilo comodo 90m Z1 HR/)
  assert.match(t, /- 8m Z3 HR/)
  assert.doesNotMatch(t, / Z\d(?! HR)/) // ninguna zona sin "HR" (sería potencia)
})

test('carrera: rango de ritmo y zona de pulso', () => {
  const t = buildIntervalsText(ses('run', [
    { tipo: 'step', ...paso(50, 'min', 'ritmo', '4:50 - 5:10', 'Z2 alta') },
    { tipo: 'repeat', nombre: '', repeticiones: 5, pasos: [paso(1, 'km', 'zona', 'Z4'), paso(3, 'min', null, null, 'Descanso parado')] },
  ]))
  assert.match(t, /- Zona 2 alta 50m 4:50-5:10\/km Pace/)
  assert.match(t, /Serie 5x\n- 1km Z4 HR\n- Descanso parado 3m/)
})

test('natación: sin ritmo inventado y con el material de cada paso', () => {
  const t = buildIntervalsText(ses('swim', [
    { tipo: 'warmup', ...paso(500, 'mtr', null, null, '75 crol 25 otro') },
    { tipo: 'step', ...paso(200, 'mtr', null, null, 'Z1', ['palas']) },
    { tipo: 'step', ...paso(300, 'mtr', null, null, 'Z1', ['palas', 'aletas']) },
    { tipo: 'cooldown', ...paso(100, 'mtr', null, null, 'Suave') },
  ], { piscina: '50' }))
  assert.doesNotMatch(t, /Pace/)
  assert.match(t, /- Calentamiento · 75 crol 25 otro 500mtr/)
  assert.match(t, /- Zona 1 · palas 200mtr/)
  assert.match(t, /- Zona 1 · palas, aletas 300mtr/)
  assert.match(t, /- Vuelta a la calma · Suave 100mtr/)
})

test('las notas del entrenador nunca van al reloj', () => {
  const s = ses('run', [{ tipo: 'step', ...paso(30, 'min', 'zona', 'Z2') }])
  s.workout_steps.notas = 'secreto'
  assert.doesNotMatch(buildIntervalsText(s), /secreto/)
  assert.match(buildIntervalsText(s, { incluirNotas: true }), /secreto/)
})

test('ritmoValido acepta exacto y rango, rechaza formatos raros', () => {
  for (const ok of ['5:00', '4:50-5:10', '4:50 - 5:10', '1:45-1:50']) assert.equal(ritmoValido(ok), true, ok)
  for (const ko of ['5.30', '5:75', '5', 'rápido', '']) assert.equal(ritmoValido(ko), false, ko)
  assert.deepEqual(ritmosInvalidos([{ tipo: 'repeat', pasos: [paso(1, 'km', 'ritmo', '4.30')] }]), ['4.30'])
})

test('duracionTotalMin: suma por tiempo y null si hay distancia', () => {
  const cambios = [
    { tipo: 'warmup', ...paso(15, 'min') },
    { tipo: 'repeat', repeticiones: 8, pasos: [paso(1, 'min'), paso(1, 'min')] },
    { tipo: 'cooldown', ...paso(10, 'min') },
  ]
  assert.equal(duracionTotalMin(cambios), 41)
  assert.equal(duracionTotalMin([{ tipo: 'repeat', repeticiones: 10, pasos: [paso(20, 's'), paso(100, 's')] }]), 20)
  assert.equal(duracionTotalMin([{ tipo: 'step', ...paso(400, 'mtr') }]), null)
  assert.equal(duracionTotalMin([]), null)
})

test('eventoBorrado: 2xx y 404 cuentan como borrado', () => {
  assert.equal(eventoBorrado({ status: 200 }), true)
  assert.equal(eventoBorrado({ status: 404 }), true)
  assert.equal(eventoBorrado({ status: 500 }), false)
  assert.equal(eventoBorrado({ status: 0 }), false)
})

test('el texto del paso (nombre + material) va ANTES de la distancia: Intervals solo lee ese cue', () => {
  const t = buildIntervalsText({
    disciplina: 'swim',
    workout_steps: { bloques: [{ tipo: 'step', nombre: 'Pies', unidad: 'mtr', cantidad: 200, material: ['aletas', 'tabla'] }] },
  })
  assert.equal(t, '- Pies · aletas, tabla · pulsa vuelta al acabar 200mtr press lap')
})

test('el cue no cuela órdenes a Intervals (zonas, duraciones, ritmos, repeticiones)', () => {
  assert.equal(cueSeguro('Z4 fuerte', 'swim'), 'Zona 4 fuerte')
  assert.equal(cueSeguro('Trote 10m', 'run'), 'Trote 10 minutos')
  assert.equal(cueSeguro('cada 2x50m a 1:45', 'swim'), 'cada 2 veces 50 metros a 1.45')
  assert.equal(cueSeguro('al 75% @tope', 'run'), 'al 75 por ciento tope')
  assert.equal(cueSeguro('Como siempre 75 c 25 otro', 'swim'), 'Como siempre 75 c 25 otro')
})

test('natación: pausa en cada cambio de bloque; con material indica qué ponerse o quitarse', () => {
  const t = buildIntervalsText({
    disciplina: 'swim',
    workout_steps: {
      bloques: [
        { tipo: 'warmup', unidad: 'mtr', cantidad: 400, material: [] },
        { tipo: 'step', nombre: 'Pies', unidad: 'mtr', cantidad: 200, material: ['aletas', 'tabla'] },
        { tipo: 'step', unidad: 'mtr', cantidad: 200, material: ['tabla', 'aletas'] },
        { tipo: 'step', unidad: 'mtr', cantidad: 300, material: ['palas'] },
        { tipo: 'cooldown', unidad: 'mtr', cantidad: 200, material: [] },
      ],
    },
  })
  assert.equal(t.match(/15s press lap intensity=rest/g).length, 4) // poner aletas+tabla, siguiente (mismo material), cambiar a palas, quitar
  assert.match(t, /- Siguiente: 200 metros Pies · aletas, tabla 15s press lap intensity=rest\n\n- Pies · aletas, tabla · pulsa vuelta al acabar 200mtr press lap/)
  assert.match(t, /- Quita el material · Siguiente: 200 metros 15s press lap intensity=rest\n\n- Vuelta a la calma 200mtr/)
})

test('pausa dentro de una serie con material alterno, una vez por repetición', () => {
  const [serie] = conPausas(
    [{ tipo: 'repeat', repeticiones: 3, pasos: [{ cantidad: 100, unidad: 'mtr', material: ['pull buoy'] }, { cantidad: 100, unidad: 'mtr', material: [] }] }],
    'swim',
  )
  assert.deepEqual(serie.pasos.map((p) => p.tipo || 'paso'), ['pausa', 'paso', 'pausa', 'paso'])
})

test('natación: pausa "Siguiente" entre bloques aunque no cambie el material', () => {
  const bloques = [{ tipo: 'warmup', cantidad: 400, unidad: 'mtr', material: [] }, { tipo: 'step', cantidad: 200, unidad: 'mtr', material: [] }]
  const r = conPausas(bloques, 'swim')
  assert.deepEqual(r.map((b) => b.tipo), ['warmup', 'pausa', 'step'])
  assert.equal(r[1].cambiaMaterial, false)
  assert.match(buildIntervalsText({ disciplina: 'swim', workout_steps: { bloques } }), /- Siguiente: 200 metros 15s press lap intensity=rest/)
})

test('natación: sin pausa extra si ya hay descanso (serie que acaba en descanso), salvo cambio de material', () => {
  const serie = { tipo: 'repeat', repeticiones: 4, pasos: [{ cantidad: 100, unidad: 'mtr', material: [] }, { nombre: 'Descanso', cantidad: 20, unidad: 's', material: [] }] }
  const sinCambio = conPausas([serie, { tipo: 'step', cantidad: 200, unidad: 'mtr', material: [] }], 'swim')
  assert.deepEqual(sinCambio.map((b) => b.tipo), ['repeat', 'step'])
  const conCambio = conPausas([serie, { tipo: 'step', cantidad: 200, unidad: 'mtr', material: ['aletas'] }], 'swim')
  assert.deepEqual(conCambio.map((b) => b.tipo), ['repeat', 'pausa', 'step'])
  // dentro de la serie no se añade nada: ya tiene su descanso
  assert.equal(sinCambio[0].pasos.length, 2)
  // entrar en una serie desde un paso sin descanso sí lleva pausa
  assert.deepEqual(conPausas([{ tipo: 'warmup', cantidad: 400, unidad: 'mtr', material: [] }, serie], 'swim').map((b) => b.tipo), ['warmup', 'pausa', 'repeat'])
})

test('fuera de natación no hay pausas', () => {
  const bici = [{ tipo: 'step', cantidad: 10, unidad: 'min', material: [] }, { tipo: 'step', cantidad: 5, unidad: 'min', material: ['rodillo'] }]
  assert.equal(conPausas(bici, 'bike').length, 2)
})

test('natación: los descansos son descanso NATIVO de Garmin (cuenta atrás), no tiempo nadando', () => {
  const t = buildIntervalsText({
    disciplina: 'swim',
    workout_steps: { bloques: [{ tipo: 'repeat', repeticiones: 4, nombre: '', pasos: [
      { cantidad: 100, unidad: 'mtr', objetivo_tipo: 'zona', objetivo_valor: 'Z3', material: [] },
      { nombre: 'Descanso', cantidad: 20, unidad: 's', material: [] },
    ] }] },
  })
  assert.match(t, /- 100mtr Z3 Pace\n- Descanso 20s intensity=rest/)
  // paso por segundos sin nombre ni objetivo dentro de una serie = descanso
  const t2 = buildIntervalsText({ disciplina: 'swim', workout_steps: { bloques: [{ tipo: 'repeat', repeticiones: 2, nombre: '', pasos: [
    { cantidad: 50, unidad: 'mtr', material: [] }, { cantidad: 15, unidad: 's', material: [] },
  ] }] } })
  assert.match(t2, /- 15s intensity=rest/)
  // en carrera no se toca (el descanso activo es intencionado)
  const run = buildIntervalsText({ disciplina: 'run', workout_steps: { bloques: [{ tipo: 'step', nombre: 'Descanso', cantidad: 2, unidad: 'min', material: [] }] } })
  assert.doesNotMatch(run, /intensity=rest/)
})

test('la pausa dice qué viene después (con material y series)', () => {
  const { textoPausa } = require('../netlify/functions/lib/intervals-text.cjs')
  const r = conPausas([
    { tipo: 'step', cantidad: 200, unidad: 'mtr', nombre: 'Pies', material: ['aletas', 'tabla'] },
    { tipo: 'repeat', repeticiones: 4, nombre: '', pasos: [{ cantidad: 100, unidad: 'mtr', objetivo_tipo: 'ritmo', objetivo_valor: '1:45', material: [] }, { nombre: 'Descanso', cantidad: 20, unidad: 's', material: [] }] },
  ], 'swim')
  assert.equal(textoPausa(r[1]), 'Quita el material · Siguiente: 4x 100m 1:45')
})

test('técnica/pies: tabla o nombre (pies, patada, técnica, drill) → acaba al pulsar vuelta', () => {
  const { esTecnica, metrosTecnica } = require('../netlify/functions/lib/intervals-text.cjs')
  assert.equal(esTecnica({ nombre: 'Pies', material: ['aletas'] }), true)
  assert.equal(esTecnica({ nombre: 'Suave', material: ['tabla'] }), true)
  assert.equal(esTecnica({ nombre: 'Técnica crol', material: [] }), true)
  assert.equal(esTecnica({ nombre: '6/3/6 drill', material: [] }), true)
  assert.equal(esTecnica({ nombre: 'Progresivo', material: ['palas'] }), false)
  assert.equal(esTecnica({ nombre: 'Despiés', material: [] }), false)
  const t = buildIntervalsText({ disciplina: 'swim', workout_steps: { bloques: [{ tipo: 'step', nombre: 'Pies', cantidad: 200, unidad: 'mtr', material: ['aletas', 'tabla'] }] } })
  assert.equal(t, '- Pies · aletas, tabla · pulsa vuelta al acabar 200mtr press lap')
  // en carrera, "pies" no cambia nada
  assert.doesNotMatch(buildIntervalsText({ disciplina: 'run', workout_steps: { bloques: [{ tipo: 'step', nombre: 'Pies', cantidad: 10, unidad: 'min', material: [] }] } }), /press lap/)
  assert.equal(metrosTecnica({ bloques: [
    { tipo: 'step', nombre: 'Pies', cantidad: 200, unidad: 'mtr', material: ['tabla'] },
    { tipo: 'repeat', repeticiones: 4, pasos: [{ nombre: 'técnica', cantidad: 50, unidad: 'mtr', material: [] }, { nombre: 'Descanso', cantidad: 15, unidad: 's', material: [] }] },
    { tipo: 'step', nombre: 'Z2', cantidad: 400, unidad: 'mtr', material: [] },
  ] }), 400)
})

test('el panel suma a la natación del día los metros de técnica de la sesión (una vez)', () => {
  const { sumarTecnica } = require('../netlify/functions/lib/tecnica.js')
  const ses = [{ disciplina: 'swim', fecha: '2026-10-02', workout_steps: { bloques: [{ tipo: 'step', nombre: 'Pies', cantidad: 200, unidad: 'mtr', material: ['tabla'] }] } }]
  const acts = [
    { disciplina: 'swim', fecha: '2026-10-02', distancia_km: 1.4 },
    { disciplina: 'swim', fecha: '2026-10-02', distancia_km: 0.5 },
    { disciplina: 'run', fecha: '2026-10-02', distancia_km: 8 },
  ]
  sumarTecnica(acts, ses)
  assert.deepEqual(acts.map((a) => a.distancia_km), [1.6, 0.5, 8])
  assert.equal(acts[0].metros_tecnica, 200)
  assert.equal(acts[1].metros_tecnica, undefined)
})
