// Acceso a sesion_feedback (cliente de Supabase + RLS, migración 015).
// Escribe solo el atleta y solo sobre sus sesiones; lee él o su coach. Lo
// impone la base de datos.
import { supabase } from './supabase'

const CAMPOS = 'session_id, rpe, sensacion, comentario, molestias, molestias_texto, updated_at'

// Map<session_id, feedback> de un atleta. Si la tabla falla, Map vacío: el
// panel sigue funcionando sin feedback.
export async function cargarFeedback(athleteId) {
  if (!athleteId) return new Map()
  const { data, error } = await supabase.from('sesion_feedback').select(CAMPOS).eq('athlete_id', athleteId)
  if (error) return new Map()
  return new Map((data || []).map((f) => [f.session_id, f]))
}

export async function guardarFeedback(sessionId, athleteId, fila) {
  const { data, error } = await supabase
    .from('sesion_feedback')
    .upsert({ ...fila, session_id: sessionId, athlete_id: athleteId, updated_at: new Date().toISOString() }, { onConflict: 'session_id' })
    .select(CAMPOS)
    .single()
  if (error) throw error
  return data
}

export async function borrarFeedback(sessionId) {
  const { error } = await supabase.from('sesion_feedback').delete().eq('session_id', sessionId)
  if (error) throw error
}
