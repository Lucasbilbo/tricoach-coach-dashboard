// Acceso a atleta_potencia (migración 021): potenciómetro y FTP de bici de cada
// atleta. Lo editan el atleta y su coach vinculado (RLS). Caché en memoria 5 min
// por atleta (se invalida al guardar y al cambiar de usuario). Si la tabla falla
// (p. ej. aún no existe) → disponible:false y la bici sigue por pulso.
import { supabase } from './supabase'
import { crearCacheValores } from './valueCache'
import { registrarCache } from './clientCache'

const CAMPOS = 'athlete_id, potenciometro, ftp_w, ftp_fecha'
const cache = crearCacheValores({ ttl: 5 * 60 * 1000 })
registrarCache(() => cache.clear())

const VACIO = { potenciometro: false, ftp_w: null, ftp_fecha: null }

export function cargarPotencia(athleteId) {
  if (!athleteId) return Promise.resolve({ ...VACIO, disponible: false })
  return cache.get(athleteId, async () => {
    const { data, error } = await supabase.from('atleta_potencia').select(CAMPOS).eq('athlete_id', athleteId).maybeSingle()
    if (error) throw error // los fallos no se cachean
    return { ...VACIO, ...(data || {}), disponible: true }
  }).catch(() => ({ ...VACIO, disponible: false }))
}

// ftp_w: entero 50–700 o null
export function ftpValido(v) {
  if (v === '' || v == null) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 50 && n <= 700 ? n : undefined // undefined = inválido
}

export async function guardarPotencia(athleteId, uid, { potenciometro, ftp_w }) {
  const ftp = ftpValido(ftp_w)
  if (ftp === undefined) throw new Error('FTP no válido')
  const { data, error } = await supabase
    .from('atleta_potencia')
    .upsert(
      {
        athlete_id: athleteId,
        potenciometro: !!potenciometro,
        ftp_w: ftp,
        ftp_fecha: ftp ? new Date().toISOString().slice(0, 10) : null,
        actualizado_por: uid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id' }
    )
    .select(CAMPOS)
    .single()
  cache.invalidate(athleteId)
  if (error) throw error
  return { ...data, disponible: true }
}
