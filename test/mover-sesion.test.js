// move-session: núcleo moverSesion con dobles (sin red).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { moverSesion } = require('../netlify/functions/move-session.js')
const { inicioLocal, construirEvento } = require('../netlify/functions/lib/intervals-evento.js')

const ATLETA = '11111111-1111-4111-8111-111111111111'
const COACH = '22222222-2222-4222-8222-222222222222'
const OTRO = '33333333-3333-4333-8333-333333333333'
const SID = '44444444-4444-4444-8444-444444444444'
const AHORA = { fecha: '2026-10-22', min: 18 * 60 }
const ISO = '2026-10-22T16:00:00.000Z'

function dobles(sesion, { post = { status: 200, body: { id: 999 } }, guardar = true, perfil = { intervals_api_key: 'k', intervals_athlete_id: 'i1' }, coachOk = true } = {}) {
  const log = []
  return {
    log,
    deps: {
      leerSesion: async () => sesion,
      leerPerfil: async () => perfil,
      guardar: async (id, cambios) => { log.push(['guardar', cambios]); return typeof guardar === 'function' ? guardar(cambios) : guardar },
      puedeCoach: async (auth) => coachOk && auth.uid === COACH,
      intervalsPost: async (_a, _k, ev) => { log.push(['post', ev]); return post },
      intervalsDelete: async (_a, _k, id) => { log.push(['delete', id]); return { status: 200 } },
      eventoBorrado: (r) => r.status >= 200 && r.status < 300,
    },
  }
}

const base = { id: SID, coach_id: COACH, athlete_id: ATLETA, fecha: '2026-10-22', hora_inicio_min: 1080, disciplina: 'run', descripcion: 'Series 6×800', duracion_min: 75, workout_steps: null }
const mover = (auth, body, d) => moverSesion({ auth: { uid: auth }, body: { sessionId: SID, ...body }, ahora: AHORA, deps: d.deps, ahoraIso: ISO })

test('inicioLocal y evento llevan la hora si la hay', () => {
  assert.equal(inicioLocal('2026-10-25', 660), '2026-10-25T11:00:00')
  assert.equal(inicioLocal('2026-10-25', 455), '2026-10-25T07:35:00')
  assert.equal(inicioLocal('2026-10-25', null), '2026-10-25T00:00:00')
  const ev = construirEvento({ ...base, fecha: '2026-10-25', hora_inicio_min: 660 })
  assert.equal(ev.start_date_local, '2026-10-25T11:00:00')
  assert.equal(ev.type, 'Run')
})

test('el atleta mueve una sesión no enviada: solo BD, marca atleta', async () => {
  const d = dobles({ ...base })
  const r = await mover(ATLETA, { fecha: '2026-10-25', hora_inicio_min: 660 }, d)
  assert.equal(r.status, 200)
  assert.equal(r.body.reloj, 'sin_envio')
  assert.deepEqual(d.log, [['guardar', { fecha: '2026-10-25', hora_inicio_min: 660, movida_por: 'atleta', movida_at: ISO }]])
})

test('solo se tocan fecha, hora y movida_* (nunca el contenido)', async () => {
  const d = dobles({ ...base })
  await mover(ATLETA, { fecha: '2026-10-25', hora_inicio_min: 660, descripcion: 'hack', duracion_min: 1, athlete_id: OTRO }, d)
  assert.deepEqual(Object.keys(d.log[0][1]).sort(), ['fecha', 'hora_inicio_min', 'movida_at', 'movida_por'])
})

test('el coach con relación mueve: marca coach; sin relación o ajeno: 403', async () => {
  const d = dobles({ ...base })
  const r = await mover(COACH, { fecha: '2026-10-24', hora_inicio_min: null }, d)
  assert.equal(r.status, 200)
  assert.equal(d.log[0][1].movida_por, 'coach')
  assert.equal((await mover(COACH, { fecha: '2026-10-24' }, dobles({ ...base }, { coachOk: false }))).status, 403)
  assert.equal((await mover(OTRO, { fecha: '2026-10-24' }, dobles({ ...base }))).status, 403)
})

test('reglas: pasado, hora pasada de hoy, entrada inválida', async () => {
  assert.equal((await mover(ATLETA, { fecha: '2026-10-21', hora_inicio_min: 600 }, dobles({ ...base }))).body.code, 'DESTINO_PASADO')
  assert.equal((await mover(ATLETA, { fecha: '2026-10-25' }, dobles({ ...base, fecha: '2026-10-20' }))).body.code, 'ORIGEN_PASADO')
  assert.equal((await mover(ATLETA, { fecha: '2026-10-22', hora_inicio_min: 600 }, dobles({ ...base }))).body.code, 'HORA_PASADA')
  assert.equal((await mover(ATLETA, { fecha: '2026-10-25', hora_inicio_min: 61 }, dobles({ ...base }))).status, 409)
  const r = await moverSesion({ auth: { uid: ATLETA }, body: { sessionId: 'x' }, ahora: AHORA, deps: dobles(base).deps })
  assert.equal(r.status, 400)
  assert.equal((await mover(ATLETA, { fecha: '2026-10-25' }, dobles(null))).status, 404)
})

test('enviada al reloj: crea evento nuevo con la fecha nueva, guarda y borra el viejo', async () => {
  const d = dobles({ ...base, intervals_event_id: '111', enviado_a_garmin: true })
  const r = await mover(ATLETA, { fecha: '2026-10-25', hora_inicio_min: 660 }, d)
  assert.equal(r.status, 200)
  assert.equal(r.body.reloj, 'actualizado')
  assert.deepEqual(d.log.map((x) => x[0]), ['post', 'guardar', 'delete'])
  assert.equal(d.log[0][1].start_date_local, '2026-10-25T11:00:00')
  assert.equal(d.log[1][1].intervals_event_id, '999')
  assert.equal(d.log[2][1], '111')
})

test('si Intervals falla no se mueve nada', async () => {
  const d = dobles({ ...base, intervals_event_id: '111' }, { post: { status: 500, body: null } })
  const r = await mover(ATLETA, { fecha: '2026-10-25', hora_inicio_min: 660 }, d)
  assert.equal(r.status, 502)
  assert.deepEqual(d.log.map((x) => x[0]), ['post'])
})

test('si la BD no confirma se deshace el evento nuevo y el viejo sigue', async () => {
  const d = dobles({ ...base, intervals_event_id: '111' }, { guardar: false })
  const r = await mover(ATLETA, { fecha: '2026-10-25', hora_inicio_min: 660 }, d)
  assert.equal(r.status, 502)
  assert.deepEqual(d.log.map((x) => x[0]), ['post', 'guardar', 'delete'])
  assert.equal(d.log[2][1], '999')
})

test('enviada pero sin Intervals conectado: no se mueve', async () => {
  const d = dobles({ ...base, intervals_event_id: '111' }, { perfil: { intervals_api_key: null } })
  const r = await mover(ATLETA, { fecha: '2026-10-25', hora_inicio_min: 660 }, d)
  assert.equal(r.body.code, 'NO_INTERVALS')
  assert.equal(d.log.length, 0)
})
