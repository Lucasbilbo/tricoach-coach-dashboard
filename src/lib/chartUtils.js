// Utilidades compartidas por los gráficos de AthleteView
import { COLORS } from './theme'

export const MESES_CORTOS = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

// 'YYYY-MM-DD' → 'Jun 2'
export function formatFechaCorta(fecha) {
  if (!fecha || typeof fecha !== 'string') return ''
  const [, m, d] = fecha.split('-').map(Number)
  if (!m || !d || !MESES_CORTOS[m - 1]) return fecha
  return `${MESES_CORTOS[m - 1]} ${d}`
}

// 'YYYY-MM-DD' → '10 Jun' (orden día-mes, para tablas; los ejes usan formatFechaCorta)
export function formatDiaMes(fecha) {
  if (!fecha || typeof fecha !== 'string') return ''
  const [, m, d] = fecha.split('-').map(Number)
  if (!m || !d || !MESES_CORTOS[m - 1]) return fecha
  return `${d} ${MESES_CORTOS[m - 1]}`
}

// Hoy en Europe/Madrid como 'YYYY-MM-DD'
export function hoyMadrid() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

// 'YYYY-MM-DD' + n días → 'YYYY-MM-DD' (aritmética en UTC, sin DST)
export function sumarDias(fecha, dias) {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + dias * 86400000).toISOString().slice(0, 10)
}

// Lunes (YYYY-MM-DD) de la semana de una fecha local YYYY-MM-DD
export function lunesDeSemana(fechaLocal) {
  const [y, m, d] = fechaLocal.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const dow = date.getUTCDay() // 0=domingo
  const offset = dow === 0 ? 6 : dow - 1
  const monday = new Date(date.getTime() - offset * 86400000)
  return monday.toISOString().slice(0, 10)
}

// Acepta número decimal (5.23) o string "5:14" → decimal en min/km
export function ritmoToDecimal(ritmo) {
  if (ritmo == null) return null
  if (typeof ritmo === 'number') return Number.isNaN(ritmo) ? null : ritmo
  const partes = String(ritmo).split(':')
  if (partes.length === 2) {
    const min = parseInt(partes[0], 10)
    const seg = parseInt(partes[1], 10)
    if (Number.isNaN(min) || Number.isNaN(seg)) return null
    return min + seg / 60
  }
  const num = parseFloat(ritmo)
  return Number.isNaN(num) ? null : num
}

// 5.233 → "5:14"
export function decimalToRitmo(decimal) {
  if (decimal == null || Number.isNaN(decimal)) return '—'
  let min = Math.floor(decimal)
  let seg = Math.round((decimal - min) * 60)
  if (seg === 60) {
    min += 1
    seg = 0
  }
  return `${min}:${String(seg).padStart(2, '0')}`
}

// 2.25 horas → "2h 15m"
export function formatHorasMin(horas) {
  if (horas == null || Number.isNaN(horas)) return '—'
  const totalMin = Math.round(horas * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Media móvil simple: null hasta tener `ventana` valores
export function mediaMovil(valores, ventana) {
  return valores.map((_, i) => {
    if (i < ventana - 1) return null
    const tramo = valores.slice(i - ventana + 1, i + 1)
    return tramo.reduce((acc, v) => acc + v, 0) / ventana
  })
}

// Estilos comunes de ejes y tooltip para Recharts
export const tickStyle = { fill: COLORS.textSecondary, fontSize: 11 }

export const gridStroke = 'rgba(255,255,255,0.04)'

export const tooltipBoxStyle = {
  background: COLORS.card,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 12,
  color: COLORS.textPrimary,
}
