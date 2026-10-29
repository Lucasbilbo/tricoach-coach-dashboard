// Repaso visual de la app con datos simulados. Supabase (REST + auth) y las
// Netlify Functions se interceptan con Playwright; coach-athlete-data se
// ejecuta DE VERDAD (su handler) con Strava y Supabase simulados.
//
// Uso: npm run repaso   (o: node scripts/repaso-visual/repaso.cjs [carpetaSalida])
// Saca capturas de 12 pantallas × móvil/escritorio a repaso-visual-out/ y un
// informe.json con errores de consola y scroll horizontal por pantalla.
// Necesita Playwright (no es dependencia del proyecto, para no cargar el
// build de Netlify): npm i --no-save playwright && npx playwright install chromium
const path = require('path')
const fs = require('fs')
const http = require('http')
const { spawnSync } = require('child_process')

let chromium
try {
  ;({ chromium } = require('playwright'))
} catch {
  console.error('Falta Playwright. Instálalo sin tocar package.json:\n  npm i --no-save playwright && npx playwright install chromium')
  process.exit(1)
}

const REPO = path.resolve(__dirname, '../..')
const DIST = path.join(REPO, 'repaso-visual-out', 'dist')
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'repaso-visual-out'))
fs.mkdirSync(OUT, { recursive: true })

// Build con un Supabase ficticio: todas sus llamadas se interceptan abajo
const build = spawnSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], {
  cwd: REPO,
  stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: 'https://mock.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' },
})
if (build.status !== 0) process.exit(build.status || 1)
const F = require('./fixtures.cjs')
const db = JSON.parse(JSON.stringify(F.db))

// ── servidor estático del build (SPA) ──
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0])
  let p = path.join(DIST, u)
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
  const ext = path.extname(p)
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' })
  fs.createReadStream(p).pipe(res)
})

