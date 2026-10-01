// season.js — Netlify Function (CommonJS)
// Temporada del atleta: calendario de pruebas del año, editable por el propio
// atleta y por su coach. POST + header Authorization: Bearer <jwt de Supabase>.
//
// Acciones (body.action):
//  - 'list'     { athleteId }                 → { eventos, cambios, actores, viewerId }
//  - 'upsert'   { athleteId, evento, id? }    → { evento }
//  - 'delete'   { athleteId, id }             → { ok: true }
//  - 'overview' {}  (solo coaches)            → { atletas, eventos, cambios, actores, viewerId }
//
// La identidad sale SIEMPRE del JWT. athleteId viene del body PORQUE se autoriza
// con canAccessAthlete (propio atleta o coach con relación en coach_athletes).
// Las tablas tienen RLS sin policies: solo esta función (service key) las toca.

const { verifyAuth, canAccessAthlete, UUID_REGEX } = require('./lib/auth')
const { withTimeout, httpsRequest } = require('./lib/http')
const { validarEvento, resumirCambio } = require('./lib/season-validate')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TIMEOUT_MS = 8000
const CAMBIOS_LIMITE = 20
const COLUMNAS =
  'id,athlete_id,nombre,deporte,distancia,fecha,fecha_aprox,estado,prioridad,escenario,precio,url,inscripcion_antes,notas,created_by,updated_by,created_at,updated_at'

function respuesta(statusCode, body) {
  return { statusCode, headers: CORS, body: JSON.stringify(body) }
}

