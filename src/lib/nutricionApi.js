// Acceso a sesion_nutricion (cliente de Supabase + RLS, migración 017).
// Escriben el atleta de la sesión o su coach vinculado; lo impone la BD.
// Una fila por sesión con el PLAN (carbohidratos/líquido/sodio/notas) y lo
// TOMADO (tomado_*, estomago). Los guardados son parciales: un upsert solo toca
// las columnas que manda (PostgREST merge-duplicates), así guardar el plan no
// pisa lo tomado y al revés.
import { supabase } from './supabase'
import { CAMPOS_PLAN, CAMPOS_TOMADO, tienePlan, tieneTomado } from './nutricion'

const CAMPOS = [
  'session_id', 'athlete_id', ...CAMPOS_PLAN, ...CAMPOS_TOMADO, 'actualizado_por', 'updated_at',
].join(', ')

// Map<session_id, nutricion> de un atleta. Si la tabla falla (p. ej. aún no
// existe), { mapa vacío, disponible: false }: la sección no se muestra.
export async function cargarNutricion(athleteId) {
  if (!athleteId) return { mapa: new Map(), disponible: false }
  const { data, error } = await supabase.from('sesion_nutricion').select(CAMPOS).eq('athlete_id', athleteId)
  if (error) return { mapa: new Map(), disponible: false }
  return { mapa: new Map((data || []).map((n) => [n.session_id, n])), disponible: true }
}

// ¿Existe la tabla? (para el creador de sesiones, que no carga el mapa).
// Una consulta por carga de página; si falla se reintenta la próxima vez.
let disponiblePromesa = null
export function nutricionDisponible() {
  if (!disponiblePromesa) {
    disponiblePromesa = supabase
      .from('sesion_nutricion')
      .select('session_id', { head: true, count: 'exact' })
      .limit(1)
      .then(({ error }) => {
        if (error) disponiblePromesa = null
        return !error
      })
  }
  return disponiblePromesa
}

// Guarda SOLO las columnas de `campos` (plan o tomado). Devuelve la fila entera.
export async function guardarNutricion(sessionId, athleteId, uid, campos) {
  const { data, error } = await supabase
    .from('sesion_nutricion')
    .upsert(
      { ...campos, session_id: sessionId, athlete_id: athleteId, actualizado_por: uid, updated_at: new Date().toISOString() },
      { onConflict: 'session_id' }
    )
    .select(CAMPOS)
    .single()
  if (error) throw error
  return data
}

// Quita el plan o lo tomado. Si la otra parte sigue teniendo datos se ponen a
// null solo esas columnas; si no, se borra la fila (la BD no admite filas
// vacías). Devuelve la fila que queda o null.
export async function quitarParte(sessionId, athleteId, uid, actual, parte) {
  const campos = parte === 'plan' ? CAMPOS_PLAN : CAMPOS_TOMADO
  const quedaOtra = parte === 'plan' ? tieneTomado(actual) : tienePlan(actual)
  if (quedaOtra) {
    return guardarNutricion(sessionId, athleteId, uid, Object.fromEntries(campos.map((c) => [c, null])))
  }
  const { error } = await supabase.from('sesion_nutricion').delete().eq('session_id', sessionId)
  if (error) throw error
  return null
}
