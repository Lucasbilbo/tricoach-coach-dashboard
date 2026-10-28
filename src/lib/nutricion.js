// nutricion.js — plan de nutrición DURANTE una sesión prescrita (tabla
// sesion_nutricion, migración 017). Lógica PURA para node --test; el acceso a
// datos está en nutricionApi.js.
//
// Tres cantidades por hora (carbohidratos g/h, líquido ml/h, sodio mg/h) y una
// nota libre ("gel en el min 40", "isotónica cada 20'"). Lo editan el coach y
// el atleta.
//
// La SUGERENCIA es orientativa y por reglas (sin IA), a partir de la duración y
// la intensidad PREVISTAS de la sesión (tssPrevisto.js). Rangos de referencia
// habituales en resistencia (consenso ACSM / Jeukendrup):
//   - < 60–75 min: no hace falta comer; agua si es larga o hace calor.
//   - 75–150 min: 30–60 g/h de carbohidratos.
//   - > 150 min: 60–90 g/h (90 solo si la intensidad es alta y está entrenado
//     el estómago).
//   - Líquido ~400–800 ml/h según duración; sodio ~300–600 mg/h a partir de
//     ~90 min.
// En piscina no se come: como mucho bebida en la pared en sesiones largas.
// Fuerza: agua.
import { segundosPrevistos, tssPrevisto } from './tssPrevisto'

export const LIMITES = { carbohidratos_g_h: 150, liquido_ml_h: 1500, sodio_mg_h: 2000 }
export const LIMITE_NOTAS = 400

// Intensidad a partir del TSS previsto por hora: IF = sqrt(TSS/h / 100).
// ≥ 0,75 ≈ Z3 media o más (sesión de calidad / tempo).
const IF_ALTA = 0.75

export function intensidadPrevista(sesion) {
  const seg = segundosPrevistos(sesion)
  const tss = tssPrevisto(sesion)
  if (!seg || tss == null) return null
  const tssHora = tss / (seg / 3600)
  return Math.sqrt(Math.max(tssHora, 0) / 100)
}

// Sugerencia para una sesión → { carbohidratos_g_h, liquido_ml_h, sodio_mg_h,
// minutos, alta, motivo } o null si no se puede estimar la duración.
export function sugerirNutricion(sesion) {
  if (!sesion) return null
  const seg = segundosPrevistos(sesion)
  if (!seg) return null
  const minutos = Math.round(seg / 60)
  const disciplina = sesion.disciplina
  const intensidad = intensidadPrevista(sesion)
  const alta = intensidad != null && intensidad >= IF_ALTA

  let carbohidratos = 0
  let liquido
  let sodio = 0
  let motivo

  if (disciplina === 'swim') {
    liquido = minutos >= 75 ? 300 : 0
    motivo = minutos >= 75 ? 'Piscina: un bidón en la pared y come al salir.' : 'Piscina: nada durante; bebe al salir.'
  } else if (disciplina === 'strength') {
    liquido = minutos >= 45 ? 400 : 0
    motivo = 'Fuerza: agua según sed.'
  } else if (disciplina === 'bike' || disciplina === 'run') {
    if (minutos < 60) {
      motivo = 'Menos de una hora: no hace falta comer.'
      liquido = minutos >= 45 ? 400 : 0
    } else if (minutos < 75) {
      carbohidratos = alta ? 30 : 0
      liquido = 500
      motivo = alta ? 'Una hora con calidad: algo de hidrato ayuda.' : 'Una hora suave: con agua basta.'
    } else if (minutos <= 150) {
      carbohidratos = alta ? 60 : 45
      liquido = 600
      sodio = minutos >= 90 ? 400 : 0
      motivo = 'Entre 1h15 y 2h30: 30–60 g/h.'
    } else {
      carbohidratos = alta ? 90 : 70
      liquido = 700
      sodio = 500
      motivo = 'Más de 2h30: 60–90 g/h; entrena el estómago para lo de carrera.'
    }
    // Carrera: el estómago tolera algo menos que en bici
    if (disciplina === 'run' && carbohidratos > 60) carbohidratos = 60
  } else {
    return null
  }

  return { carbohidratos_g_h: carbohidratos, liquido_ml_h: liquido, sodio_mg_h: sodio, minutos, alta, motivo }
}

