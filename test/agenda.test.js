import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disciplinasALaHora, ventanaAgenda, colocarDia, sinHora, horasPosibles, validarMovimiento, ahoraMadrid, esMovible, ajustar, horaValida } from '../src/lib/agenda.js'
import { evaluarDisponibilidad, textoAviso } from '../src/lib/disponibilidad.js'

const AHORA = { fecha: '2026-10-22', min: 18 * 60 } // jueves 18:00

test('ahoraMadrid convierte a la hora de Madrid (verano e invierno)', () => {
  assert.deepEqual(ahoraMadrid(new Date('2026-10-22T16:05:00Z')), { fecha: '2026-10-22', min: 18 * 60 + 5 })
  assert.deepEqual(ahoraMadrid(new Date('2026-12-31T23:30:00Z')), { fecha: '2027-01-01', min: 30 })
})

test('mover: lo pasado se pierde', () => {
  const v = (origen, destino) => validarMovimiento({ origen, destino, ahora: AHORA }).code
  assert.equal(v({ fecha: '2026-10-21', hora: null }, { fecha: '2026-10-24', hora: 600 }), 'ORIGEN_PASADO')
  assert.equal(v({ fecha: '2026-10-23', hora: null }, { fecha: '2026-10-21', hora: 600 }), 'DESTINO_PASADO')
  assert.equal(v({ fecha: '2026-10-23', hora: null }, { fecha: '2026-10-22', hora: 13 * 60 }), 'HORA_PASADA')
  assert.equal(v({ fecha: '2026-10-22', hora: 1140 }, { fecha: '2026-10-22', hora: 1140 }), 'SIN_CAMBIOS')
  assert.equal(v({ fecha: '2026-10-22', hora: 600 }, { fecha: '2026-10-2x', hora: 600 }), 'FECHA_INVALIDA')
  assert.equal(v({ fecha: '2026-10-22', hora: 600 }, { fecha: '2026-02-30', hora: 600 }), 'FECHA_INVALIDA')
  assert.equal(v({ fecha: '2026-10-22', hora: 600 }, { fecha: '2026-10-23', hora: 601 }), 'HORA_INVALIDA')
})

test('mover: hoy más tarde, otro día o quitar la hora vale', () => {
  const ok = (origen, destino) => validarMovimiento({ origen, destino, ahora: AHORA }).ok
  assert.equal(ok({ fecha: '2026-10-22', hora: 8 * 60 }, { fecha: '2026-10-22', hora: 19 * 60 }), true)
  assert.equal(ok({ fecha: '2026-10-22', hora: 1080 }, { fecha: '2026-10-25', hora: 660 }), true)
  assert.equal(ok({ fecha: '2026-10-23', hora: null }, { fecha: '2026-10-22', hora: null }), true)
  assert.equal(esMovible('2026-10-22', AHORA), true)
  assert.equal(esMovible('2026-10-21', AHORA), false)
})

test('ajustar a tramos de 30 min y validar horas', () => {
  assert.equal(ajustar(14), 0)
  assert.equal(ajustar(16), 30)
  assert.equal(ajustar(1439), 1410)
  assert.equal(horaValida(null), true)
  assert.equal(horaValida(1435), true)
  assert.equal(horaValida(1440), false)
  assert.equal(horaValida(7.5), false)
})

test('ventana: tramos + sesiones, con aire y mínimo 7 h', () => {
  assert.deepEqual(ventanaAgenda([], []), [360, 1320])
  const dias = [{ disciplinas: { run: [{ inicio_min: 420, fin_min: 570 }], bike: [{ inicio_min: 1080, fin_min: 1290 }] } }]
  assert.deepEqual(ventanaAgenda(dias, []), [390, 1350])
  assert.deepEqual(ventanaAgenda(dias, [{ hora_inicio_min: 300, duracion_min: 60 }]), [270, 1350])
  assert.deepEqual(ventanaAgenda([], [{ hora_inicio_min: 600, duracion_min: 60 }]), [570, 990])
  assert.deepEqual(ventanaAgenda([], [{ hora_inicio_min: 1380, duracion_min: 60 }]), [1020, 1440])
})

test('colocarDia: a su hora, solapes lado a lado, sin duración = 1 h', () => {
  const s = [
    { id: 'a', hora_inicio_min: 600, duracion_min: 90 },
    { id: 'b', hora_inicio_min: 630, duracion_min: 30 },
    { id: 'c', hora_inicio_min: 650, duracion_min: null },
    { id: 'd', hora_inicio_min: 900, duracion_min: 60 },
    { id: 'e', fecha: 'x' },
  ]
  const r = Object.fromEntries(colocarDia(s).map((b) => [b.sesion.id, b]))
  assert.equal(Object.keys(r).length, 4)
  assert.equal(r.a.cols, 3); assert.equal(r.b.cols, 3); assert.equal(r.c.cols, 3)
  assert.equal(r.a.col, 0); assert.equal(r.b.col, 1); assert.equal(r.c.col, 2)
  assert.equal(r.c.fin, 710); assert.equal(r.c.sinDuracion, true)
  assert.equal(r.d.cols, 1); assert.equal(r.d.col, 0)
  assert.deepEqual(sinHora(s).map((x) => x.id), ['e'])
})

