// Recálculo independiente para la auditoría funcional. Importa el HELPER REAL
// que usan las Netlify Functions (netlify/functions/lib/metrics.js) para que el
// recálculo refleje el código desplegado, y una referencia donde procede.
//
// Ejecutar: node audit/recompute.mjs
import { activities, sessions, FC_MAX, HOY } from './real-data.mjs'
import metrics from '../netlify/functions/lib/metrics.js' // CJS → default import

const { mapDisciplina, round, zonaFc, intensidadPct, cargaActividad, fechaMadrid } = metrics

const line = (s = '') => console.log(s)
const h = (s) => { line(); line('══ ' + s + ' ' + '═'.repeat(Math.max(0, 66 - s.length))) }

// lunesDeSemana (idéntico en las functions y en chartUtils; no está en el helper)
function lunesDeSemana(fechaLocal) {
  const [y, m, d] = fechaLocal.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay()
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(date.getTime() - offset * 86400000)
  return monday.toISOString().slice(0, 10)
}
function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + dias * 86400000).toISOString().slice(0, 10)
}
// El feed del conector solo trae start_local (no UTC). En España start_local == Madrid,
// así que para el volumen real se usa su fecha directamente (equivalente al fix A3).
const fechaActividad = (a) => a.start.slice(0, 10)

// ── 1 y 5. Volumen por semana (algoritmo de coach-athlete-data) ────────────────
function volumenPorSemana() {
  const porLunes = {}
  for (const a of activities) {
    const disc = mapDisciplina(a.sport)
    if (disc === 'other') continue // B1: excluir no-tri del volumen
    const km = a.dist ? round(a.dist / 1000, 2) : null
    const lunes = lunesDeSemana(fechaActividad(a))
    if (!porLunes[lunes]) porLunes[lunes] = { semana: lunes, km_run: 0, km_bike: 0, km_swim: 0, horas: 0, n: 0 }
    const s = porLunes[lunes]
    if (disc === 'run') s.km_run += km || 0
    if (disc === 'bike') s.km_bike += km || 0
    if (disc === 'swim') s.km_swim += km || 0
    s.horas += (a.mov || 0) / 3600
    s.n += 1
  }
  return Object.values(porLunes).sort((a, b) => (a.semana < b.semana ? -1 : 1)).map((s) => ({
    semana: s.semana, km_run: round(s.km_run, 1), km_bike: round(s.km_bike, 1),
    km_swim: round(s.km_swim, 2), horas: round(s.horas, 1), n: s.n,
  }))
}

// ── 2 / A3. Semana según función ANTES (start_local) vs DESPUÉS (Madrid) vs Madrid ─
function pruebaTZ() {
  const casos = [
    ['España, domingo 23:30 (UTC+2)', '2026-06-28T21:30:00Z', 2],
    ['España, lunes 00:15 (UTC+2)',   '2026-06-28T22:15:00Z', 2],
    ['Viaje São Paulo: domingo 23:30 local (UTC-3)', '2026-06-29T02:30:00Z', -3],
    ['Viaje Tokio: lunes 07:00 local (UTC+9)',        '2026-06-28T22:00:00Z', 9],
  ]
  return casos.map(([desc, utc, offsetH]) => {
    const local = new Date(new Date(utc).getTime() + offsetH * 3600000).toISOString().slice(0, 19)
    const antesLunes = lunesDeSemana(local.slice(0, 10))          // agrupaba por start_local
    const despuesLunes = lunesDeSemana(fechaMadrid(new Date(utc))) // fix A3: por Madrid
    const madLunes = lunesDeSemana(fechaMadrid(new Date(utc)))
    return { desc, local, antesLunes, despuesLunes, madLunes, ok: despuesLunes === madLunes }
  })
}

// ── 3. Estado de sesión prescrita (SessionsList estadoSesion) ──────────────────
function estadoSesiones() {
  const acts = activities.map((a) => ({ fecha: fechaActividad(a), disc: mapDisciplina(a.sport), sport: a.sport, id: a.id }))
  return sessions.map((ses) => {
    const match = acts.find((a) => a.fecha === ses.fecha && a.disc === ses.disciplina)
    const estado = match ? 'Completada' : (ses.fecha > HOY ? 'Programada' : 'Pendiente')
    return { ...ses, estado, matchId: match?.id || null }
  })
}

