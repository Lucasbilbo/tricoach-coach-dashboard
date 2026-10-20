// lib/ttl-cache.js — caché en memoria con TTL y tope de entradas (CommonJS).
// Vive mientras la instancia de la function esté caliente (best-effort: un arranque
// en frío empieza vacío, nunca da un resultado incorrecto, solo uno más lento).
// Se usa para datos inmutables o casi inmutables de Strava (splits de una
// actividad ya terminada) y así no gastar cuota ni tiempo repitiéndolos.

function crearTtlCache({ ttlMs, max, now = Date.now }) {
  const mapa = new Map() // clave → { t, valor } (el orden de inserción hace de LRU simple)

  function get(clave) {
    const e = mapa.get(clave)
    if (!e) return undefined
    if (now() - e.t >= ttlMs) {
      mapa.delete(clave)
      return undefined
    }
    return e.valor
  }

  function set(clave, valor) {
    mapa.delete(clave)
    mapa.set(clave, { t: now(), valor })
    while (mapa.size > max) mapa.delete(mapa.keys().next().value)
  }

  return { get, set, size: () => mapa.size }
}

module.exports = { crearTtlCache }
