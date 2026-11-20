// Acceso a atleta_potencia (migraciones 021 y 022): potenciómetro, FTP de bici y
// FC de umbral de cada atleta. Lo editan el atleta y su coach vinculado (RLS).
// Caché en memoria 5 min por atleta (se invalida al guardar y al cambiar de
// usuario). Si la tabla falla (p. ej. aún no existe) → disponible:false y la
// bici sigue por pulso.
import { supabase } from './supabase'
import { crearCacheValores } from './valueCache'
import { registrarCache } from './clientCache'
import { authHeaders } from './authHeaders'
import { invalidarDatosAtleta } from './athleteData'
import { ftpValido, fcUmbralValida, fechaFtpNueva } from './potencia'

export { ftpValido, fcUmbralValida } from './potencia'

const CAMPOS = 'athlete_id, potenciometro, ftp_w, ftp_fecha, fc_umbral'
const cache = crearCacheValores({ ttl: 5 * 60 * 1000 })
registrarCache(() => cache.clear())

const VACIO = { potenciometro: false, ftp_w: null, ftp_fecha: null, fc_umbral: null }

export function cargarPotencia(athleteId) {
  if (!athleteId) return Promise.resolve({ ...VACIO, disponible: false })
  return cache.get(athleteId, async () => {
    const { data, error } = await supabase.from('atleta_potencia').select(CAMPOS).eq('athlete_id', athleteId).maybeSingle()
    if (error) throw error // los fallos no se cachean
    return { ...VACIO, ...(data || {}), disponible: true }
  }).catch(() => ({ ...VACIO, disponible: false }))
}

// Sube el FTP guardado a Intervals.icu (función sync-ftp).
// → { ok:true, ftp } | { ok:false, code: 'SIN_FTP'|'NO_INTERVALS'|'INTERVALS_ERROR'|'RED' }
export async function sincronizarFtpIntervals(athleteId) {
  try {
    const res = await fetch('/.netlify/functions/sync-ftp', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ athleteId }),
    })
    const json = await res.json().catch(() => null)
    if (json?.ok) return { ok: true, ftp: json.ftp }
    return { ok: false, code: json?.code || 'INTERVALS_ERROR' }
  } catch {
    return { ok: false, code: 'RED' }
  }
}

// `previo`: lo que había (para no tocar la fecha del FTP si el FTP no cambia).
export async function guardarPotencia(athleteId, uid, { potenciometro, ftp_w, fc_umbral }, previo = {}) {
  const ftp = ftpValido(ftp_w)
  if (ftp === undefined) throw new Error('FTP no válido')
  const umbral = fcUmbralValida(fc_umbral)
  if (umbral === undefined) throw new Error('FC umbral no válida')
  const { data, error } = await supabase
    .from('atleta_potencia')
    .upsert(
      {
        athlete_id: athleteId,
        potenciometro: !!potenciometro,
        ftp_w: ftp,
        ftp_fecha: fechaFtpNueva(previo, ftp),
        fc_umbral: umbral,
        actualizado_por: uid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'athlete_id' }
    )
    .select(CAMPOS)
    .single()
  cache.invalidate(athleteId)
  if (error) throw error
  // El TSS (FTP, FC umbral) cambia: fuera lo cacheado de análisis y panel
  invalidarDatosAtleta(athleteId)
  return { ...data, disponible: true }
}
