// tssPrevisto.js — carga (TSS) PREVISTA de una sesión prescrita, a partir de
// sus pasos. Lógica PURA (sin imports) para node --test.
//
// Misma escala que el TSS real (lib/metrics.js en backend): hrTSS = horas ×
// (intensidad/100)² × 100, con la intensidad como % de FC máxima. La intensidad
// de cada paso sale de su objetivo:
//   - zona Zn → punto medio de la banda de zonaFc (Z1 <60 · Z2 60–70 · … · Z5 ≥90)
//   - FC %    → ese %
//   - ritmo / potencia → Z3 (umbral típico de un trabajo con ritmo marcado)
//   - sin objetivo → Z1 en bici/carrera (el reloj lleva Z1 HR por defecto);
//     natación y fuerza, sin FC fiable → TSS/hora por disciplina, como el real
//     sin pulso (TSS_POR_HORA_SIN_FC).
// Pasos por distancia: se pasan a tiempo con el ritmo del objetivo si lo hay y
// si no con un ritmo de referencia por disciplina. Es una ESTIMACIÓN: el panel
// la muestra con "~".

// Copia de TSS_POR_HORA_SIN_FC (netlify/functions/lib/metrics.js); un test
// comprueba que no se desvían.
export const TSS_POR_HORA_SIN_FC = { swim: 55, bike: 50, run: 65, strength: 40 }

// Punto medio de cada banda de zonaFc (% FC máx)
export const INTENSIDAD_ZONA = { Z1: 55, Z2: 65, Z3: 75, Z4: 85, Z5: 93 }

// Ritmo de referencia cuando un paso por distancia no lo trae (min por km)
const MIN_POR_KM_REF = { run: 5.75, bike: 60 / 27, swim: 21.5 }

const SEG = { s: 1, min: 60, h: 3600 }
const METROS = { mtr: 1, mts: 1, m: 1, km: 1000 }

function normalizarZona(v) {
  const m = /Z([1-5])/i.exec(String(v || ''))
  return m ? `Z${m[1]}` : null
}

// "4:50-5:10" o "5:00" → minutos decimales (media del rango); null si no se entiende
function ritmoMin(valor) {
  const trozos = String(valor || '').replace(/\s+/g, '').split('-')
  const mins = trozos.map((t) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t)
    return m ? Number(m[1]) + Number(m[2]) / 60 : null
  })
  if (mins.length === 0 || mins.some((x) => x == null)) return null
  return mins.reduce((a, b) => a + b, 0) / mins.length
}

function intensidadPaso(paso, disciplina) {
  const tipo = paso.objetivo_tipo
  const valor = paso.objetivo_valor
  if (tipo === 'zona') {
    const z = normalizarZona(valor)
    if (z) return INTENSIDAD_ZONA[z]
  }
  if (tipo === 'fc') {
    const n = Number(valor)
    if (n > 30 && n <= 110) return n
  }
  if ((tipo === 'ritmo' || tipo === 'potencia') && valor) return INTENSIDAD_ZONA.Z3
  if (disciplina === 'bike' || disciplina === 'run') return INTENSIDAD_ZONA.Z1
  return null // natación/fuerza sin objetivo → por TSS/hora
}

// Segundos de un paso (con su ritmo si va por distancia); null si no se puede saber
function segundosPaso(paso, disciplina) {
  const cantidad = Number(paso.cantidad)
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null
  if (SEG[paso.unidad]) return cantidad * SEG[paso.unidad]
  if (!METROS[paso.unidad]) return null
  const km = (cantidad * METROS[paso.unidad]) / 1000
  let minKm = MIN_POR_KM_REF[disciplina]
  if (paso.objetivo_tipo === 'ritmo') {
    const r = ritmoMin(paso.objetivo_valor)
    // En natación el ritmo es por 100 m
    if (r) minKm = disciplina === 'swim' ? r * 10 : r
  }
  return minKm ? km * minKm * 60 : null
}

function tssPaso(segundos, intensidad, disciplina) {
  const horas = segundos / 3600
  if (intensidad != null) return horas * (intensidad / 100) ** 2 * 100
  const factor = TSS_POR_HORA_SIN_FC[disciplina]
  return factor ? horas * factor : 0
}

// TSS previsto de la sesión (entero) o null si no hay con qué estimarlo.
export function tssPrevisto(sesion) {
  if (!sesion) return null
  const disciplina = sesion.disciplina
  if (!TSS_POR_HORA_SIN_FC[disciplina]) return null // 'other' no computa

  const bloques = sesion.workout_steps?.bloques || []
  let total = 0
  let pasos = 0
  for (const b of bloques) {
    const lista = b.tipo === 'repeat' ? b.pasos || [] : [b]
    const veces = b.tipo === 'repeat' ? Number(b.repeticiones) || 0 : 1
    for (const p of lista) {
      const s = segundosPaso(p, disciplina)
      if (s == null) continue
      total += tssPaso(s, intensidadPaso(p, disciplina), disciplina) * veces
      pasos++
    }
  }
  if (pasos > 0) return Math.round(total)

  // Sin pasos (fuerza "tal cual", sesiones antiguas): por duración y disciplina
  const min = Number(sesion.duracion_min)
  return min > 0 ? Math.round((min / 60) * TSS_POR_HORA_SIN_FC[disciplina]) : null
}

// Duración PREVISTA (segundos) de la sesión a partir de sus pasos (los pasos
// por distancia con su ritmo o el de referencia). Si no hay pasos medibles, la
// duracion_min guardada. null si no se puede saber. La usa nutricion.js.
export function segundosPrevistos(sesion) {
  if (!sesion) return null
  const disciplina = sesion.disciplina
  const bloques = sesion.workout_steps?.bloques || []
  let total = 0
  let pasos = 0
  for (const b of bloques) {
    const lista = b.tipo === 'repeat' ? b.pasos || [] : [b]
    const veces = b.tipo === 'repeat' ? Number(b.repeticiones) || 0 : 1
    for (const p of lista) {
      const s = segundosPaso(p, disciplina)
      if (s == null) continue
      total += s * veces
      pasos++
    }
  }
  if (pasos > 0) return Math.round(total)
  const min = Number(sesion.duracion_min)
  return min > 0 ? min * 60 : null
}
