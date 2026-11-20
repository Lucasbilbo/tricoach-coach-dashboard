// lib/potencia.js — ajustes de carga del atleta (tabla atleta_potencia,
// migraciones 021 y 022): potenciómetro, FTP de bici y FC de umbral.
// FUENTE ÚNICA de lectura para todas las funciones (antes había tres copias:
// send-to-intervals, move-session y las de métricas). Nunca lanza: si la tabla
// falla o no hay fila → sin potenciómetro, sin FTP y FC umbral por defecto.

const CAMPOS = 'potenciometro,ftp_w,fc_umbral'

// Fila (o null) → { potenciometro, ftp, fcUmbral, bikePotencia }. El FTP solo
// cuenta con el interruptor activado (sin medidor no hay TSS por potencia).
// bikePotencia = interruptor Y FTP: sin FTP el reloj no puede pasar las zonas de
// potencia a vatios, así que la bici sigue yendo por pulso (2026-11-20).
function ajustesDeFila(fila) {
  const potenciometro = !!(fila && fila.potenciometro === true)
  const ftp = potenciometro && Number(fila.ftp_w) > 0 ? Number(fila.ftp_w) : null
  return {
    potenciometro,
    ftp,
    fcUmbral: fila && Number(fila.fc_umbral) > 0 ? Number(fila.fc_umbral) : null,
    bikePotencia: ftp != null,
  }
}

// getFilas(pathSinRestV1) → Promise<array | null>. Cada función pasa su cliente.
async function leerAjustes(getFilas, athleteId) {
  try {
    const filas = await getFilas(`atleta_potencia?athlete_id=eq.${athleteId}&select=${CAMPOS}`)
    return ajustesDeFila(Array.isArray(filas) ? filas[0] : null)
  } catch {
    return ajustesDeFila(null)
  }
}

// Con lib/supabase-rest (supabaseGet(host, path, key) → { json })
function leerPotencia(supabaseGet, host, key, athleteId) {
  return leerAjustes(async (path) => (await supabaseGet(host, `/rest/v1/${path}`, key)).json, athleteId)
}

async function leerFtp(supabaseGet, host, key, athleteId) {
  return (await leerPotencia(supabaseGet, host, key, athleteId)).ftp
}

module.exports = { CAMPOS, ajustesDeFila, leerAjustes, leerPotencia, leerFtp }
