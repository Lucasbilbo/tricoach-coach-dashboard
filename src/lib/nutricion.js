// nutricion.js — plan de nutrición DURANTE una sesión prescrita (tabla
// sesion_nutricion, migración 017). Lógica PURA para node --test; el acceso a
// datos está en nutricionApi.js.
//
// El plan es una lista de PRODUCTOS (despensa del atleta, productosNutricion.js:
// "3 × gel 45 g, 2 × bidón 750") y una nota libre ("gel en el min 40"). Los g/h
// se calculan con la duración (`planEfectivo`). Los planes antiguos guardaban
// tres cantidades por hora (carbohidratos g/h, líquido ml/h, sodio mg/h) y se
// siguen mostrando. Lo editan el coach y el atleta.
//
// Sin sugerencias automáticas (decidido 2026-11-19): Jon rellena el plan a mano.

import {
  itemsDe, normalizarClaves, normalizarItems, planEfectivo, porHora, resumenItems, tomadasValidas, totalesTomados,
} from './productosNutricion'

export const LIMITES = { carbohidratos_g_h: 150, liquido_ml_h: 1500, sodio_mg_h: 2000 }
export const LIMITE_NOTAS = 400

const cantidad = (v, max) => {
  if (v === '' || v == null) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null
}

// Formulario → fila para guardar (sin session_id/athlete_id), o null si no
// dice nada (la BD rechaza una fila vacía).
export function normalizarNutricion(form) {
  const notas = typeof form?.notas === 'string' ? form.notas.trim().slice(0, LIMITE_NOTAS) : ''
  const productos = normalizarItems(form?.productos)
  // Con productos, las cantidades por hora antiguas dejan de valer (se calculan)
  const fila = {
    carbohidratos_g_h: productos ? null : cantidad(form?.carbohidratos_g_h, LIMITES.carbohidratos_g_h),
    liquido_ml_h: productos ? null : cantidad(form?.liquido_ml_h, LIMITES.liquido_ml_h),
    sodio_mg_h: productos ? null : cantidad(form?.sodio_mg_h, LIMITES.sodio_mg_h),
    productos,
    notas: notas || null,
  }
  const vacio = fila.carbohidratos_g_h == null && fila.liquido_ml_h == null && fila.sodio_mg_h == null && !fila.productos && !fila.notas
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

export const CAMPOS_PLAN = ['carbohidratos_g_h', 'liquido_ml_h', 'sodio_mg_h', 'productos', 'notas']
export const CAMPOS_TOMADO = ['tomado_carbohidratos_g_h', 'tomado_liquido_ml_h', 'estomago', 'tomado_items', 'tomado_notas']

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
    tomado_items: normalizarClaves(form?.tomado_items),
    tomado_notas: notas || null,
  }
  const vacio = fila.tomado_carbohidratos_g_h == null && fila.tomado_liquido_ml_h == null && fila.estomago == null && !fila.tomado_items && !fila.tomado_notas
  return vacio ? null : fila
}

// Con lista de unidades marcadas, los g/h y ml/h tomados se CALCULAN de lo que
// marcó (misma duración que el plan, así la comparación es exacta). Sin
// marcas, la fila queda como está (planes antiguos: lo escribía a mano).
export function tomadoEfectivo(n, minutos) {
  const items = itemsDe(n)
  if (!n || !items.length || !Array.isArray(n.tomado_items)) return n
  const ph = porHora(totalesTomados(items, n.tomado_items), minutos)
  return { ...n, tomado_carbohidratos_g_h: ph ? ph.carbohidratos_g_h : null, tomado_liquido_ml_h: ph ? ph.liquido_ml_h : null }
}

// Plan y tomado con todo lo calculado (lo que pintan la tarjeta y los avisos)
export const nutricionEfectiva = (n, minutos) => tomadoEfectivo(planEfectivo(n, minutos), minutos)

// "3/5 · 50 de 60 g/h · 500 ml/h · Estómago regular" (con el plan al lado si lo hay)
export function resumenTomado(n) {
  if (!tieneTomado(n)) return ''
  const partes = []
  const items = itemsDe(n)
  if (items.length && Array.isArray(n.tomado_items)) {
    const total = items.reduce((t, it) => t + (it.cantidad || 0), 0)
    partes.push(`${tomadasValidas(items, n.tomado_items).length}/${total}`)
  }
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
  productos: itemsDe(n),
  notas: n?.notas ?? '',
})

// Resumen del plan para la cabecera: productos si los hay (con los g/h si se
// sabe la duración) y si no, las cantidades por hora de los planes antiguos.
export function resumenPlan(n, minutos) {
  const items = itemsDe(n)
  if (!items.length) return resumenNutricion(n)
  const ef = planEfectivo(n, minutos)
  return [resumenItems(items), ef.carbohidratos_g_h > 0 ? `${ef.carbohidratos_g_h} g/h` : ''].filter(Boolean).join(' · ')
}
