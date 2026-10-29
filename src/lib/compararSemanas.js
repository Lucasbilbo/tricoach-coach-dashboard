// Comparar semanas: qué dos semanas salen elegidas al abrir.
// Antes, A = la semana en curso y B = la anterior: con la semana a medias todo
// salía "▼" (menos km, menos horas…) aunque el atleta fuera bien. Si la última
// es la semana en curso, se comparan las dos últimas COMPLETAS.
import { lunesDeSemana } from './chartUtils'

export function indicesPorDefecto(semanas, hoy) {
  const n = semanas?.length || 0
  if (n === 0) return { a: 0, b: 0 }
  const enCurso = semanas[n - 1].semana === lunesDeSemana(hoy)
  const a = enCurso && n >= 3 ? n - 2 : n - 1
  return { a, b: Math.max(a - 1, 0) }
}
