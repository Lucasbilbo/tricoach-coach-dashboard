// descanso.js — día de descanso prescrito (disciplina 'rest'). Lógica pura.
// Es una sesión sin entreno: no va al reloj, no tiene nutrición, feedback ni
// estado Hecha/Pendiente, y no cuenta para volumen ni TSS. Solo marca el día
// (y admite notas para el atleta).

export const DISCIPLINA_DESCANSO = 'rest'

export const esDescanso = (sesion) => sesion?.disciplina === DISCIPLINA_DESCANSO

// Paso de descanso del botón «+ Descanso» de los bloques: 30 s si la
// disciplina admite segundos, si no 1 min. Se reconoce como descanso por el
// nombre (en natación se manda como descanso nativo del reloj).
export function pasoDescanso(unidadesDisponibles = []) {
  const unidad = unidadesDisponibles.includes('s') ? 's' : 'min'
  return {
    tipo: 'step',
    cantidad: unidad === 's' ? 30 : 1,
    unidad,
    objetivo_tipo: null,
    objetivo_valor: null,
    nombre: 'Descanso',
    material: [],
  }
}
