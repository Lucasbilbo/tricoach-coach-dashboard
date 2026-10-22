// adjuntos.js — el entreno "tal cual" que adjunta el coach (Hyrox / fuerza):
// texto pegado y/o capturas. Vive en workout_steps.adjunto = { texto, imagenes }
// (imagenes = rutas en el bucket privado `entrenos-adjuntos`, migración 014).
// Al reloj solo llegan nombre y duración; el detalle se mira en la app.

export const BUCKET_ADJUNTOS = 'entrenos-adjuntos'
export const MAX_IMAGENES = 6
export const MAX_TEXTO = 8000

// Normaliza: { texto: string, imagenes: string[] } o null si no hay nada.
export function adjuntoDe(ws) {
  const a = ws?.adjunto
  if (!a || typeof a !== 'object') return null
  const texto = typeof a.texto === 'string' ? a.texto.trim() : ''
  const imagenes = Array.isArray(a.imagenes) ? a.imagenes.filter((r) => typeof r === 'string' && r) : []
  return texto || imagenes.length ? { texto, imagenes } : null
}

// ¿La sesión tiene algo que ver/enviar? (bloques o adjunto)
export const tieneEntreno = (ws) => (ws?.bloques?.length || 0) > 0 || !!adjuntoDe(ws)

// Ruta de una captura nueva: primera carpeta = atleta (la usan las políticas).
export function rutaAdjunto(athleteId, uuid) {
  return `${athleteId}/${uuid}.jpg`
}