// ── mini PostgREST ──
function valor(v) { return v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v }
function cumple(row, col, expr) {
  const i = expr.indexOf('.')
  const op = expr.slice(0, i)
  const raw = expr.slice(i + 1)
  const x = row[col]
  if (op === 'eq') return String(x) === raw
  if (op === 'neq') return String(x) !== raw
  if (op === 'gte') return x != null && x >= raw
  if (op === 'gt') return x != null && x > raw
  if (op === 'lte') return x != null && x <= raw
  if (op === 'lt') return x != null && x < raw
  if (op === 'is') return raw === 'null' ? x == null : x === valor(raw)
  if (op === 'in') return raw.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/"/g, '')).includes(String(x))
  return true
}
const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
function filtrar(rows, params) {
  return rows.filter((r) => [...params.entries()].every(([k, v]) => RESERVADOS.has(k) || cumple(r, k, v)))
}
function ordenar(rows, order) {
  if (!order) return rows
  const claves = order.split(',').map((o) => { const [c, dir, nulls] = o.split('.'); return { c, desc: dir === 'desc', nullsFirst: nulls === 'nullsfirst' } })
  return [...rows].sort((a, b) => {
    for (const k of claves) {
      const x = a[k.c]; const y = b[k.c]
      if (x == null && y == null) continue
      if (x == null) return k.nullsFirst ? -1 : 1
      if (y == null) return k.nullsFirst ? 1 : -1
      if (x < y) return k.desc ? 1 : -1
      if (x > y) return k.desc ? -1 : 1
    }
    return 0
  })
}
function rest(method, url, headers, body) {
  const u = new URL(url)
  const tabla = u.pathname.replace('/rest/v1/', '')
  const p = u.searchParams
  if (tabla.startsWith('rpc/')) return { status: 200, json: null }
  if (!db[tabla]) return { status: 404, json: { code: '42P01', message: `relation "${tabla}" does not exist` } }
  if (method === 'GET' || method === 'HEAD') {
    let rows = ordenar(filtrar(db[tabla], p), p.get('order'))
    const total = rows.length
    const off = Number(p.get('offset') || 0)
    if (p.get('limit')) rows = rows.slice(off, off + Number(p.get('limit')))
    if (/vnd\.pgrst\.object/.test(headers.accept || '')) {
      if (rows.length !== 1) return { status: 406, json: { code: 'PGRST116', message: 'no rows' } }
      return { status: 200, json: rows[0] }
    }
    return { status: 200, json: rows, headers: { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${total}` } }
  }
  if (method === 'POST') {
    const filas = [].concat(JSON.parse(body || '[]'))
    const conflicto = p.get('on_conflict')
    const res = filas.map((f) => {
      const existente = conflicto && db[tabla].find((r) => r[conflicto] === f[conflicto])
      if (existente) { Object.assign(existente, f); return existente }
      const nueva = { id: f.id || `mock-${Math.random().toString(16).slice(2)}`, ...f }
      db[tabla].push(nueva)
      return nueva
    })
    return { status: 201, json: /vnd\.pgrst\.object/.test(headers.accept || '') ? res[0] : res }
  }
  if (method === 'PATCH') {
    const rows = filtrar(db[tabla], p)
    rows.forEach((r) => Object.assign(r, JSON.parse(body || '{}')))
    return { status: 200, json: /vnd\.pgrst\.object/.test(headers.accept || '') ? rows[0] : rows }
  }
  if (method === 'DELETE') {
    const quitar = new Set(filtrar(db[tabla], p))
    db[tabla] = db[tabla].filter((r) => !quitar.has(r))
    return { status: 200, json: [...quitar] }
  }
  return { status: 405, json: null }
}

// ── coach-athlete-data real con Strava/Supabase simulados ──
function handlerAtleta() {
  const stub = (rel, exports) => {
    const p = require.resolve(`${REPO}/netlify/functions/lib/${rel}`)
    require.cache[p] = { id: p, filename: p, loaded: true, exports }
  }
  stub('auth', { verifyAuth: async () => ({ uid: F.C, isCoach: true }), canAccessAthlete: async () => true })
  stub('strava', { getStravaAccessToken: async () => 'tok' })
  stub('rate-limit', { allowLimite: async () => true, MENSAJE_429: 'x' })
  stub('supabase-rest', {
    supabaseGet: async (_h, ruta) => rest('GET', `https://mock.supabase.co${ruta}`, {}, null),
    supabasePost: async () => ({ status: 201, json: null }),
    supabaseDelete: async () => ({ status: 204, json: null }),
  })
  stub('http', {
    withTimeout: (p) => p,
    httpsRequest: async ({ path: ruta }) => {
      if (ruta.startsWith('/api/v3/athlete/activities')) {
        const u = new URL('https://x' + ruta)
        const after = Number(u.searchParams.get('after') || 0) * 1000
        const page = Number(u.searchParams.get('page') || 1)
        const lista = F.actividades.filter((a) => Date.parse(a.start_date) >= after).sort((a, b) => b.start_date.localeCompare(a.start_date))
        return { status: 200, json: lista.slice((page - 1) * 200, page * 200) }
      }
      return { status: 200, json: { splits_metric: [] } }
    },
  })
  process.env.SUPABASE_URL = 'https://mock.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
  process.env.STRAVA_CLIENT_ID = 'c'
  process.env.STRAVA_CLIENT_SECRET = 's'
  // perfiles con token de Strava para que el handler lea actividades
  db.profiles.forEach((p) => { if (p.id === F.A) Object.assign(p, { strava_token: 't', strava_refresh_token: 'r' }) })
  return require(`${REPO}/netlify/functions/coach-athlete-data.js`).handler
}
const atletaData = handlerAtleta()

function dashboardData() {
  // 8 semanas, la última a medias; media de las 4 anteriores ≈ 300 → 412 sale "Por encima"
  const semanas = [260, 310, 280, 330, 290, 300, 310, 180].map((t, i) => ({ semana: `w${i}`, tss_total: t }))
  return [
    { athlete_id: F.A, nombre: 'Lucas', km_semana: 63.2, horas_semana: 7.4, tss_semana: 412, ultima_actividad_dias: 1, semanas_recientes: semanas },
    { athlete_id: F.B, nombre: 'Leire', km_semana: null, horas_semana: null, tss_semana: null, ultima_actividad_dias: null, semanas_recientes: [] },
  ]
}

// Detalle de una carrera con splits y vueltas (sin mapa: no hay tiles offline)
function detalleActividad(id) {
  const ritmos = ['5:41', '5:33', '5:26', '5:24', '5:19', '5:30']
  const vel = (r) => 1000 / (Number(r.split(':')[0]) * 60 + Number(r.split(':')[1]))
  return {
    actividad: {
      id, nombre: 'Rodaje con progresivo', tipo: 'Run', disciplina: 'run', fecha: F.HOY,
      descripcion: 'Piernas bien, último km fuerte', distancia_km: 6.02, duracion_min: 34.1, duracion_mov_min: 33.2,
      ritmo_min_km: '5:31', velocidad_media_kmh: 10.9, fc_media: 151, fc_maxima_actividad: 172, cadencia_media: 86,
      desnivel_pos_m: 42, desnivel_neg_m: 40, calorias: 410, tss_estimado: 46, tss_estimado_sin_fc: false,
      polyline: null,
      splits_km: ritmos.map((r, i) => ({ km: i + 1, moving_time_s: Math.round(1000 / vel(r)), ritmo_min_km: r, fc_media: 140 + i * 5, velocidad_ms: vel(r), desnivel_m: [4, -2, 6, -3, 1, -1][i] })),
    },
    vueltas: [
      { indice: 1, nombre: 'Calentamiento', distancia_km: 2, moving_time_s: 674, ritmo_min_km: '5:37', fc_media: 142, cadencia_media: 84, desnivel_m: 6 },
      { indice: 2, nombre: 'Progresivo', distancia_km: 3, moving_time_s: 969, ritmo_min_km: '5:23', fc_media: 157, cadencia_media: 88, desnivel_m: 30 },
      { indice: 3, nombre: 'Suave', distancia_km: 1.02, moving_time_s: 337, ritmo_min_km: '5:30', fc_media: 150, cadencia_media: 85, desnivel_m: 6 },
    ],
  }
}

async function funcion(nombre, body, uidActual) {
  if (nombre === 'my-connections') return { strava: true, intervals: true }
  if (nombre === 'coach-dashboard-data') return dashboardData()
  if (nombre === 'coach-athlete-data') {
    const r = await atletaData({ httpMethod: 'POST', headers: { authorization: 'Bearer x' }, body: JSON.stringify(body) })
    return { __raw: r }
  }
  if (nombre === 'season') {
    if (body.action === 'overview') return { atletas: [{ id: F.A, nombre: 'Lucas' }, { id: F.B, nombre: 'Leire' }], ...F.temporada, actores: {}, viewerId: uidActual }
    return { eventos: F.temporada.eventos.filter((e) => e.athlete_id === body.athleteId), cambios: [], actores: {}, viewerId: uidActual }
  }
  if (nombre === 'move-session') {
    const s = db.coach_sessions.find((x) => x.id === body.sessionId)
    Object.assign(s, { fecha: body.fecha, hora_inicio_min: body.hora_inicio_min })
    return { ok: true, sesion: s, reloj: 'actualizado', anterior_retirado: false }
  }
  if (nombre === 'coach-activity-detail') return detalleActividad(body.activityId)
  if (nombre === 'send-to-intervals') return { ok: true, intervals_event_id: '999', anterior_retirado: true }
  return { ok: true }
}

async function preparar(context, quien) {
  const user = { id: quien === 'coach' ? F.C : F.A, email: quien === 'coach' ? 'jon@example.com' : 'lucas@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
  const sesion = { access_token: 'mock', refresh_token: 'mock', token_type: 'bearer', expires_in: 360000, expires_at: Math.floor(Date.now() / 1000) + 360000, user }
  await context.addInitScript((s) => { localStorage.setItem('sb-mock-auth-token', JSON.stringify(s)) }, sesion)
  await context.route('https://mock.supabase.co/**', async (route) => {
    const req = route.request()
    const url = req.url()
    if (url.includes('/auth/v1/')) return route.fulfill({ json: url.includes('/user') ? user : sesion })
    if (url.includes('/storage/v1/')) return route.fulfill({ json: [] })
    const r = rest(req.method(), url, req.headers(), req.postData())
    return route.fulfill({ status: r.status, json: r.json, headers: { 'content-type': 'application/json', ...(r.headers || {}) } })
  })
  await context.route('**/.netlify/functions/**', async (route) => {
    const req = route.request()
    const nombre = new URL(req.url()).pathname.split('/').pop()
    let body = {}
    try { body = JSON.parse(req.postData() || '{}') } catch { /* vacío */ }
    const r = await funcion(nombre, body, user.id)
    if (r && r.__raw) return route.fulfill({ status: r.__raw.statusCode, body: r.__raw.body, headers: { 'content-type': 'application/json' } })
    return route.fulfill({ json: r })
  })
  await context.route('https://fonts.googleapis.com/**', (r) => r.abort())
  await context.route('https://fonts.gstatic.com/**', (r) => r.abort())
}

const PANTALLAS = [
  { quien: 'coach', nombre: 'dashboard', url: '/dashboard' },
  { quien: 'coach', nombre: 'atleta-sesiones', url: `/athlete/${F.A}`, pasos: ['tab:Sesiones'] },
  { quien: 'coach', nombre: 'atleta-sesion-abierta', url: `/athlete/${F.A}`, pasos: ['tab:Sesiones', 'nutricion'] },
  { quien: 'coach', nombre: 'atleta-analisis', url: `/athlete/${F.A}`, pasos: ['tab:Análisis'] },
  { quien: 'coach', nombre: 'atleta-actividad', url: `/athlete/${F.A}`, pasos: ['tab:Análisis', 'actividad'], soloPantalla: true },
  { quien: 'coach', nombre: 'sin-strava-analisis', url: `/athlete/${F.B}`, pasos: ['tab:Análisis'], esperado: /status of 409/ },
  { quien: 'coach', nombre: 'atleta-temporada', url: `/athlete/${F.A}?tab=temporada` },
  { quien: 'coach', nombre: 'creador-editar', url: `/athlete/${F.A}`, pasos: ['tab:Sesiones', 'editar'] },
  { quien: 'atleta', nombre: 'home', url: '/home' },
  { quien: 'atleta', nombre: 'home-nutricion', url: '/home', pasos: ['nutricion'] },
  { quien: 'atleta', nombre: 'home-historial', url: '/home', pasos: ['historial'] },
  { quien: 'atleta', nombre: 'home-disponibilidad', url: '/home', pasos: ['tab:Horario'] },
  { quien: 'atleta', nombre: 'home-temporada', url: '/home?tab=temporada' },
  { quien: 'atleta', nombre: 'home-analisis', url: '/home', pasos: ['tab:Análisis'] },
]

;(async () => {
  await new Promise((r) => server.listen(5299, r))
  const browser = await chromium.launch()
  const informe = []
  for (const vista of [{ nombre: 'movil', viewport: { width: 375, height: 812 } }, { nombre: 'escritorio', viewport: { width: 1280, height: 860 } }]) {
    for (const p of PANTALLAS) {
      const context = await browser.newContext({ viewport: vista.viewport, timezoneId: 'Europe/Madrid', locale: 'es-ES' })
      await preparar(context, p.quien)
      const page = await context.newPage()
      const errores = []
      page.on('pageerror', (e) => errores.push('pageerror: ' + e.message))
      // esperado: errores de red que la pantalla provoca a propósito (p. ej. el 409 sin Strava)
      page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text()) && !(p.esperado && p.esperado.test(m.text()))) errores.push('console: ' + m.text()) })
      await page.goto(`http://localhost:5299${p.url}`)
      await page.waitForTimeout(2500)
      for (const paso of p.pasos || []) {
        try {
          if (paso.startsWith('tab:')) await page.getByRole('tab', { name: paso.slice(4) }).first().click()
          else if (paso === 'nutricion') { const b = page.getByRole('button', { name: /^Nutrición/ }).first(); await b.scrollIntoViewIfNeeded(); await b.click() }
          else if (paso === 'historial') { const b = page.locator('button[aria-expanded]').filter({ hasText: 'Rodaje largo' }).first(); await b.scrollIntoViewIfNeeded(); await b.click() }
          else if (paso === 'editar') await page.getByRole('button', { name: 'Editar sesión' }).first().click()
          else if (paso === 'actividad') { const b = page.getByText(/^Run \d/).first(); await b.scrollIntoViewIfNeeded(); await b.click() }
          await page.waitForTimeout(1500)
        } catch (e) { errores.push(`paso ${paso}: ${e.message.split('\n')[0]}`) }
      }
      const ancho = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
      const archivo = `${vista.nombre}-${p.quien}-${p.nombre}.png`
      // soloPantalla: un modal fijo se ve en el viewport, no en la página entera
      await page.screenshot({ path: path.join(OUT, archivo), fullPage: !p.soloPantalla })
      informe.push({ archivo, scrollHorizontal: ancho.sw > ancho.cw ? `${ancho.sw}>${ancho.cw}` : null, errores })
      await context.close()
    }
  }
  await browser.close()
  server.close()
  fs.writeFileSync(path.join(OUT, 'informe.json'), JSON.stringify(informe, null, 2))
  for (const i of informe) console.log(i.archivo, i.scrollHorizontal || '', i.errores.length ? JSON.stringify(i.errores) : 'OK')
})()
