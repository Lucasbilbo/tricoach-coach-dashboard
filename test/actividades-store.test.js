// lib/actividades-store.js: sincronización incremental Strava → Supabase, con una
// BD en memoria y un Strava simulado (sin red).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { crearStore, FRESCO_MS, MARGEN_MS } = createRequire(import.meta.url)('../netlify/functions/lib/actividades-store.js')

const ATL = 'a1'
const DIA = 86400000
const AHORA = Date.UTC(2026, 9, 20, 12)

function act(id, diasAtras) {
  return { id, start_date: new Date(AHORA - diasAtras * DIA).toISOString(), name: `a${id}` }
}

function montar({ strava = [], syncOk = true, guardarOk = true, stravaFalla = false, completo = true } = {}) {
  let t = AHORA
  const filas = new Map() // strava_id → datos
  let sync = null
  const llamadasStrava = []
  const escrituras = { guardar: 0, borrar: 0, sync: 0 }
  const estado = { strava: [...strava], stravaFalla, completo }

  const db = {
    leerSync: async () => (syncOk ? { ok: true, fila: sync } : { ok: false }),
    leerActividades: async (_id, desdeIso) => ({
      ok: true,
      datos: [...filas.values()].filter((a) => a.start_date >= desdeIso).sort((x, y) => (x.start_date < y.start_date ? 1 : -1)),
    }),
    guardar: async (_id, acts) => {
      escrituras.guardar++
      if (!guardarOk) return false
      for (const a of acts) filas.set(a.id, a)
      return true
    },
    borrarAusentes: async (_id, desdeIso, ids) => {
      escrituras.borrar++
      for (const [k, a] of filas) if (a.start_date >= desdeIso && !ids.includes(k)) filas.delete(k)
      return true
    },
    guardarSync: async (_id, campos) => {
      escrituras.sync++
      sync = { athlete_id: ATL, ...campos }
      return true
    },
  }
  const listar = async (_token, afterUnix) => {
    llamadasStrava.push(afterUnix)
    if (estado.stravaFalla) return { ok: false, status: 503, actividades: [] }
    const desde = new Date(afterUnix * 1000).toISOString()
    return { ok: true, actividades: estado.strava.filter((a) => a.start_date >= desde), completo: estado.completo }
  }
  const store = crearStore({ db, listar, now: () => t })
  const obtener = (dias, extra = {}) =>
    store.obtener({ athleteId: ATL, afterUnix: Math.floor((t - dias * DIA) / 1000), obtenerToken: async () => 'tok', ...extra })
  return { obtener, filas, llamadasStrava, escrituras, estado, getSync: () => sync, avanzar: (ms) => { t += ms } }
}

test('sin tablas (leerSync falla) se comporta como antes: todo de Strava, sin escribir', async () => {
  const m = montar({ strava: [act(1, 2)], syncOk: false })
  const r = await m.obtener(56)
  assert.equal(r.ok, true)
  assert.equal(r.origen, 'directo')
  assert.equal(r.actividades.length, 1)
  assert.deepEqual(m.escrituras, { guardar: 0, borrar: 0, sync: 0 })
})

test('1ª vez trae la ventana de Strava, la guarda y marca la cobertura', async () => {
  const m = montar({ strava: [act(1, 2), act(2, 30), act(3, 100)] })
  const r = await m.obtener(56)
  assert.equal(r.origen, 'strava')
  assert.deepEqual(r.actividades.map((a) => a.id).sort(), [1, 2])
  assert.equal(m.filas.size, 2)
  assert.equal(m.getSync().cubierto_desde, new Date(AHORA - 56 * DIA).toISOString())
  assert.equal(m.getSync().ultima_actividad_at, act(1, 2).start_date)
})