const cantidad = (v, max) => {
  if (v === '' || v == null) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

// Formulario → fila para guardar (sin session_id/athlete_id), o null si no
// dice nada (la BD rechaza una fila vacía).
export function normalizarNutricion(form) {
  const notas = typeof form?.notas === 'string' ? form.notas.trim().slice(0, LIMITE_NOTAS) : ''
  const fila = {
    carbohidratos_g_h: cantidad(form?.carbohidratos_g_h, LIMITES.carbohidratos_g_h),
    liquido_ml_h: cantidad(form?.liquido_ml_h, LIMITES.liquido_ml_h),
    sodio_mg_h: cantidad(form?.sodio_mg_h, LIMITES.sodio_mg_h),
    notas: notas || null,
  }
  const vacio = fila.carbohidratos_g_h == null && fila.liquido_ml_h == null && fila.sodio_mg_h == null && !fila.notas
  return vacio ? null : fila
}

// "60 g/h · 600 ml/h · 400 mg sodio/h" (solo lo que haya; 0 g/h → "sin comer")
export function resumenNutricion(n) {
  if (!n) return ''
  const partes = []
  if (n.carbohidratos_g_h != null) partes.push(n.carbohidratos_g_h === 0 ? 'Sin comer' : `${n.carbohidratos_g_h} g/h`)
  if (n.liquido_ml_h) partes.push(`${n.liquido_ml_h} ml/h`)
  if (n.sodio_mg_h) partes.push(`${n.sodio_mg_h} mg sodio/h`)
  return partes.join(' · ')
}

// Totales de la sesión para llevar encima: "≈ 2 h 15 → 135 g · 1,4 l"
export function totalesNutricion(n, minutos) {
  if (!n || !minutos) return null
  const h = minutos / 60
  const g = n.carbohidratos_g_h ? Math.round(n.carbohidratos_g_h * h) : 0
  const ml = n.liquido_ml_h ? Math.round((n.liquido_ml_h * h) / 50) * 50 : 0
  if (!g && !ml) return null
  return { gramos: g, mililitros: ml }
}

// ── Lo que TOMÓ el atleta (fase 2) ─────────────────────────────────────────
// Lo apunta el atleta después (o el mismo día): cuánto tomó de verdad y qué tal
// le sentó. Sirve para ensayar la estrategia de carrera: Jon ve plan vs real.

export const LIMITE_NOTAS_TOMADO = 300

export const ESTOMAGO = [
  { value: 1, label: 'Mal' },
  { value: 2, label: 'Regular' },
  { value: 3, label: 'Bien' },
]

export function etiquetaEstomago(v) {
  return ESTOMAGO.find((e) => e.value === v)?.label || ''
}

export const CAMPOS_PLAN = ['carbohidratos_g_h', 'liquido_ml_h', 'sodio_mg_h', 'notas']
export const CAMPOS_TOMADO = ['tomado_carbohidratos_g_h', 'tomado_liquido_ml_h', 'estomago', 'tomado_notas']

const tieneAlgo = (n, campos) => !!n && campos.some((c) => n[c] != null && n[c] !== '')
export const tienePlan = (n) => tieneAlgo(n, CAMPOS_PLAN)
export const tieneTomado = (n) => tieneAlgo(n, CAMPOS_TOMADO)

// Formulario → campos tomado_* o null si no dice nada
export function normalizarTomado(form) {
  const notas = typeof form?.tomado_notas === 'string' ? form.tomado_notas.trim().slice(0, LIMITE_NOTAS_TOMADO) : ''
  const est = Number(form?.estomago)
  const fila = {
    tomado_carbohidratos_g_h: cantidad(form?.tomado_carbohidratos_g_h, LIMITES.carbohidratos_g_h),
    tomado_liquido_ml_h: cantidad(form?.tomado_liquido_ml_h, LIMITES.liquido_ml_h),
    estomago: Number.isInteger(est) && est >= 1 && est <= 3 ? est : null,
    tomado_notas: notas || null,
  }
  const vacio = fila.tomado_carbohidratos_g_h == null && fila.tomado_liquido_ml_h == null && fila.estomago == null && !fila.tomado_notas
  return vacio ? null : fila
}

// "50 de 60 g/h · 500 ml/h · Estómago regular" (con el plan al lado si lo hay)
export function resumenTomado(n) {
  if (!tieneTomado(n)) return ''
  const partes = []
  const c = n.tomado_carbohidratos_g_h
  if (c != null) {
    partes.push(n.carbohidratos_g_h != null && n.carbohidratos_g_h > 0 ? `${c} de ${n.carbohidratos_g_h} g/h` : `${c} g/h`)
  }
  const l = n.tomado_liquido_ml_h
  if (l != null) {
    partes.push(n.liquido_ml_h ? `${l} de ${n.liquido_ml_h} ml/h` : `${l} ml/h`)
  }
  if (n.estomago) partes.push(`Estómago ${etiquetaEstomago(n.estomago).toLowerCase()}`)
  return partes.join(' · ')
}

// ¿Merece aviso para el coach? Estómago mal o hidratos < 70 % de lo planificado.
export function avisoTomado(n) {
  if (!tieneTomado(n)) return null
  if (n.estomago === 1) return 'Le sentó mal'
  const plan = n.carbohidratos_g_h
  const real = n.tomado_carbohidratos_g_h
  if (plan > 0 && real != null && real < plan * 0.7) return 'Comió bastante menos de lo previsto'
  return null
}

// ── Formulario del plan (compartido por la tarjeta y el creador de sesiones) ──
export const formPlanDe = (n) => ({
  carbohidratos_g_h: n?.carbohidratos_g_h ?? '',
  liquido_ml_h: n?.liquido_ml_h ?? '',
  sodio_mg_h: n?.sodio_mg_h ?? '',
  notas: n?.notas ?? '',
})

// Valores sugeridos → formulario del plan (conserva las notas)
export const aplicarSugerencia = (form, s) => ({
  ...form,
  carbohidratos_g_h: s.carbohidratos_g_h,
  liquido_ml_h: s.liquido_ml_h || '',
  sodio_mg_h: s.sodio_mg_h || '',
})

// 135 → "2 h 15" · 50 → "50 min"
export function formatDuracion(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`
}
