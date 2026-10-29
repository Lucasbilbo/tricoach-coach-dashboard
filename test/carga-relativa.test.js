import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargaRelativa } from '../src/lib/cargaRelativa.js'

const sem = (...tss) => tss.map((t, i) => ({ semana: `w${i}`, tss_total: t }))

test('compara con la media de las 4 semanas completas anteriores (la actual no cuenta)', () => {
  const s = sem(100, 300, 300, 300, 300, 50) // última = semana en curso
  assert.equal(cargaRelativa(300, s).nivel, 'normal')
  assert.equal(cargaRelativa(300, s).media, 300)
  assert.equal(cargaRelativa(400, s).nivel, 'alta')
  assert.equal(cargaRelativa(200, s).nivel, 'baja')
})

test('mismo TSS, distinto atleta: 412 es alto para uno y normal para otro', () => {
  assert.equal(cargaRelativa(412, sem(250, 260, 240, 250, 0)).nivel, 'alta')
  assert.equal(cargaRelativa(412, sem(420, 400, 430, 410, 0)).nivel, 'normal')
})

test('sin base suficiente (menos de 3 semanas con datos) no opina', () => {
  assert.equal(cargaRelativa(300, sem(0, 0, 300, 300, 100)), null)
  assert.equal(cargaRelativa(300, []), null)
  assert.equal(cargaRelativa(null, sem(300, 300, 300, 300, 0)), null)
})

test('una semana de descanso entre las 4 cuenta (baja la media), pero sigue opinando', () => {
  const r = cargaRelativa(300, sem(400, 0, 400, 400, 0))
  assert.equal(r.media, 300)
  assert.equal(r.nivel, 'normal')
})
