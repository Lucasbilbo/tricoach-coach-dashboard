// lib/jwt-local.js — verificación del JWT de Supabase DENTRO de la función
// (CommonJS, sin dependencias: módulo crypto de Node).
//
// Por qué (auditoría de rendimiento 2026-11-25): verifyAuth preguntaba a
// GoTrue (GET /auth/v1/user) en CADA llamada. Con las functions en Ohio y
// Supabase en Frankfurt eso es ~300 ms por función antes de hacer nada.
//
// Cómo:
//  - Claves asimétricas (ES256/RS256, las «JWT signing keys» de Supabase): se
//    descargan del JWKS público del proyecto UNA vez por instancia (caché de
//    10 min; si llega un kid desconocido se vuelve a pedir, como mucho una vez
//    por minuto) y la firma se comprueba en local.
//  - Secreto clásico (HS256): solo si existe SUPABASE_JWT_SECRET en el entorno.
//  - Cualquier otro caso (sin JWKS, kid desconocido, alg raro, sin secreto):
//    devuelve `undefined` y verifyAuth cae al camino de siempre (GoTrue).
//
// Devuelve: { uid } si es válido · null si es INVÁLIDO (firma, caducidad,
// emisor, audiencia o rol) · undefined si no se puede decidir aquí.
// Diferencia con GoTrue: no ve cierres de sesión anteriores a la caducidad del
// token (1 h por defecto). Es el modelo estándar de JWT y el que recomienda
// Supabase para verificar en servidores.

const crypto = require('crypto')
const https = require('https')

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JWKS_TTL_MS = 10 * 60 * 1000
const JWKS_REINTENTO_MS = 60 * 1000
const HOLGURA_S = 30 // reloj del servidor vs el de Supabase

function b64url(s) {
  return Buffer.from(s, 'base64url')
}

function getJson(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => {
        try {
          resolve(res.statusCode === 200 ? JSON.parse(data) : null)
        } catch {
          resolve(null)
        }
      })
    })
    req.on('timeout', () => { req.destroy(); resolve(null) })
    req.on('error', () => resolve(null))
  })
}

// Caché de claves por instancia. `descargar` se inyecta en los tests.
function crearVerificador({ supabaseUrl, secreto = null, descargar = getJson, now = Date.now }) {
  const base = String(supabaseUrl || '').replace(/\/+$/, '')
  const emisor = `${base}/auth/v1`
  let claves = null // Map kid → KeyObject
  let cargadasEn = 0
  let ultimoForzado = -Infinity
  let enVuelo = null

  async function cargarClaves(forzar = false) {
    const t = now()
    if (!forzar && claves && t - cargadasEn < JWKS_TTL_MS) return claves
    if (enVuelo) return enVuelo
    if (forzar) {
      if (t - ultimoForzado < JWKS_REINTENTO_MS) return claves
      ultimoForzado = t
    }
    enVuelo = (async () => {
      const json = await descargar(`${emisor}/.well-known/jwks.json`)
      const mapa = new Map()
      for (const jwk of Array.isArray(json?.keys) ? json.keys : []) {
        if (!jwk.kid || (jwk.kty !== 'EC' && jwk.kty !== 'RSA')) continue
        try {
          mapa.set(jwk.kid, { alg: jwk.alg, key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) })
        } catch {
          // clave que Node no entiende: se ignora
        }
      }
      if (json) {
        claves = mapa
        cargadasEn = now()
      }
      return claves
    })()
    try {
      return await enVuelo
    } finally {
      enVuelo = null
    }
  }

  function claimsValidos(p) {
    const ahora = Math.floor(now() / 1000)
    if (typeof p.exp !== 'number' || p.exp + HOLGURA_S < ahora) return false
    if (typeof p.nbf === 'number' && p.nbf - HOLGURA_S > ahora) return false
    if (p.iss !== emisor) return false
    const aud = Array.isArray(p.aud) ? p.aud : [p.aud]
    if (!aud.includes('authenticated')) return false
    if (p.role !== 'authenticated') return false
    return typeof p.sub === 'string' && UUID_REGEX.test(p.sub)
  }

  async function verificar(jwt) {
    if (!base || typeof jwt !== 'string') return undefined
    const partes = jwt.split('.')
    if (partes.length !== 3) return null
    let cab, payload
    try {
      cab = JSON.parse(b64url(partes[0]).toString('utf8'))
      payload = JSON.parse(b64url(partes[1]).toString('utf8'))
    } catch {
      return null
    }
    const datos = Buffer.from(`${partes[0]}.${partes[1]}`)
    const firma = b64url(partes[2])

    let ok
    if (cab.alg === 'HS256') {
      if (!secreto) return undefined
      const esperada = crypto.createHmac('sha256', secreto).update(datos).digest()
      ok = esperada.length === firma.length && crypto.timingSafeEqual(esperada, firma)
    } else if (cab.alg === 'ES256' || cab.alg === 'RS256') {
      let mapa = await cargarClaves()
      let entrada = mapa && mapa.get(cab.kid)
      if (!entrada) {
        mapa = await cargarClaves(true) // ¿rotación de claves?
        entrada = mapa && mapa.get(cab.kid)
      }
      if (!entrada) return undefined
      try {
        ok =
          cab.alg === 'ES256'
            ? crypto.verify('sha256', datos, { key: entrada.key, dsaEncoding: 'ieee-p1363' }, firma)
            : crypto.verify('RSA-SHA256', datos, entrada.key, firma)
      } catch {
        ok = false
      }
    } else {
      return undefined
    }

    if (!ok) return null
    return claimsValidos(payload) ? { uid: payload.sub } : null
  }

  return { verificar }
}

// Uno por instancia (las claves se comparten entre invocaciones calientes)
let porDefecto = null
function verificarLocal(jwt) {
  if (!porDefecto) {
    porDefecto = crearVerificador({
      supabaseUrl: process.env.SUPABASE_URL,
      secreto: process.env.SUPABASE_JWT_SECRET || null,
    })
  }
  return porDefecto.verificar(jwt)
}

module.exports = { crearVerificador, verificarLocal }
