import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoEventoAntiguo } from '../src/lib/avisosReloj.js'

test('solo avisa si el backend dice que el evento viejo NO se retiró', () => {
  assert.equal(avisoEventoAntiguo({ ok: true, anterior_retirado: true }, '2026-11-03'), null)
  assert.equal(avisoEventoAntiguo({ ok: true }, '2026-11-03'), null) // sesión sin envío previo
  assert.equal(avisoEventoAntiguo(null, '2026-11-03'), null)
  const coach = avisoEventoAntiguo({ ok: true, anterior_retirado: false }, '2026-11-03')
  assert.match(coach, /antiguo del 3 nov/)
  assert.match(coach, /del atleta/)
  assert.match(avisoEventoAntiguo({ anterior_retirado: false }, '2026-11-03', 'atleta'), /tu calendario/)
  assert.doesNotMatch(avisoEventoAntiguo({ anterior_retirado: false }, null), /del undefined/)
})
