// potencia.js — validación pura de los ajustes de carga (sin imports, para
// node --test). Datos en potenciaApi.js.

// FTP: entero 50–700 o null (vacío) · undefined = inválido
export function ftpValido(v) {
  if (v === '' || v == null) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 50 && n <= 700 ? n : undefined
}

// FC de umbral: entero 100–220 lpm o null (vacío = 90 % de la FC máx) · undefined = inválida
export function fcUmbralValida(v) {
  if (v === '' || v == null) return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 100 && n <= 220 ? n : undefined
}

// FC de umbral por defecto (90 % de la FC máx, igual que el backend)
export const fcUmbralPorDefecto = (fcMax) => (fcMax > 0 ? Math.round(fcMax * 0.9) : null)

// Fecha del FTP al guardar: solo cambia si cambia el FTP (antes se ponía a hoy
// en cada guardado, también al tocar solo el interruptor).
export function fechaFtpNueva(previo, ftp, hoy = new Date().toISOString().slice(0, 10)) {
  if (!ftp) return null
  if (previo && previo.ftp_w === ftp && previo.ftp_fecha) return previo.ftp_fecha
  return hoy
}

// ¿FTP viejo? Más de 8 semanas desde el test → conviene repetirlo.
export function ftpAntiguo(ftpFecha, hoy = new Date().toISOString().slice(0, 10)) {
  if (!ftpFecha) return false
  const dias = (Date.parse(hoy) - Date.parse(ftpFecha)) / 86400000
  return dias > 56
}
