// tecnica.js — suma a las natación de Strava los metros de técnica/pies que el
// reloj no registra (tabla, patada, drills: sin brazada no detecta largos).
// Los metros salen de la sesión prescrita del mismo día (Europe/Madrid); cada
// sesión se suma como mucho a UNA actividad. Ver esTecnica en intervals-text.
const { metrosTecnica } = require('./intervals-text.cjs')

// actividades: [{ disciplina, fecha 'YYYY-MM-DD', distancia_km }] (se mutan:
// distancia_km += metros/1000 y metros_tecnica = metros).
// sesiones: [{ disciplina, fecha, workout_steps }] de coach_sessions.
function sumarTecnica(actividades, sesiones) {
  const porFecha = new Map()
  for (const s of sesiones || []) {
    if (!s || s.disciplina !== 'swim' || !s.fecha) continue
    const m = metrosTecnica(s.workout_steps)
    if (!m) continue
    if (!porFecha.has(s.fecha)) porFecha.set(s.fecha, [])
    porFecha.get(s.fecha).push(m)
  }
  if (porFecha.size === 0) return actividades
  for (const a of actividades || []) {
    if (!a || a.disciplina !== 'swim' || !a.fecha) continue
    const lista = porFecha.get(a.fecha)
    if (!lista || lista.length === 0) continue
    const m = lista.shift()
    a.metros_tecnica = m
    a.distancia_km = Math.round(((a.distancia_km || 0) + m / 1000) * 100) / 100
  }
  return actividades
}

// Sesiones de natación de un atleta desde `desde` (YYYY-MM-DD), solo lo
// necesario. Best-effort: si falla, [] (el panel sigue con lo del reloj).
async function sesionesNatacion(supabaseGet, host, key, athleteId, desde) {
  try {
    const res = await supabaseGet(
      host,
      `/rest/v1/coach_sessions?athlete_id=eq.${athleteId}&disciplina=eq.swim&fecha=gte.${desde}&select=fecha,disciplina,workout_steps`,
      key,
    )
    return res && res.status === 200 && Array.isArray(res.json) ? res.json : []
  } catch {
    return []
  }
}

module.exports = { sumarTecnica, sesionesNatacion }
