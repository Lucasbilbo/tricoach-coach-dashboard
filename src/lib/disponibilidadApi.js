// Acceso a datos de la disponibilidad del atleta (cliente de Supabase + RLS).
// Solo el atleta escribe; el coach lee. Lo impone la base de datos (migración 010).
import { supabase } from './supabase'

export async function cargarDisponibilidad(athleteId) {
  const [semana, fecha] = await Promise.all([
    supabase.from('atleta_disponibilidad_semana').select('dia_semana, disciplina, max_minutos, updated_at').eq('athlete_id', athleteId),
    supabase.from('atleta_disponibilidad_fecha').select('id, fecha, tipo, disciplina, max_minutos, nota, updated_at').eq('athlete_id', athleteId).order('fecha'),
  ])
  if (semana.error) throw semana.error
  if (fecha.error) throw fecha.error
  return { plantilla: semana.data || [], excepciones: fecha.data || [] }
}

// cambios: salida de cambiosPlantilla(). Escribe primero y borra después.
export async function guardarPlantilla(athleteId, cambios) {
  const ahora = new Date().toISOString()
  if (cambios.upsert.length > 0) {
    const filas = cambios.upsert.map((c) => ({ ...c, athlete_id: athleteId, updated_at: ahora }))
    const { error } = await supabase.from('atleta_disponibilidad_semana').upsert(filas, { onConflict: 'athlete_id,dia_semana,disciplina' })
    if (error) throw error
  }
  for (const b of cambios.borrar) {
    const { error } = await supabase.from('atleta_disponibilidad_semana').delete()
      .eq('athlete_id', athleteId).eq('dia_semana', b.dia_semana).eq('disciplina', b.disciplina)
    if (error) throw error
  }
}

// Sustituye toda la excepción de esa fecha por las filas nuevas.
export async function guardarExcepcion(athleteId, fecha, filas) {
  const del = await supabase.from('atleta_disponibilidad_fecha').delete().eq('athlete_id', athleteId).eq('fecha', fecha)
  if (del.error) throw del.error
  const ahora = new Date().toISOString()
  const { error } = await supabase.from('atleta_disponibilidad_fecha')
    .insert(filas.map((f) => ({ ...f, athlete_id: athleteId, updated_at: ahora })))
  if (error) throw error
}

export async function borrarExcepcion(athleteId, fecha) {
  const { error } = await supabase.from('atleta_disponibilidad_fecha').delete().eq('athlete_id', athleteId).eq('fecha', fecha)
  if (error) throw error
}
