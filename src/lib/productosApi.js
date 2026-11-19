// Acceso a atleta_productos_nutricion (migración 018): la despensa de cada
// atleta. Lo editan el atleta y su coach vinculado; lo impone la BD (RLS).
// Caché en memoria por atleta (5 min, se invalida al editar y al cambiar de
// usuario). Si la tabla falla (p. ej. aún no existe) → { productos: [],
// disponible: false } y el editor solo deja escribir las notas.
import { supabase } from './supabase'
import { crearCacheValores } from './valueCache'
import { registrarCache } from './clientCache'

const CAMPOS = 'id, athlete_id, nombre, tipo, carbohidratos_g, cafeina_mg, sodio_mg, volumen_ml, receta, orden'
const cache = crearCacheValores({ ttl: 5 * 60 * 1000 })
registrarCache(() => cache.clear())

export function cargarProductos(athleteId) {
  if (!athleteId) return Promise.resolve({ productos: [], disponible: false })
  return cache.get(athleteId, async () => {
    const { data, error } = await supabase
      .from('atleta_productos_nutricion')
      .select(CAMPOS)
      .eq('athlete_id', athleteId)
      .order('orden', { ascending: true })
      .order('created_at', { ascending: true })
    // No se cachean fallos: se lanza y el siguiente intento vuelve a pedir
    if (error) throw error
    return { productos: data || [], disponible: true }
  }).catch(() => ({ productos: [], disponible: false }))
}

export async function crearProducto(athleteId, campos, orden) {
  const { data, error } = await supabase
    .from('atleta_productos_nutricion')
    .insert({ ...campos, athlete_id: athleteId, orden })
    .select(CAMPOS)
    .single()
  cache.invalidate(athleteId)
  if (error) throw error
  return data
}

export async function actualizarProducto(athleteId, id, campos) {
  const { data, error } = await supabase
    .from('atleta_productos_nutricion')
    .update(campos)
    .eq('id', id)
    .select(CAMPOS)
    .single()
  cache.invalidate(athleteId)
  if (error) throw error
  return data
}

export async function borrarProducto(athleteId, id) {
  const { error } = await supabase.from('atleta_productos_nutricion').delete().eq('id', id)
  cache.invalidate(athleteId)
  if (error) throw error
}
