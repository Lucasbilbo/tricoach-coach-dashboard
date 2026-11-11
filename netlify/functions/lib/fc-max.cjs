// fc-max.cjs — validación de la FC máxima de un atleta (CommonJS, compartida por
// la función set-fc-max y el formulario del frontend). Sin ella, las métricas
// (TSS, zonas, CTL) usan FC_MAX_DEFAULT = 185 (lib/metrics.js) sin avisar.

const FC_MAX_MIN = 120
const FC_MAX_MAX = 230

// Acepta número o texto numérico; devuelve el entero válido o null.
function validarFcMax(valor) {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor
  if (typeof n !== 'number' || !Number.isInteger(n)) return null
  if (n < FC_MAX_MIN || n > FC_MAX_MAX) return null
  return n
}

module.exports = { validarFcMax, FC_MAX_MIN, FC_MAX_MAX }
