// lib/actividades-store.js — actividades de Strava con copia en Supabase (CommonJS).
//
// Antes cada carga pedía a Strava toda la ventana (hasta 26 semanas, ~3-4 s).
// Ahora (tablas de la migración 012):
//  - Ventana no cubierta todavía (o `force`) → se pide entera a Strava y se guarda.
//  - Cubierta y sincronizada hace < FRESCO_MS → se lee SOLO de Supabase.
//  - Cubierta pero más vieja → una llamada pequeña a Strava desde
//    (última sincronización − MARGEN_MS), que recoge actividades nuevas, editadas,
//    subidas tarde o borradas, y el resto sale de Supabase.
//  - Si Strava falla y la ventana está cubierta, se sirve lo guardado.
//  - Si las tablas no existen o Supabase falla, se comporta como antes (todo de
//    Strava, sin escribir nada): la migración puede aplicarse después del deploy.
// Las lecturas se marcan en Server-Timing con origen-strava / origen-bd /
// origen-directo para medirlo.

const { withTimeout } = require('./http')

const FRESCO_MS = 5 * 60 * 1000
const TIMEOUT_BD_MS = 5000
const MARGEN_MS = 7 * 24 * 3600 * 1000
// Por encima de esto no se borran ausentes (la URL del filtro not.in sería enorme)
const MAX_IDS_BORRADO = 600

const iso = (unixS) => new Date(unixS * 1000).toISOString()
const ms = (valor) => (valor ? Date.parse(valor) : NaN)

function maxFecha(a, b) {
  if (!a) return b || null
  if (!b) return a
  return ms(a) >= ms(b) ? a : b
}

// db: { leerSync, leerActividades, guardar, borrarAusentes, guardarSync }
// listar(token, afterUnix) → { ok, status, actividades, completo }
function crearStore({ db, listar, now = Date.now }) {
  // { athleteId, afterUnix, obtenerToken: async () => token|null, force, medidor }
  // → { ok, actividades, origen, ultimaActividadAt, status?, motivo? }
  async function obtener({ athleteId, afterUnix, obtenerToken, force = false, medidor }) {
    const marcar = (origen) => medidor && medidor.contar(`origen-${origen}`)

    async function directo() {
      const token = await obtenerToken()
      if (!token) return { ok: false, motivo: 'token' }
      const r = await listar(token, afterUnix)
      if (!r.ok) return { ok: false, motivo: 'strava', status: r.status }
      marcar('directo')
      const ultima = r.actividades.reduce((m, a) => maxFecha(m, a.start_date), null)
      return { ok: true, actividades: r.actividades, origen: 'directo', ultimaActividadAt: ultima }
    }

    const sync = await db.leerSync(athleteId)
    if (!sync.ok) return directo() // tablas aún sin crear o Supabase caído

    const fila = sync.fila
    const ahora = now()
    const cubre = fila && ms(fila.cubierto_desde) <= afterUnix * 1000
    const fresco = fila && ahora - ms(fila.sincronizado_at) < FRESCO_MS

    let desdeSync = null
    if (force || !cubre) desdeSync = afterUnix
    else if (!fresco) desdeSync = Math.floor((ms(fila.sincronizado_at) - MARGEN_MS) / 1000)
    if (desdeSync != null && Number.isNaN(desdeSync)) desdeSync = afterUnix

    let ultima = fila?.ultima_actividad_at || null

    if (desdeSync != null) {
      const token = await obtenerToken()
      const r = token ? await listar(token, desdeSync) : { ok: false, motivo: 'token' }

      if (!r.ok) {
        if (!cubre) return { ok: false, motivo: token ? 'strava' : 'token', status: r.status }
        console.error('Strava no disponible; se sirve lo guardado', athleteId, r.status)
        // cae a la lectura de BD de abajo (datos algo viejos mejor que un error)
      } else {
        for (const a of r.actividades) ultima = maxFecha(ultima, a.start_date)
        const guardado = await db.guardar(athleteId, r.actividades)
        let borrado = true
        if (guardado && r.completo) {
          const ids = r.actividades.map((a) => a.id).filter((id) => id != null)
          borrado = ids.length <= MAX_IDS_BORRADO ? await db.borrarAusentes(athleteId, iso(desdeSync), ids) : true
        }
        if (guardado && borrado) {
          // Solo se amplía la cobertura con una lectura COMPLETA y contigua
          const cubiertoPrevio = fila?.cubierto_desde || null
          let cubierto = cubiertoPrevio
          if (r.completo && (!cubiertoPrevio || desdeSync * 1000 <= ms(cubiertoPrevio) || cubre)) {
            cubierto = cubiertoPrevio && ms(cubiertoPrevio) < desdeSync * 1000 ? cubiertoPrevio : iso(desdeSync)
          }
          await db.guardarSync(athleteId, {
            cubierto_desde: cubierto,
            sincronizado_at: r.completo ? new Date(ahora).toISOString() : fila?.sincronizado_at || null,
            ultima_actividad_at: ultima,
          })
        }
        // Lectura de la ventana entera recién traída: no hace falta ir a la BD
        if (desdeSync <= afterUnix) {
          marcar('strava')
          const desdeMs = afterUnix * 1000
          return {
            ok: true,
            actividades: r.actividades.filter((a) => !a.start_date || ms(a.start_date) >= desdeMs),
            origen: 'strava',
            ultimaActividadAt: ultima,
          }
        }
      }
    }

    const lect = await db.leerActividades(athleteId, iso(afterUnix))
    if (!lect.ok) return directo()
    marcar('bd')
    for (const a of lect.datos) ultima = maxFecha(ultima, a.start_date)
    return { ok: true, actividades: lect.datos, origen: 'bd', ultimaActividadAt: ultima }
  }

  return { obtener }
}

