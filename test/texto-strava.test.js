import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textoParaStrava } from '../src/lib/textoStrava.js'

test('textoParaStrava: título, bloques, series y material', () => {
  const sesion = {
    workout_steps: {
      nombre: 'Series 8 km',
      bloques: [
        { tipo: 'warmup', cantidad: 15, unidad: 'min', objetivo_tipo: 'zona', objetivo_valor: 'Z1' },
        { tipo: 'repeat', repeticiones: 8, pasos: [
          { cantidad: 1, unidad: 'min', objetivo_tipo: 'zona', objetivo_valor: 'Z5' },
          { cantidad: 1, unidad: 'min', objetivo_tipo: 'zona', objetivo_valor: 'Z1' },
        ] },
        { tipo: 'pausa' },
        { cantidad: 100, unidad: 'mtr', nombre: 'Pies', material: ['aletas', 'tabla'] },
        { tipo: 'cooldown', cantidad: 10, unidad: 'min', objetivo_tipo: 'zona', objetivo_valor: 'Z1' },
      ],
      notas: 'NOTA PRIVADA',
    },
  }
  assert.equal(
    textoParaStrava(sesion),
    ['Series 8 km', 'Calentamiento: 15 min Z1', '8 × (1 min Z5 / 1 min Z1)', '100 m Pies (aletas, tabla)', 'Vuelta a la calma: 10 min Z1'].join('\n'),
  )
})

test('textoParaStrava: sin entreno devuelve solo el título o vacío', () => {
  assert.equal(textoParaStrava({ descripcion: 'Rodaje suave' }), 'Rodaje suave')
  assert.equal(textoParaStrava(null), '')
})
