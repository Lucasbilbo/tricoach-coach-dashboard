// lib/strava-lista.js — listado de actividades de Strava (CommonJS).
// Movido desde coach-athlete-data para compartirlo con lib/actividades-store.js.

const { withTimeout, httpsRequest } = require('./http')

// Strava devuelve como mucho 200 por página y, con `after`, en orden ASCENDENTE:
// sin paginar, un atleta con >200 actividades en la ventana perdería las MÁS
// RECIENTES. Tope de páginas para no agotar el rate limit (100 lecturas/15 min).
const STRAVA_PER_PAGE = 200
const STRAVA_MAX_PAGINAS = 4

// Actividades desde `after` (unix s), paginando si una página viene llena.
// { ok, status, json, actividades, completo }. Si falla la 1ª página → ok:false;
// si falla una posterior se devuelve lo ya leído (mejor parcial que nada) con
// completo:false, para que nadie lo tome como la lista entera de la ventana.
async function actividadesDesde(accessToken, after, medidor) {
  const actividades = []
  for (let page = 1; page <= STRAVA_MAX_PAGINAS; page++) {
    if (medidor) medidor.contar('strava-lista')
    const res = await withTimeout(
      httpsRequest({
        hostname: 'www.strava.com',
        path: `/api/v3/athlete/activities?per_page=${STRAVA_PER_PAGE}&page=${page}&after=${after}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      10000
    )
    if (res.status !== 200 || !Array.isArray(res.json)) {
      if (page === 1) return { ok: false, status: res.status, json: res.json, actividades, completo: false }
      console.error('Strava paginación cortada en página', page, res.status)
      return { ok: true, actividades, completo: false }
    }
    actividades.push(...res.json)
    if (res.json.length < STRAVA_PER_PAGE) return { ok: true, actividades, completo: true }
  }
  // Tope de páginas alcanzado con la última llena: puede faltar algo
  return { ok: true, actividades, completo: false }
}

// Actividad más reciente del atleta (sin ventana). null si falla o no hay.
async function ultimaActividad(accessToken, medidor) {
  if (medidor) medidor.contar('strava-lista')
  const res = await withTimeout(
    httpsRequest({
      hostname: 'www.strava.com',
      path: '/api/v3/athlete/activities?per_page=1',
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    10000
  )
  return res.status === 200 && Array.isArray(res.json) && res.json[0] ? res.json[0] : null
}

module.exports = { actividadesDesde, ultimaActividad, STRAVA_PER_PAGE, STRAVA_MAX_PAGINAS }
