// Caché de valores por clave (puro, sin imports): deduplica en vuelo, reutiliza el
// valor durante un TTL y NUNCA guarda un fallo (si `cargar` rechaza, el siguiente
// get vuelve a intentarlo). Invalidar durante un vuelo descarta su resultado.

export function crearCacheValores({ ttl, now = Date.now }) {
  const guardado = new Map() // clave → { t, valor }
  const enVuelo = new Map() // clave → Promise

  function get(clave, cargar, { force = false } = {}) {
    if (!force) {
      const hit = guardado.get(clave)
      if (hit && now() - hit.t < ttl) return Promise.resolve(hit.valor)
      const pendiente = enVuelo.get(clave)
      if (pendiente) return pendiente
    }
    const promesa = Promise.resolve()
      .then(cargar)
      .then((valor) => {
        if (enVuelo.get(clave) === promesa) guardado.set(clave, { t: now(), valor })
        return valor
      })
      .finally(() => {
        if (enVuelo.get(clave) === promesa) enVuelo.delete(clave)
      })
    enVuelo.set(clave, promesa)
    return promesa
  }

  function invalidate(clave) {
    guardado.delete(clave)
    enVuelo.delete(clave)
  }

  function clear() {
    guardado.clear()
    enVuelo.clear()
  }

  return { get, invalidate, clear }
}
