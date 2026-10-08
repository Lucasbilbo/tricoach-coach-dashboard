// coach-athlete-data: paginación de Strava y modo records:false (sin las
// peticiones de detalle para splits). Strava, Supabase y auth simulados vía
// require.cache, sin red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)
const ATHLETE = '11111111-1111-4111-8111-111111111111'

function cargarHandler({ paginas, fallaPagina = null, limite = true }) {
  const llamadas = []
  const buckets = []
  const stub = (rel, exports) => {
    const p = require.resolve(`../netlify/functions/lib/${rel}`)
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }
  stub('auth', { verifyAuth: async () => ({ uid: ATHLETE }), canAccessAthlete: async () => true })
  stub('strava', { getStravaAccessToken: async () => 'tok' })
  stub('rate-limit', {
    allowLimite: async (nombre) => { buckets.push(nombre); return limite },
    MENSAJE_429: 'Demasiadas consultas',
  })
  stub('supabase-rest', {
    supabaseGet: async (_h, path) =>
      path.startsWith('/rest/v1/profiles')
        ? { status: 200, json: [{ id: ATHLETE, nombre: 'Lucas', strava_token: 't', strava_refresh_token: 'r', fc_maxima: 185 }] }
        : { status: 200, json: [] },
  })
  stub('http', {
    withTimeout: (p) => p,
    httpsRequest: async ({ path }) => {
      llamadas.push(path)
      const m = path.match(/[?&]page=(\d+)/)
      if (path.startsWith('/api/v3/athlete/activities')) {
        const page = Number(m[1])
        if (page === fallaPagina) return { status: 429, json: { message: 'Rate Limit' } }
        return { status: 200, json: paginas[page - 1] || [] }
      }
      return { status: 200, json: { splits_metric: [] } } // detalle de actividad
    },
  })
  const fn = require.resolve('../netlify/functions/coach-athlete-data.js')
  delete require.cache[fn]
  return { handler: require(fn).handler, llamadas, buckets }
}

function acts(n, desdeId) {
  return Array.from({ length: n }, (_, i) => ({
    id: desdeId + i,
    type: 'Run',
    sport_type: 'Run',
    start_date: new Date(Date.UTC(2026, 8, 1) + (desdeId + i) * 3600e3).toISOString(),
    moving_time: 1800,
    distance: 5000,
    average_heartrate: 140,
  }))
}

const evento = (body) => ({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(body) })

process.env.SUPABASE_URL = 'https://x.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
process.env.STRAVA_CLIENT_ID = 'c'
process.env.STRAVA_CLIENT_SECRET = 's'

test('pagina cuando una página viene llena (no pierde las más recientes)', async () => {
  const { handler, llamadas } = cargarHandler({ paginas: [acts(200, 1), acts(37, 201)] })
  const res = await handler(evento({ athleteId: ATHLETE, weeks: 26, records: false }))
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).actividades.length, 237)
  assert.equal(llamadas.filter((p) => p.startsWith('/api/v3/athlete/activities')).length, 2)
})

test('records:false no pide detalles de actividad ni devuelve records', async () => {
  const { handler, llamadas } = cargarHandler({ paginas: [acts(30, 1)] })
  const res = await handler(evento({ athleteId: ATHLETE, weeks: 26, records: false }))
  const body = JSON.parse(res.body)
  assert.equal(body.records, undefined)
  assert.equal(llamadas.filter((p) => p.startsWith('/api/v3/activities/')).length, 0)
  assert.equal(llamadas.length, 1)
})

test('por defecto sigue calculando records con splits (vista principal)', async () => {
  const { handler, llamadas } = cargarHandler({ paginas: [acts(30, 1)] })
  const res = await handler(evento({ athleteId: ATHLETE, weeks: 8 }))
  assert.ok(JSON.parse(res.body).records)
  assert.equal(llamadas.filter((p) => p.startsWith('/api/v3/activities/')).length, 10)
})

test('si falla una página posterior devuelve lo ya leído; si falla la 1ª, 502', async () => {
  let r = cargarHandler({ paginas: [acts(200, 1)], fallaPagina: 2 })
  let res = await r.handler(evento({ athleteId: ATHLETE, weeks: 26, records: false }))
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).actividades.length, 200)
  r = cargarHandler({ paginas: [], fallaPagina: 1 })
  res = await r.handler(evento({ athleteId: ATHLETE, weeks: 26, records: false }))
  assert.equal(res.statusCode, 502)
})

test('rate limit: bucket ligero con records:false, completo por defecto; 429 sin tocar Strava', async () => {
  let r = cargarHandler({ paginas: [acts(3, 1)] })
  await r.handler(evento({ athleteId: ATHLETE, weeks: 26, records: false }))
  await r.handler(evento({ athleteId: ATHLETE, weeks: 8 }))
  assert.deepEqual(r.buckets, ['athlete_data_light', 'athlete_data_full'])

  r = cargarHandler({ paginas: [acts(3, 1)], limite: false })
  const res = await r.handler(evento({ athleteId: ATHLETE, weeks: 8 }))
  assert.equal(res.statusCode, 429)
  assert.equal(JSON.parse(res.body).code, 'RATE_LIMITED')
  assert.equal(r.llamadas.length, 0)
})
