// Acceso a datos de la disponibilidad del atleta (cliente de Supabase + RLS).
// Solo el atleta escribe; el coach lee. Lo impone la base de datos (migraciones 010/011).
import { supabase } from './supabase'

export async function cargarDisponibilidad(athleteId) {
  const [semana, fecha] = await Promise.all([
    supabase.from('atleta_disponibilidad_semana').select('id, dia_semana, disciplina, inicio_min, fin_min').eq('athlete_id', athleteId),
    supabase.from('atleta_disponibilidad_fecha').select('id, fecha, tipo, disciplina, inicio_min, fin_min, nota').eq('athlete_id', athleteId).order('fecha'),
  ])
  if (semana.error) throw semana.error
  if (fecha.error) throw fecha.error
  return { plantilla: semana.data || [], excepciones: fecha.data || [] }
}

// Sustituye la semana tipo: inserta los tramos nuevos y DESPUÉS borra los viejos
// (por id), así un fallo a medias duplica tramos pero nunca deja la semana vacía.
export async function guardarPlantilla(athleteId, filasNuevas, idsViejos) {
  const ahora = new Date().toISOString()
  if (filasNuevas.length > 0) {
    const { error } = await supabase.from('atleta_disponibilidad_semana')
      .insert(filasNuevas.map((f) => ({ ...f, athlete_id: athleteId, updated_at: ahora })))
    if (error) throw error
  }
  if (idsViejos.length > 0) {
    const { error } = await supabase.from('atleta_disponibilidad_semana').delete().eq('athlete_id', athleteId).in('id', idsViejos)
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
