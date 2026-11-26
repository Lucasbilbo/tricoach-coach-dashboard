// Caché en memoria de las respuestas de coach-athlete-data (puro, sin imports:
// se prueba con un fetch inyectado; el cableado real está en athleteData.js).
//
// Por qué: la vista de un atleta pedía hasta 3 veces lo mismo a Strava (rango del
// selector, serie de 26 semanas para ATL/CTL, ventana del estado de sesiones), y
// cambiar el selector o volver al dashboard repetía todo. Aquí:
//  - se DEDUPLICAN las peticiones idénticas en vuelo (una sola llamada),
//  - se reutiliza la respuesta OK durante un TTL corto,
//  - solo se cachean respuestas OK (un error nunca se queda pegado),
//  - se invalida por atleta cuando cambian sus sesiones (la distancia de natación
//    suma los metros de técnica de coach_sessions).
// La clave incluye `records`: con records:true el backend hace llamadas extra a
// Strava (splits), así que no se mezcla con la variante ligera. Y, si hay, el
// rango { desde, hasta }: un tramo concreto no se mezcla con "las últimas N semanas".

export const TTL_MS = 5 * 60 * 1000

export function createAthleteDataCache({ request, now = Date.now, ttl = TTL_MS }) {
  const guardado = new Map() // clave → { t, resultado }
  const enVuelo = new Map() // clave → Promise<resultado>

  const clave = (athleteId, weeks, records, rango) =>
    `${athleteId}|${weeks}|${records ? 1 : 0}${rango ? `|${rango.desde}|${rango.hasta}` : ''}`

  // Devuelve { ok, status, json }. Lanza si la red falla (como fetch).
  // `force` salta la caché (botón de refrescar / reintento explícito).
  // `carga` (semanas, solo con `weeks` más corto): la misma petición trae también
  // la serie larga de ATL/CTL en `json.carga` y se siembra como si se hubiera
  // pedido aparte con (carga, records:false). Netlify ejecuta en cola las
  // peticiones concurrentes de un usuario, así que dos llamadas costaban las dos.
  function get(athleteId, weeks, { records = true, force = false, rango = null, carga = 0 } = {}) {
    const k = clave(athleteId, weeks, records, rango)
    const conCarga = !rango && carga > weeks

    if (!force) {
      const hit = guardado.get(k)
      if (hit && now() - hit.t < ttl) return Promise.resolve(hit.resultado)
      const pendiente = enVuelo.get(k)
      if (pendiente) return pendiente
    }

    const promesa = request(athleteId, weeks, records, rango, conCarga ? carga : 0)
      .then((resultado) => {
        // Si se invalidó el atleta mientras volaba, no guardar un dato posiblemente viejo
        if (resultado.ok && enVuelo.get(k) === promesa) guardado.set(k, { t: now(), resultado })
        return resultado
      })
      .finally(() => {
        if (enVuelo.get(k) === promesa) enVuelo.delete(k)
      })
    enVuelo.set(k, promesa)
    if (conCarga) sembrarCarga(athleteId, carga, promesa, force)
    return promesa
  }

  // Deja en la caché (y en vuelo) la serie larga que viene dentro de `principal`.
  // Si la respuesta no la trae (error parcial del backend), la pide aparte como
  // antes; si la principal falla, el mismo fallo (no se duplica una petición que
  // va a fallar igual, p. ej. 429 o atleta sin Strava).
  function sembrarCarga(athleteId, carga, principal, force) {
    const kc = clave(athleteId, carga, false, null)
    const hit = guardado.get(kc)
    if (!force && ((hit && now() - hit.t < ttl) || enVuelo.has(kc))) return
    const derivada = principal
      .then((r) => {
        if (!r.ok) return r
        if (r.json?.carga) return { ok: true, status: r.status, json: { atleta: r.json.atleta, ...r.json.carga } }
        return request(athleteId, carga, false, null, 0)
      })
      .then((resultado) => {
        if (resultado.ok && enVuelo.get(kc) === derivada) guardado.set(kc, { t: now(), resultado })
        return resultado
      })
      .finally(() => {
        if (enVuelo.get(kc) === derivada) enVuelo.delete(kc)
      })
    derivada.catch(() => {}) // si nadie la espera, que un fallo de red no sea un rechazo suelto
    enVuelo.set(kc, derivada)
  }

  // Olvida todo lo de un atleta (guardado y en vuelo).
  function invalidate(athleteId) {
    const prefijo = `${athleteId}|`
    for (const k of [...guardado.keys()]) if (k.startsWith(prefijo)) guardado.delete(k)
    for (const k of [...enVuelo.keys()]) if (k.startsWith(prefijo)) enVuelo.delete(k)
  }

  function clear() {
    guardado.clear()
    enVuelo.clear()
  }

  return { get, invalidate, clear }
}
