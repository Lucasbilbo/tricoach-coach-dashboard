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
// Strava (splits), así que no se mezcla con la variante ligera.

export const TTL_MS = 5 * 60 * 1000

export function createAthleteDataCache({ request, now = Date.now, ttl = TTL_MS }) {
  const guardado = new Map() // clave → { t, resultado }
  const enVuelo = new Map() // clave → Promise<resultado>

  const clave = (athleteId, weeks, records) => `${athleteId}|${weeks}|${records ? 1 : 0}`

  // Devuelve { ok, status, json }. Lanza si la red falla (como fetch).
  // `force` salta la caché (botón de refrescar / reintento explícito).
  function get(athleteId, weeks, { records = true, force = false } = {}) {
    const k = clave(athleteId, weeks, records)

    if (!force) {
      const hit = guardado.get(k)
      if (hit && now() - hit.t < ttl) return Promise.resolve(hit.resultado)
      const pendiente = enVuelo.get(k)
      if (pendiente) return pendiente
    }

    const promesa = request(athleteId, weeks, records)
      .then((resultado) => {
        // Si se invalidó el atleta mientras volaba, no guardar un dato posiblemente viejo
        if (resultado.ok && enVuelo.get(k) === promesa) guardado.set(k, { t: now(), resultado })
        return resultado
      })
      .finally(() => {
        if (enVuelo.get(k) === promesa) enVuelo.delete(k)
      })
    enVuelo.set(k, promesa)
    return promesa
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
