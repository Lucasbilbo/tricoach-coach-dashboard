// activityFormat.js — formatters, estilos y constantes compartidos por las dos
// vistas de análisis Strava (AthleteView del coach y AthleteHome del atleta).
// Antes estaban duplicados en ambos archivos (C3).
import { decimalToRitmo } from './chartUtils'
import { COLORS } from './theme'

export const FILTROS_DISCIPLINA = [
  { clave: 'todos', etiqueta: 'Todos' },
  { clave: 'run', etiqueta: 'Carrera' },
  { clave: 'bike', etiqueta: 'Ciclismo' },
  { clave: 'swim', etiqueta: 'Natación' },
  { clave: 'strength', etiqueta: 'Fuerza' },
  { clave: 'other', etiqueta: 'Otro' },
]

export const CSV_CABECERAS = [
  'Fecha', 'Disciplina', 'Nombre', 'Distancia (km)', 'Duración (min)',
  'Ritmo', 'FC media', 'FC máx', 'Zona', 'Potencia (W)', 'Cadencia', 'Desnivel (m)', 'TSS',
]

// Escapa un valor para CSV: comillas si contiene separadores, null → vacío
export function campoCsv(valor) {
  if (valor == null) return ''
  const s = String(valor)
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Ritmo/velocidad según disciplina: run en min/km, bike en km/h, swim en min/100m
export function formatRitmoActividad(act) {
  if (act.disciplina === 'run') {
    return act.ritmo_min_km != null ? `${decimalToRitmo(act.ritmo_min_km)} /km` : '—'
  }
  if (act.disciplina === 'bike') {
    if (!act.distancia_km || !act.duracion_min) return '—'
    return `${(act.distancia_km / (act.duracion_min / 60)).toFixed(1)} km/h`
  }
  if (act.disciplina === 'swim') {
    if (!act.distancia_km || !act.duracion_min) return '—'
    return `${decimalToRitmo(act.duracion_min / act.distancia_km / 10)} /100m`
  }
  return '—'
}

export function formatDuracion(duracionMin) {
  if (duracionMin == null) return '—'
  const h = Math.floor(duracionMin / 60)
  const m = Math.round(duracionMin % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

export const tdStyle = {
  padding: '10px 12px',
  fontSize: 13,
  color: COLORS.textPrimary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  whiteSpace: 'nowrap',
}

// Genera y descarga el CSV de las actividades. nombreArchivo lo decide cada vista.
export function descargarCsv(actividades, nombreArchivo, decimalToRitmoFn, discLabels) {
  const filas = actividades.map((act) =>
    [
      act.fecha,
      discLabels[act.disciplina] || act.disciplina,
      act.nombre_actividad,
      act.distancia_km,
      act.duracion_min,
      act.ritmo_min_km != null ? decimalToRitmoFn(act.ritmo_min_km) : null,
      act.fc_media,
      act.fc_maxima_actividad,
      act.zona_fc,
      act.potencia_media,
      act.cadencia_media,
      act.desnivel_m,
      act.tss_estimado,
    ]
      .map(campoCsv)
      .join(',')
  )
  const csv = [CSV_CABECERAS.map(campoCsv).join(','), ...filas].join('\n')
  // BOM para que Excel interprete UTF-8 (acentos en nombres de actividades)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  document.body.removeChild(enlace)
  URL.revokeObjectURL(url)
}