// ── A2/B2. Carga con el helper único: hrTSS con FC, estimado por disciplina sin FC ─
function tssSamples() {
  return activities.filter((a) => a.hr !== undefined).map((a) => {
    const disc = mapDisciplina(a.sport)
    const hr = a.hr ?? null
    const carga = cargaActividad(a.mov, hr, FC_MAX, disc)
    const intensidad = hr != null ? intensidadPct(hr, FC_MAX) : null
    return {
      id: a.id, sport: a.sport, hr,
      zona: zonaFc(intensidad), tss: round(carga.tss, 0), estimado: carga.estimado,
    }
  })
}

// ══════════════════ EJECUCIÓN ══════════════════
line(`Actividades: ${activities.length} · FC_max=${FC_MAX} · hoy(Madrid)=${HOY}`)

h('1+5. VOLUMEN POR SEMANA')
line('semana(lunes) | km_run | km_bike | km_swim | horas | nº')
for (const s of volumenPorSemana()) line(`${s.semana} | ${s.km_run.toFixed(1).padStart(6)} | ${s.km_bike.toFixed(1).padStart(7)} | ${s.km_swim.toFixed(2).padStart(7)} | ${s.horas.toFixed(1).padStart(5)} | ${String(s.n).padStart(2)}`)

h('2 / A3. ZONA HORARIA — semana ANTES (start_local) vs DESPUÉS (Madrid)')
line('caso | localStrava | antes(func) | después(fix) | Madrid | ¿fix==Madrid?')
for (const t of pruebaTZ()) line(`- ${t.desc}\n    local=${t.local} → antes ${t.antesLunes} | después ${t.despuesLunes} | Madrid ${t.madLunes} | ${t.ok ? 'OK' : '✗'}`)
const tzMal = pruebaTZ().filter((t) => !t.ok)
const tzCambia = pruebaTZ().filter((t) => t.antesLunes !== t.despuesLunes)
line()
line(`A3: casos donde el fix corrige la semana respecto al comportamiento antiguo: ${tzCambia.length} (${tzCambia.map((t) => t.desc.split(':')[0]).join(', ') || 'ninguno'})`)
line(`A3: casos donde el fix NO coincide con Madrid: ${tzMal.length} → ${tzMal.length === 0 ? 'discrepancia A3 RESUELTA' : 'PENDIENTE'}`)

h('3. SESIONES PRESCRITAS — Completada / Pendiente (con TODAS las actividades)')
const est = estadoSesiones()
const nComp = est.filter((e) => e.estado === 'Completada').length
const nPend = est.filter((e) => e.estado === 'Pendiente').length
line(`${nComp} Completadas · ${nPend} Pendientes · de ${est.length} sesiones pasadas`)
line('Pendientes reales (sin actividad de esa disciplina ese día en Madrid):')
for (const e of est.filter((e) => e.estado === 'Pendiente')) line(`  - ${e.fecha} ${e.disciplina}`)

h('A2/B2. Carga: hrTSS con FC · estimado por disciplina sin FC')
line('id | sport | FCmed | zona | TSS | ¿estimado (sin FC)?')
for (const s of tssSamples()) {
  line(`${s.id} | ${s.sport.padEnd(4)} | ${s.hr != null ? s.hr.toFixed(1) : 'sin FC'} | ${s.zona || '—'} | ${s.tss ?? '—'} | ${s.estimado ? 'SÍ (~)' : 'no'}`)
}
const swim = tssSamples().find((s) => s.id === '20229230755')
const bici = tssSamples().find((s) => s.id === '20243272004')
line()
line(`A2: zona bici 19-sep (79.96%): ${bici?.zona} → ${bici?.zona === 'Z3' ? 'OK (sin redondear)' : 'PENDIENTE'}`)
line(`B2: nado 18-sep sin FC → TSS ${swim?.tss} estimado=${swim?.estimado} → ${swim?.estimado && swim?.tss > 0 ? 'OK (ya aporta carga)' : 'PENDIENTE'}`)

// ── B3. ATL/CTL/TSB: modelo ANTIGUO (SMA 7/28 anclado a la última actividad) vs
//    DESPUÉS (EWMA 7/42 anclado a hoy), sobre la MISMA serie de TSS diario. ─────
function dateUTC(f) { const [y, m, d] = f.split('-').map(Number); return Date.UTC(y, m - 1, d) }

