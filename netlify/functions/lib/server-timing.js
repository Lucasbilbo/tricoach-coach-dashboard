// lib/server-timing.js — medidor por petición → cabecera Server-Timing (CommonJS).
// Se ve en DevTools → Network → Timing, sin depender de la retención de logs de
// Netlify. No incluye datos de usuario: solo duración total y contadores.

function crearMedidor(now = Date.now) {
  const inicio = now()
  const cuentas = {}

  return {
    contar(nombre, n = 1) {
      cuentas[nombre] = (cuentas[nombre] || 0) + n
    },
    cabecera() {
      const partes = [`total;dur=${now() - inicio}`]
      for (const [nombre, n] of Object.entries(cuentas)) partes.push(`${nombre};desc="${n}"`)
      return partes.join(', ')
    },
  }
}

module.exports = { crearMedidor }