// Implementación real de `db` sobre la REST de Supabase con service key.
// Cada operación devuelve ok/false y nunca lanza: un fallo de la copia local no
// rompe la respuesta (se cae al comportamiento anterior).
function dbSupabase({ supabaseHost, SERVICE_KEY, rest }) {
  const tabla = (t, query) => `/rest/v1/${t}?${query}`
  const okStatus = (s) => s >= 200 && s < 300

  async function intentar(fn, fallo) {
    try {
      return await withTimeout(fn(), TIMEOUT_BD_MS)
    } catch (err) {
      console.error('actividades-store:', err.message)
      return fallo
    }
  }

  return {
    leerSync: (athleteId) =>
      intentar(async () => {
        const res = await rest.supabaseGet(supabaseHost, tabla('strava_sync', `athlete_id=eq.${athleteId}&select=*`), SERVICE_KEY)
        if (!okStatus(res.status) || !Array.isArray(res.json)) return { ok: false }
        return { ok: true, fila: res.json[0] || null }
      }, { ok: false }),

    leerActividades: (athleteId, desdeIso) =>
      intentar(async () => {
        const q = `athlete_id=eq.${athleteId}&start_date=gte.${encodeURIComponent(desdeIso)}&select=datos&order=start_date.desc&limit=1000`
        const res = await rest.supabaseGet(supabaseHost, tabla('strava_actividades', q), SERVICE_KEY)
        if (!okStatus(res.status) || !Array.isArray(res.json)) return { ok: false }
        return { ok: true, datos: res.json.map((f) => f.datos) }
      }, { ok: false }),

    guardar: (athleteId, actividades) =>
      intentar(async () => {
        const filas = actividades
          .filter((a) => a.id != null && a.start_date)
          .map((a) => ({ athlete_id: athleteId, strava_id: a.id, start_date: a.start_date, datos: a, actualizado_at: new Date().toISOString() }))
        if (filas.length === 0) return true
        const res = await rest.supabasePost(
          supabaseHost,
          tabla('strava_actividades', 'on_conflict=athlete_id,strava_id'),
          SERVICE_KEY,
          filas,
          'resolution=merge-duplicates,return=minimal'
        )
        return okStatus(res.status)
      }, false),

    borrarAusentes: (athleteId, desdeIso, ids) =>
      intentar(async () => {
        let q = `athlete_id=eq.${athleteId}&start_date=gte.${encodeURIComponent(desdeIso)}`
        if (ids.length > 0) q += `&strava_id=not.in.(${ids.join(',')})`
        const res = await rest.supabaseDelete(supabaseHost, tabla('strava_actividades', q), SERVICE_KEY)
        return okStatus(res.status)
      }, false),

    guardarSync: (athleteId, campos) =>
      intentar(async () => {
        const res = await rest.supabasePost(
          supabaseHost,
          tabla('strava_sync', 'on_conflict=athlete_id'),
          SERVICE_KEY,
          [{ athlete_id: athleteId, ...campos }],
          'resolution=merge-duplicates,return=minimal'
        )
        return okStatus(res.status)
      }, false),
  }
}

module.exports = { crearStore, dbSupabase, FRESCO_MS, MARGEN_MS }
