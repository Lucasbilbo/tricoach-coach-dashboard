// Constantes y helpers puros del WorkoutBuilder (C3: extraído del componente
// para bajarlo del límite de 800 líneas). Sin dependencias de UI.

export const DISCIPLINAS = [
  { value: 'swim', label: 'Natación' },
  { value: 'bike', label: 'Ciclismo' },
  { value: 'run', label: 'Carrera' },
  { value: 'strength', label: 'Fuerza' },
]

export const MATERIAL_POR_DISCIPLINA = {
  swim: ['palas', 'pull buoy', 'tubo', 'aletas', 'tabla', 'chapas', 'palas cortas'],
  bike: ['rodillo'],
  run: [],
  strength: [],
  other: [],
}

export const UNIDADES = {
  swim: ['mtr', 'km', 'min', 's'],
  bike: ['km', 'min', 'h'],
  run: ['km', 'mtr', 'min', 'h', 's'],
  strength: ['min', 's'],
  other: ['min', 's'],
}

export const OBJETIVOS = {
  swim: [
    { value: '', label: 'Sin objetivo' },
    { value: 'ritmo', label: 'Ritmo /100m' },
    { value: 'zona', label: 'Zona (ritmo)' },
    { value: 'fc', label: 'FC %' },
  ],
  // Bici solo por pulso: los atletas no tienen potenciómetro (2026-10). La
  // potencia se sigue generando para sesiones antiguas, pero no se ofrece.
  bike: [
    { value: '', label: 'Sin objetivo' },
    { value: 'zona', label: 'Zona FC' },
    { value: 'fc', label: 'FC %' },
  ],
  run: [
    { value: '', label: 'Sin objetivo' },
    { value: 'zona', label: 'Zona FC' },
    { value: 'ritmo', label: 'Ritmo /km' },
    { value: 'fc', label: 'FC %' },
  ],
  strength: [],
  other: [],
}

export const OBJETIVO_PLACEHOLDER = {
  swim: { ritmo: '1:45-1:50', fc: '70' },
  bike: { fc: '75' },
  run: { ritmo: '4:50-5:10', fc: '75' },
}

export const ZONAS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']

const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function proximosDias(n = 14) {
  const dias = []
  const hoy = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    dias.push({
      value: `${yyyy}-${mm}-${dd}`,
      label: `${DIAS_SEMANA[d.getDay()]} ${d.getDate()} ${MESES_ES[d.getMonth()]}`,
    })
  }
  return dias
}

export function defaultUnidad(disciplina) {
  return disciplina === 'bike' ? 'km' : 'mtr'
}

export function initForm(sesion) {
  if (!sesion) {
    // Sin default de disciplina: se fuerza elegirla antes de mostrar campos
    // específicos (piscina/material/objetivos/unidades).
    return { fecha: '', disciplina: null, piscina: '25', nombre: '', bloques: [], notas: '' }
  }
  const ws = sesion.workout_steps
  const bloques = Array.isArray(ws) ? ws : (ws?.bloques || [])
  const notas = ws?.notas ?? sesion.notas ?? ''
  return {
    fecha: sesion.fecha || '',
    disciplina: sesion.disciplina || null,
    piscina: ws?.piscina || '25',
    nombre: sesion.descripcion || '',
    bloques,
    notas,
  }
}

// Ritmo válido: exacto ('5:00') o rango ('4:50-5:10'). Segundos 00–59.
const RITMO = '\\d{1,2}:[0-5]\\d'
const RITMO_REGEX = new RegExp(`^${RITMO}(\\s*-\\s*${RITMO})?$`)

export function ritmoValido(valor) {
  return typeof valor === 'string' && RITMO_REGEX.test(valor.trim())
}

// Pasos con ritmo mal escrito (Intervals los ignoraría y el reloj iría sin
// objetivo). Devuelve la lista de ritmos inválidos encontrados.
export function ritmosInvalidos(bloques) {
  const pasos = (bloques || []).flatMap((b) => (b.tipo === 'repeat' ? b.pasos || [] : [b]))
  return pasos
    .filter((p) => p.objetivo_tipo === 'ritmo' && p.objetivo_valor && !ritmoValido(p.objetivo_valor))
    .map((p) => p.objetivo_valor)
}

const MIN_POR_UNIDAD = { min: 1, h: 60, s: 1 / 60 }

// Duración total en minutos si TODOS los pasos son por tiempo; null si alguno
// va por distancia (no se puede saber sin ritmo).
export function duracionTotalMin(bloques) {
  let total = 0
  for (const b of bloques || []) {
    const pasos = b.tipo === 'repeat' ? b.pasos || [] : [b]
    const veces = b.tipo === 'repeat' ? Number(b.repeticiones) || 0 : 1
    for (const p of pasos) {
      const factor = MIN_POR_UNIDAD[p.unidad]
      const cantidad = Number(p.cantidad)
      if (!factor || !Number.isFinite(cantidad)) return null
      total += cantidad * factor * veces
    }
  }
  return total > 0 ? Math.round(total) : null
}

// Zona de ritmo en natación: Intervals la resuelve con el ritmo umbral (CSS)
// de natación del atleta. Sin él no hay objetivo que medir.
export function usaZonaNatacion(bloques, disciplina) {
  if (disciplina !== 'swim') return false
  return (bloques || [])
    .flatMap((b) => (b.tipo === 'repeat' ? b.pasos || [] : [b]))
    .some((p) => p.objetivo_tipo === 'zona')
}
