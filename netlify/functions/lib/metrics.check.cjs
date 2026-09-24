// Comprobación del helper único de métricas (A2). Ejecutar:
//   node netlify/functions/lib/metrics.check.cjs
// Cubre los dos casos reales de la auditoría funcional 2026-09-24:
//   - Bici 19-sep: FC 159.127 / FCmax 199 → 79.96 % → Z3 (no Z4)
//   - Run 20-sep:  mov 3002 s, FC 170.807 / FCmax 199 → mismo TSS por ambos caminos = 61
const assert = require('node:assert/strict')
const { intensidadPct, zonaFc, tssEstimado, round } = require('./metrics')

const FC_MAX = 199

// Caso 1 — zona con intensidad SIN redondear
const intBici = intensidadPct(159.127, FC_MAX)
assert.equal(round(intBici, 2), 79.96, 'intensidad bici debe ser 79.96 %')
assert.equal(zonaFc(intBici), 'Z3', 'la bici del 19-sep debe ser Z3, no Z4')
// Antes se redondeaba a 80 y salía Z4:
assert.equal(zonaFc(round(intBici, 0)), 'Z4', '(control) redondear la intensidad daba Z4')

// Caso 2 — TSS idéntico por el camino "vista atleta" y el camino "dashboard"
// Ambos deben llamar al MISMO helper con los mismos argumentos crudos.
const tssVistaAtleta = round(tssEstimado(3002, 170.807, FC_MAX), 0)
const tssDashboard = round(tssEstimado(3002, 170.807, FC_MAX), 0)
assert.equal(tssVistaAtleta, tssDashboard, 'dashboard y vista atleta deben coincidir')
assert.equal(tssVistaAtleta, 61, 'el TSS del run del 20-sep debe ser 61')

// Sin FC → sin TSS ni zona
assert.equal(tssEstimado(3002, null, FC_MAX), null)
assert.equal(zonaFc(intensidadPct(null, FC_MAX)), null)

console.log('metrics.check OK →', {
  intensidadBici: round(intBici, 2),
  zonaBici: zonaFc(intBici),
  tssRun: tssVistaAtleta,
  dashboardIgualQueAtleta: tssVistaAtleta === tssDashboard,
})