test('horasPosibles: dentro del tramo, cabe la duración, nada pasado', () => {
  const datos = { plantilla: [
    { dia_semana: 4, disciplina: 'run', inicio_min: 1080, fin_min: 1290 },
    { dia_semana: 7, disciplina: 'run', inicio_min: 480, fin_min: 1050 },
  ], excepciones: [] }
  assert.deepEqual(horasPosibles(datos, '2026-10-22', 'run', 75, AHORA), [1080, 1110, 1140, 1170, 1200])
  assert.deepEqual(horasPosibles(datos, '2026-10-22', 'run', 75, { fecha: '2026-10-22', min: 1100 }), [1110, 1140, 1170, 1200])
  assert.equal(horasPosibles(datos, '2026-10-25', 'run', 75, AHORA)[0], 480)
  assert.equal(horasPosibles(datos, '2026-10-25', 'run', 75, AHORA).at(-1), 960)
  assert.deepEqual(horasPosibles(datos, '2026-10-25', 'swim', 60, AHORA), [])
  assert.equal(horasPosibles({}, '2026-10-25', 'swim', 60, AHORA).length, 31) // 6:00–21:00
})

test('evaluarDisponibilidad con hora: fuera del tramo avisa', () => {
  const datos = { plantilla: [{ dia_semana: 4, disciplina: 'run', inicio_min: 1080, fin_min: 1290 }], excepciones: [] }
  assert.equal(evaluarDisponibilidad(datos, '2026-10-22', 'run', 75, 1080).nivel, 'ok')
  const e = evaluarDisponibilidad(datos, '2026-10-22', 'run', 75, 1260)
  assert.equal(e.motivo, 'fuera_de_horas')
  assert.match(textoAviso(e, 'run'), /no tiene marcado carrera/)
  assert.equal(evaluarDisponibilidad(datos, '2026-10-22', 'run', null, 1280).nivel, 'ok')
  assert.equal(evaluarDisponibilidad(datos, '2026-10-22', 'run', 75).nivel, 'ok')
})

test('disciplinasALaHora: solo lo que cabe a esa hora', () => {
  const datos = { plantilla: [
    { dia_semana: 4, disciplina: 'run', inicio_min: 420, fin_min: 570 },
    { dia_semana: 4, disciplina: 'strength', inicio_min: 780, fin_min: 930 },
    { dia_semana: 4, disciplina: 'bike', inicio_min: 1080, fin_min: 1290 },
    { dia_semana: 4, disciplina: 'run', inicio_min: 1080, fin_min: 1290 },
  ], excepciones: [{ fecha: '2026-10-23', tipo: 'no_disponible' }] }
  assert.deepEqual(disciplinasALaHora(datos, '2026-10-22', 780), ['strength'])
  assert.deepEqual(disciplinasALaHora(datos, '2026-10-22', 1080), ['bike', 'run'])
  assert.deepEqual(disciplinasALaHora(datos, '2026-10-22', 600), [])
  assert.deepEqual(disciplinasALaHora(datos, '2026-10-22', 930), [])
  assert.deepEqual(disciplinasALaHora(datos, '2026-10-22', null), ['bike', 'run', 'strength'])
  assert.deepEqual(disciplinasALaHora(datos, '2026-10-23', 600), [])
  assert.equal(disciplinasALaHora({}, '2026-10-22', 600), null)
})

test('adjuntos: normalizar y detectar entreno', async () => {
  const { adjuntoDe, tieneEntreno, rutaAdjunto } = await import('../src/lib/adjuntos.js')
  assert.equal(adjuntoDe(null), null)
  assert.equal(adjuntoDe({ adjunto: { texto: '  ', imagenes: [] } }), null)
  assert.deepEqual(adjuntoDe({ adjunto: { texto: ' 1000 m SkiErg ', imagenes: ['a/b.jpg', '', 3] } }), { texto: '1000 m SkiErg', imagenes: ['a/b.jpg'] })
  assert.equal(tieneEntreno({ bloques: [] }), false)
  assert.equal(tieneEntreno({ bloques: [], adjunto: { imagenes: ['x/y.jpg'] } }), true)
  assert.equal(tieneEntreno({ bloques: [{}] }), true)
  assert.equal(rutaAdjunto('ath', 'u1'), 'ath/u1.jpg')
})