function rest(method, path, payload) {
  const SUPABASE_URL = process.env.SUPABASE_URL
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const body = payload ? JSON.stringify(payload) : undefined
  const headers = {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
  if (body) headers['Content-Length'] = Buffer.byteLength(body)
  return withTimeout(
    httpsRequest({ hostname: new URL(SUPABASE_URL).hostname, path: `/rest/v1/${path}`, method, headers, body }),
    TIMEOUT_MS
  )
}

function ok2xx(res) {
  return res && res.status >= 200 && res.status < 300
}

// Nombres de quienes han editado: coach (si lo es) o perfil.
async function cargarActores(ids) {
  const unicos = [...new Set(ids.filter((id) => UUID_REGEX.test(id || '')))]
  if (!unicos.length) return {}
  const lista = unicos.join(',')
  const [perfiles, coaches] = await Promise.all([
    rest('GET', `profiles?id=in.(${lista})&select=id,nombre`),
    rest('GET', `coaches?id=in.(${lista})&select=id,nombre`),
  ])
  const actores = {}
  for (const p of Array.isArray(perfiles.json) ? perfiles.json : []) actores[p.id] = p.nombre || 'Atleta'
  for (const c of Array.isArray(coaches.json) ? coaches.json : []) actores[c.id] = c.nombre || actores[c.id] || 'Entrenador'
  return actores
}

async function registrarCambio({ athleteId, eventoId, actorId, accion, resumen }) {
  if (!resumen) return
  // Best-effort: un fallo del log no debe deshacer el cambio del usuario.
  try {
    await rest('POST', 'temporada_cambios', {
      athlete_id: athleteId,
      evento_id: eventoId,
      actor_id: actorId,
      accion,
      resumen,
    })
  } catch (err) {
    console.error('[season] no se pudo registrar el cambio', err?.message)
  }
}

async function accionList(auth, athleteId) {
  const [eventosRes, cambiosRes] = await Promise.all([
    rest('GET', `temporada_eventos?athlete_id=eq.${athleteId}&select=${COLUMNAS}&order=fecha.asc.nullslast,created_at.asc`),
    rest('GET', `temporada_cambios?athlete_id=eq.${athleteId}&select=*&order=created_at.desc&limit=${CAMBIOS_LIMITE}`),
  ])
  if (!ok2xx(eventosRes)) return respuesta(502, { error: 'No se pudo cargar la temporada' })
  const eventos = eventosRes.json || []
  const cambios = ok2xx(cambiosRes) ? cambiosRes.json || [] : []
  const actores = await cargarActores([
    ...eventos.map((e) => e.updated_by),
    ...cambios.map((c) => c.actor_id),
  ])
  return respuesta(200, { eventos, cambios, actores, viewerId: auth.uid })
}

async function accionUpsert(auth, athleteId, body) {
  const validacion = validarEvento(body.evento)
  if (!validacion.ok) return respuesta(400, { error: validacion.errores.join('; ') })
  const datos = validacion.evento

  if (body.id != null) {
    if (!UUID_REGEX.test(body.id)) return respuesta(400, { error: 'id inválido' })
    // El filtro por athlete_id impide editar eventos de otro atleta con un id ajeno.
    const prev = await rest('GET', `temporada_eventos?id=eq.${body.id}&athlete_id=eq.${athleteId}&select=${COLUMNAS}`)
    const anterior = Array.isArray(prev.json) ? prev.json[0] : null
    if (!anterior) return respuesta(404, { error: 'Prueba no encontrada' })

    const resumen = resumirCambio(anterior, datos)
    if (!resumen) return respuesta(200, { evento: anterior })

    const upd = await rest('PATCH', `temporada_eventos?id=eq.${body.id}&athlete_id=eq.${athleteId}`, {
      ...datos,
      updated_by: auth.uid,
      updated_at: new Date().toISOString(),
    })
    const evento = Array.isArray(upd.json) ? upd.json[0] : null
    if (!ok2xx(upd) || !evento) return respuesta(502, { error: 'No se pudo guardar la prueba' })
    await registrarCambio({ athleteId, eventoId: evento.id, actorId: auth.uid, accion: 'editar', resumen })
    return respuesta(200, { evento })
  }

  const ins = await rest('POST', 'temporada_eventos', {
    ...datos,
    athlete_id: athleteId,
    created_by: auth.uid,
    updated_by: auth.uid,
  })
  const evento = Array.isArray(ins.json) ? ins.json[0] : null
  if (!ok2xx(ins) || !evento) return respuesta(502, { error: 'No se pudo crear la prueba' })
  await registrarCambio({
    athleteId,
    eventoId: evento.id,
    actorId: auth.uid,
    accion: 'crear',
    resumen: resumirCambio(null, datos),
  })
  return respuesta(200, { evento })
}

async function accionDelete(auth, athleteId, id) {
  if (!UUID_REGEX.test(id || '')) return respuesta(400, { error: 'id inválido' })
  const del = await rest('DELETE', `temporada_eventos?id=eq.${id}&athlete_id=eq.${athleteId}`)
  const borrado = Array.isArray(del.json) ? del.json[0] : null
  if (!ok2xx(del)) return respuesta(502, { error: 'No se pudo borrar la prueba' })
  if (!borrado) return respuesta(404, { error: 'Prueba no encontrada' })
  await registrarCambio({
    athleteId,
    eventoId: id,
    actorId: auth.uid,
    accion: 'borrar',
    resumen: `Quita ${borrado.nombre}`.slice(0, 300),
  })
  return respuesta(200, { ok: true })
}

async function accionOverview(auth) {
  if (!auth.isCoach) return respuesta(403, { error: 'Solo entrenadores' })
  const rel = await rest('GET', `coach_athletes?coach_id=eq.${auth.uid}&select=athlete_id`)
  const ids = (Array.isArray(rel.json) ? rel.json : [])
    .map((r) => r.athlete_id)
    .filter((id) => UUID_REGEX.test(id || ''))
  if (!ids.length) return respuesta(200, { atletas: [], eventos: [], cambios: [], actores: {}, viewerId: auth.uid })

  const lista = ids.join(',')
  const [perfilesRes, eventosRes, cambiosRes] = await Promise.all([
    rest('GET', `profiles?id=in.(${lista})&select=id,nombre`),
    rest('GET', `temporada_eventos?athlete_id=in.(${lista})&estado=neq.descartada&select=${COLUMNAS}&order=fecha.asc.nullslast`),
    rest('GET', `temporada_cambios?athlete_id=in.(${lista})&select=*&order=created_at.desc&limit=${CAMBIOS_LIMITE}`),
  ])
  if (!ok2xx(eventosRes)) return respuesta(502, { error: 'No se pudieron cargar las temporadas' })
  const cambios = ok2xx(cambiosRes) ? cambiosRes.json || [] : []
  const actores = await cargarActores(cambios.map((c) => c.actor_id))
  const atletas = (Array.isArray(perfilesRes.json) ? perfilesRes.json : []).map((p) => ({
    id: p.id,
    nombre: p.nombre || 'Atleta',
  }))
  return respuesta(200, { atletas, eventos: eventosRes.json || [], cambios, actores, viewerId: auth.uid })
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return respuesta(405, { error: 'Method Not Allowed' })

  const auth = await verifyAuth(event)
  if (!auth) return respuesta(401, { error: 'Unauthorized' })

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return respuesta(400, { error: 'JSON inválido' })
  }

  try {
    if (body.action === 'overview') return await accionOverview(auth)

    const { athleteId } = body
    if (!UUID_REGEX.test(athleteId || '')) return respuesta(400, { error: 'athleteId inválido' })
    if (!(await canAccessAthlete(auth, athleteId))) return respuesta(403, { error: 'Sin acceso a este atleta' })

    switch (body.action) {
      case 'list':
        return await accionList(auth, athleteId)
      case 'upsert':
        return await accionUpsert(auth, athleteId, body)
      case 'delete':
        return await accionDelete(auth, athleteId, body.id)
      default:
        return respuesta(400, { error: 'action inválida' })
    }
  } catch (err) {
    console.error('[season]', err?.message)
    return respuesta(500, { error: 'Error interno' })
  }
}
