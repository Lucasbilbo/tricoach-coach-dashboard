// Números para LEER (no para exportar): coma decimal en español, «6,02 km».
// El CSV sigue con punto (activityFormat), que es lo que entienden las hojas.
export function num(n, decimales = 2) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return n
  return Number(n).toLocaleString('es-ES', { maximumFractionDigits: decimales })
}
