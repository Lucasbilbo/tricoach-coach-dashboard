// Constantes y helpers puros del WorkoutBuilder (C3: extraído del componente
// para bajarlo del límite de 800 líneas). Sin dependencias de UI.

export const DISCIPLINAS = [
  { value: 'swim', label: 'Natación' },
  { value: 'bike', label: 'Ciclismo' },
  { value: 'run', label: 'Running' },
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
    { value: 'fc', label: 'FC %' },
  ],
  bike: [
    { value: '', label: 'Sin objetivo' },
    { value: 'potencia', label: 'Potencia %' },
    { value: 'fc', label: 'FC %' },
    { value: 'zona', label: 'Zona' },
  ],
  run: [
    { value: '', label: 'Sin objetivo' },
    { value: 'ritmo', label: 'Ritmo /km' },
    { value: 'fc', label: 'FC %' },
    { value: 'zona', label: 'Zona' },
  ],
  strength: [],
  other: [],
}

export const OBJETIVO_PLACEHOLDER = {
  swim: { ritmo: '1:30', fc: '70' },
  bike: { potencia: '80', fc: '75' },
  run: { ritmo: '5:30', fc: '75' },
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
    return { fecha: '', disciplina: 'swim', piscina: '25', nombre: '', bloques: [], notas: '' }
  }
  const ws = sesion.workout_steps
  const bloques = Array.isArray(ws) ? ws : (ws?.bloques || [])
  const notas = ws?.notas ?? sesion.notas ?? ''
  return {
    fecha: sesion.fecha || '',
    disciplina: sesion.disciplina || 'swim',
    piscina: ws?.piscina || '25',
    nombre: sesion.descripcion || '',
    bloques,
    notas,
  }
}
