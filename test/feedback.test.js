import { test } from 'node:test'
import assert from 'node:assert/strict'
import { admiteFeedback, etiquetaRpe, normalizarFeedback, resumenFeedback } from '../src/lib/feedback.js'

test('un formulario vacío no se guarda', () => {
  assert.equal(normalizarFeedback({}), null)
  assert.equal(normalizarFeedback({ comentario: '   ', molestias_texto: 'rodilla' }), null)
})

test('normaliza valores fuera de rango y recorta textos', () => {
  const f = normalizarFeedback({ rpe: 11, sensacion: 4, comentario: '  bien  ' })
  assert.deepEqual(f, { rpe: null, sensacion: 4, comentario: 'bien', molestias: false, molestias_texto: null })
  assert.equal(normalizarFeedback({ comentario: 'x'.repeat(900) }).comentario.length, 600)
})

test('el texto de molestias solo se guarda si hay molestias', () => {
  assert.equal(normalizarFeedback({ rpe: 5, molestias: false, molestias_texto: 'gemelo' }).molestias_texto, null)
  const f = normalizarFeedback({ molestias: true, molestias_texto: ' gemelo ' })
  assert.equal(f.molestias, true)
  assert.equal(f.molestias_texto, 'gemelo')
})

test('resumen corto y anclas de RPE', () => {
  assert.equal(resumenFeedback({ rpe: 7, sensacion: 4 }), 'RPE 7 · Bien')
  assert.equal(resumenFeedback({ sensacion: 1 }), 'Fatal')
  assert.equal(resumenFeedback(null), '')
  assert.equal(etiquetaRpe(10), 'Máximo')
  assert.equal(etiquetaRpe(0), '')
})

test('solo se cuenta cómo fue de hoy hacia atrás', () => {
  assert.equal(admiteFeedback({ fecha: '2026-10-22' }, '2026-10-22'), true)
  assert.equal(admiteFeedback({ fecha: '2026-10-21' }, '2026-10-22'), true)
  assert.equal(admiteFeedback({ fecha: '2026-10-23' }, '2026-10-22'), false)
})
