// FC máxima del atleta: validación compartida por set-fc-max y el formulario.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { validarFcMax, FC_MAX_MIN, FC_MAX_MAX } = require('../netlify/functions/lib/fc-max.cjs')

test('validarFcMax: enteros dentro del rango (número o texto)', () => {
  assert.equal(validarFcMax(192), 192)
  assert.equal(validarFcMax('185'), 185)
  assert.equal(validarFcMax(' 199 '), 199)
  assert.equal(validarFcMax(FC_MAX_MIN), FC_MAX_MIN)
  assert.equal(validarFcMax(FC_MAX_MAX), FC_MAX_MAX)
})

test('validarFcMax: rechaza vacío, no numéricos, decimales y fuera de rango', () => {
  for (const malo of ['', '  ', null, undefined, 'abc', NaN, 185.5, '185.5', 119, 231, 0, -190, true, [], {}]) {
    assert.equal(validarFcMax(malo), null, `debería rechazar ${JSON.stringify(malo)}`)
  }
})