test('dentro de los 5 min sale solo de la BD, sin llamar a Strava', async () => {
  const m = montar({ strava: [act(1, 2), act(2, 30)] })
  await m.obtener(56)
  m.avanzar(FRESCO_MS - 1000)
  const r = await m.obtener(56)
  assert.equal(r.origen, 'bd')
  assert.equal(m.llamadasStrava.length, 1)
  assert.equal(r.actividades.length, 2)
  // Una ventana MÁS corta también está cubierta
  const r2 = await m.obtener(14)
  assert.equal(r2.origen, 'bd')
  assert.deepEqual(r2.actividades.map((a) => a.id), [1])
})

test('pasados 5 min: llamada pequeña desde la última sync − 7 días; recoge nuevas y borradas', async () => {
  const m = montar({ strava: [act(1, 2), act(2, 3), act(3, 30)] })
  await m.obtener(56)
  m.avanzar(FRESCO_MS + 1000)
  m.estado.strava = [act(2, 3), act(3, 30), act(9, 0)] // 1 borrada en Strava, 9 nueva
  const r = await m.obtener(56)
  assert.equal(r.origen, 'bd')
  const desdeIncremental = Math.floor((AHORA - MARGEN_MS) / 1000)
  assert.equal(m.llamadasStrava[1], desdeIncremental)
  assert.deepEqual(r.actividades.map((a) => a.id), [9, 2, 3])
  // La cobertura no se acorta por la llamada incremental
  assert.equal(m.getSync().cubierto_desde, new Date(AHORA - 56 * DIA).toISOString())
})

test('una ventana más larga que la cubierta vuelve a Strava y amplía la cobertura', async () => {
  const m = montar({ strava: [act(1, 2), act(2, 100)] })
  await m.obtener(56)
  const r = await m.obtener(182)
  assert.equal(r.origen, 'strava')
  assert.equal(r.actividades.length, 2)
  assert.equal(m.getSync().cubierto_desde, new Date(AHORA - 182 * DIA).toISOString())
  const r2 = await m.obtener(56)
  assert.equal(r2.origen, 'bd')
})

test('force resincroniza aunque esté fresco', async () => {
  const m = montar({ strava: [act(1, 2)] })
  await m.obtener(56)
  const r = await m.obtener(56, { force: true })
  assert.equal(r.origen, 'strava')
  assert.equal(m.llamadasStrava.length, 2)
})

test('Strava caído con la ventana cubierta: sirve lo guardado', async () => {
  const m = montar({ strava: [act(1, 2)] })
  await m.obtener(56)
  m.avanzar(FRESCO_MS + 1000)
  m.estado.stravaFalla = true
  const r = await m.obtener(56)
  assert.equal(r.ok, true)
  assert.equal(r.origen, 'bd')
  assert.equal(r.actividades.length, 1)
})

test('Strava caído sin cobertura: error (no se inventan datos)', async () => {
  const m = montar({ stravaFalla: true })
  const r = await m.obtener(56)
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'strava')
})

test('lectura incompleta de Strava: no borra ni marca cobertura', async () => {
  const m = montar({ strava: [act(1, 2)], completo: false })
  const r = await m.obtener(56)
  assert.equal(r.ok, true)
  assert.equal(m.escrituras.borrar, 0)
  assert.equal(m.getSync().cubierto_desde, null)
  // Al no estar cubierta, la siguiente vuelve a Strava
  await m.obtener(56)
  assert.equal(m.llamadasStrava.length, 2)
})

test('si guardar en la BD falla no se marca la sincronización', async () => {
  const m = montar({ strava: [act(1, 2)], guardarOk: false })
  const r = await m.obtener(56)
  assert.equal(r.ok, true)
  assert.equal(r.actividades.length, 1)
  assert.equal(m.getSync(), null)
})

test('sin token y sin cobertura: motivo token', async () => {
  const m = montar({ strava: [act(1, 2)] })
  const r = await m.obtener(56, { obtenerToken: async () => null })
  assert.equal(r.ok, false)
  assert.equal(r.motivo, 'token')
})
