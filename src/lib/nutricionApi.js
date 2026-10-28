// Acceso a sesion_nutricion (cliente de Supabase + RLS, migración 017).
// Escriben el atleta de la sesión o su coach vinculado; lo impone la BD.
import { supabase } from './supabase'

const CAMPOS = 'session_id, athlete_id, carbohidratos_g_h, liquido_ml_h, sodio_mg_h, notas, actualizado_por, updated_at'

// Map<session_id, nutricion> de un atleta. Si la tabla falla (p. ej. aún no
// existe), { mapa vacío, disponible: false }: la sección no se muestra.
export async function cargarNutricion(athleteId) {
  if (!athleteId) return { mapa: new Map(), disponible: false }
  const { data, error } = await supabase.from('sesion_nutricion').select(CAMPOS).eq('athlete_id', athleteId)
  if (error) return { mapa: new Map(), disponible: false }
  return { mapa: new Map((data || []).map((n) => [n.session_id, n])), disponible: true }
}

export async function guardarNutricion(sessionId, athleteId, uid, fila) {
  const { data, error } = await supabase
    .from('sesion_nutricion')
    .upsert(
      { ...fila, session_id: sessionId, athlete_id: athleteId, actualizado_por: uid, updated_at: new Date().toISOString() },
      { onConflict: 'session_id' }
    )
    .select(CAMPOS)
    .single()
  if (error) throw error
  return data
}

export async function borrarNutricion(sessionId) {
  const { error } = await supabase.from('sesion_nutricion').delete().eq('session_id', sessionId)
  if (error) throw error
}
