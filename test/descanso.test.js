import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esDescanso, pasoDescanso } from '../src/lib/descanso.js'
import { ESTADO, estadoDeSesion } from '../src/lib/estadoSesion.js'
import { nombrePorDefecto } from '../src/components/workout/resumen.js'

test('esDescanso solo para disciplina rest', () => {
  assert.equal(esDescanso({ disciplina: 'rest' }), true)
  assert.equal(esDescanso({ disciplina: 'run' }), false)
  assert.equal(esDescanso(null), false)
})

test('pasoDescanso: 30 s si hay segundos, 1 min si no', () => {
  assert.deepEqual(
    (({ cantidad, unidad, nombre }) => ({ cantidad, unidad, nombre }))(pasoDescanso(['mtr', 'km', 'min', 's'])),
    { cantidad: 30, unidad: 's', nombre: 'Descanso' },
  )
  const bici = pasoDescanso(['km', 'min', 'h'])
  assert.equal(bici.cantidad, 1)
  assert.equal(bici.unidad, 'min')
})

test('estado de un día de descanso: nunca pendiente ni completada', () => {
  const s = { disciplina: 'rest', fecha: '2026-11-01' }
  assert.equal(estadoDeSesion(s, undefined, '2026-11-24', '2026-10-01'), ESTADO.descanso)
  assert.equal(estadoDeSesion({ ...s, fecha: '2026-12-01' }, undefined, '2026-11-24', '2026-10-01'), ESTADO.descanso)
})

test('nombre por defecto del descanso', () => {
  assert.equal(nombrePorDefecto('rest', []), 'Descanso')
})
