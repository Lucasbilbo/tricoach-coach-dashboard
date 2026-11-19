// lib/potencia.js — FTP de bici del atleta (tabla atleta_potencia, migración 021).
// Devuelve los vatios SOLO si el atleta tiene el potenciómetro activado y un FTP
// guardado; si no (o si la tabla aún no existe / falla) → null y la carga sigue
// calculándose por pulso. Nunca lanza.

async function leerPotencia(supabaseGet, host, key, athleteId) {
  try {
    const res = await supabaseGet(
      host,
      `/rest/v1/atleta_potencia?athlete_id=eq.${athleteId}&select=potenciometro,ftp_w`,
      key
    )
    const fila = Array.isArray(res.json) ? res.json[0] : null
    return {
      potenciometro: !!(fila && fila.potenciometro),
      ftp: fila && fila.potenciometro && fila.ftp_w > 0 ? Number(fila.ftp_w) : null,
    }
  } catch {
    return { potenciometro: false, ftp: null }
  }
}

async function leerFtp(supabaseGet, host, key, athleteId) {
  return (await leerPotencia(supabaseGet, host, key, athleteId)).ftp
}

module.exports = { leerFtp, leerPotencia }