function tssPorDiaReal() {
  const m = {}
  for (const a of activities) {
    const t = cargaActividad(a.mov, a.hr ?? null, FC_MAX, mapDisciplina(a.sport)).tss
    if (t == null) continue
    const f = fechaActividad(a)
    m[f] = (m[f] || 0) + t
  }
  return m
}
const kA = 1 - Math.exp(-1 / 7)
const kC = 1 - Math.exp(-1 / 42)
function ewmaAsOf(porDia, hasta) {
  const fechas = Object.keys(porDia).sort()
  if (!fechas.length || hasta < fechas[0]) return null
  let atl = 0
  let ctl = 0
  for (let f = fechas[0]; f <= hasta; f = sumarDias(f, 1)) { const t = porDia[f] || 0; atl += kA * (t - atl); ctl += kC * (t - ctl) }
  return { atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(ctl - atl) }
}
function smaAsOf(porDia, hasta) {
  const fechas = Object.keys(porDia).sort().filter((f) => f <= hasta)
  if (!fechas.length) return null
  const anchor = fechas[fechas.length - 1] // modelo antiguo: anclado a la última actividad
  const suma = (n) => fechas.reduce((s, f) => { const diff = (dateUTC(anchor) - dateUTC(f)) / 86400000; return diff >= 0 && diff < n ? s + porDia[f] : s }, 0)
  const atl = Math.round(suma(7) / 7)
  const ctl = Math.round(suma(28) / 28)
  return { atl, ctl, tsb: ctl - atl, anchor }
}

const porDia = tssPorDiaReal()
const tssSemana = {}
for (const [f, t] of Object.entries(porDia)) { const l = lunesDeSemana(f); tssSemana[l] = (tssSemana[l] || 0) + t }
const semOrden = Object.keys(tssSemana).sort()
const fuerte = semOrden.reduce((a, b) => (tssSemana[b] > tssSemana[a] ? b : a), semOrden[0])
const porCarga = [...semOrden].sort((a, b) => tssSemana[a] - tssSemana[b])
const normal = porCarga[Math.floor(porCarga.length / 2)]

// ── 1.1 Calentamiento: CTL/TSB de hoy según el selector, ANTES (EWMA calentada
//    solo con lo que trae el selector) vs DESPUÉS (calentada con 26 semanas). ──
function ewmaFiltrado(porDia, desdeFecha, hasta) {
  const filt = Object.fromEntries(Object.entries(porDia).filter(([f]) => f >= desdeFecha))
  return ewmaAsOf(filt, hasta)
}
h('1.1 CALENTAMIENTO — CTL/TSB de hoy por selector (misma serie de 83 act.)')
{
  const porDia11 = tssPorDiaReal()
  const cutoff = (w) => sumarDias(HOY, -w * 7)
  const despues = ewmaFiltrado(porDia11, cutoff(26), HOY) // tope 26 semanas
  line('selector | ANTES (calienta solo el rango) | DESPUÉS (calienta 26 sem)')
  for (const w of [4, 8, 12, 24]) {
    const antes = ewmaFiltrado(porDia11, cutoff(w), HOY)
    line(`${String(w).padStart(2)} sem   | CTL ${String(antes.ctl).padStart(3)}  TSB ${antes.tsb > 0 ? '+' : ''}${antes.tsb}`.padEnd(42) + ` | CTL ${despues.ctl}  TSB ${despues.tsb > 0 ? '+' : ''}${despues.tsb}`)
  }
  line('(DESPUÉS es idéntico para todos los selectores → hoy ya no depende del rango)')
}

h('B3. ATL/CTL/TSB — ANTES (SMA7/28@últ.act) vs DESPUÉS (EWMA7/42@hoy)')
line('OJO: el conector no expone FC en bloque → TSS estimado (B2) en la mayoría de las 83')
line('actividades. Magnitudes APROXIMADAS; lo comparable es la forma de cada modelo.')
line(`Semana más fuerte: ${fuerte} (TSS ${Math.round(tssSemana[fuerte])}) · normal: ${normal} (TSS ${Math.round(tssSemana[normal])})`)
line('')
line('fecha (as-of) | escenario                  | ANTES (SMA)            | DESPUÉS (EWMA)')
for (const [f, label] of [[sumarDias(normal, 3), 'semana de carga normal'], [sumarDias(fuerte, 7), 'día tras la semana más fuerte'], [HOY, 'hoy']]) {
  const o = smaAsOf(porDia, f)
  const n = ewmaAsOf(porDia, f)
  const fmt = (x) => (x ? `ATL ${String(x.atl).padStart(3)} CTL ${String(x.ctl).padStart(3)} TSB ${x.tsb > 0 ? '+' : ''}${x.tsb}` : '—')
  line(`${f} | ${label.padEnd(27)} | ${fmt(o).padEnd(22)} | ${fmt(n)}${o && o.anchor !== f ? `   (SMA ancla ${o.anchor})` : ''}`)
}
