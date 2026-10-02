// intervals-text.js — generador ÚNICO del texto de entrenamiento en sintaxis
// Intervals.icu (CommonJS). Fuente de verdad compartida por:
//   - el preview del builder (src/lib/intervalsText.js re-exporta esto)
//   - el envío real a Intervals/Garmin (send-to-intervals.js)
// Antes había dos copias que ya habían divergido en el manejo de notas (F3).
//
// REGLA DE NEGOCIO (no cambiar): las notas del entrenador NUNCA se envían a
// Garmin — congelan el reloj. Solo se muestran en el preview. Por eso el path
// de envío llama SIEMPRE con incluirNotas:false y el preview con true.

function unidadIntervals(unidad) {
  if (unidad === 'min') return 'm'
  return unidad || ''
}

// Objetivo por defecto de los pasos simples sin objetivo (calentamiento, vuelta
// a la calma y pasos sueltos). Bici y carrera van por PULSO: los atletas no
// tienen potenciómetro (2026-10) y una zona de potencia sin medidor deja el
// reloj con un objetivo que no puede medir. Natación SIN objetivo: un ritmo en
// piscina sin umbral configurado solo genera avisos falsos.
function defaultZona(disciplina) {
  if (disciplina === 'run' || disciplina === 'bike') return ' Z1 HR'
  return ''
}

const normalizarZona = (v) => (v && v.includes('-') ? v.split('-')[0] : v)
// Texto del paso que se ve en el reloj (el "cue"): nombre + material del paso
// (p. ej. 'Pies · aletas, tabla'). Intervals SOLO toma como cue el texto que va
// ANTES de la duración/distancia; lo que va detrás no llega al reloj (bug
// 2026-10: material y nombres se perdían). Por eso el cue va delante y se
// neutraliza lo que Intervals leería como orden: zonas (Z4), duraciones o
// distancias (10m, 400mtr, 20"), porcentajes, ritmos (1:45) y repeticiones (4x).
const PALABRA_UNIDAD = {
  km: 'kilómetros', mtr: 'metros', mts: 'metros', m: null, s: 'segundos', seg: 'segundos',
  h: 'horas', min: 'minutos', "'": 'minutos', '’': 'minutos', '"': 'segundos', '”': 'segundos',
  '%': 'por ciento', w: 'vatios', rpm: 'pedaladas', bpm: 'pulsaciones',
}

function cueSeguro(texto, disciplina) {
  return String(texto)
    .replace(/[@^]/g, ' ')
    .replace(/<!>/g, ' ')
    .replace(/\bz\s?([1-7])\b/gi, 'Zona $1')
    .replace(/(\d+(?:[.,]\d+)?)\s*(km|mtr|mts|min|seg|rpm|bpm|m|s|h|w|'|’|"|”|%)(?![a-záéíóúñ])/gi, (_, n, u) => {
      const k = u.toLowerCase()
      const palabra = k === 'm' ? (disciplina === 'swim' ? 'metros' : 'minutos') : PALABRA_UNIDAD[k]
      return `${n} ${palabra}`
    })
    .replace(/(\d{1,2}):([0-5]\d)/g, '$1.$2')
    .replace(/\b(\d+)\s*[x×](?![a-záéíóúñ])/gi, '$1 veces ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cueStr(nombre, material, disciplina) {
  const partes = []
  if (nombre && String(nombre).trim()) partes.push(String(nombre).trim())
  if (Array.isArray(material) && material.length > 0) partes.push(material.join(', '))
  if (!partes.length) return ''
  const cue = cueSeguro(partes.join(' · '), disciplina)
  return cue ? `${cue} ` : ''
}

// Técnica / pies (natación): el reloj no cuenta los largos sin brazada (tabla,
// patada, ejercicios de técnica). Garmin tiene pasos "drill" que dan la
// distancia por hecha, pero Intervals no puede mandarlos (petición abierta
// 2026-08). Así que: en el reloj el paso acaba al PULSAR VUELTA (no se queda
// esperando largos) y el panel suma esos metros a la actividad (lib/tecnica.js).
const RE_TECNICA = /(^|[^a-záéíóúñ])(pies|patada|t[eé]cnica|drills?|kick)([^a-záéíóúñ]|$)/i

function esTecnica(paso) {
  if (!paso || paso.tipo === 'pausa' || paso.tipo === 'repeat') return false
  const material = Array.isArray(paso.material) ? paso.material.map((x) => String(x).toLowerCase()) : []
  return material.includes('tabla') || RE_TECNICA.test(paso.nombre || '')
}

function metrosDistancia(paso) {
  const c = Number(paso.cantidad) || 0
  if (paso.unidad === 'mtr' || paso.unidad === 'mts') return c
  if (paso.unidad === 'km') return c * 1000
  return 0
}

// Metros de técnica/pies de una sesión de natación (con repeticiones).
function metrosTecnica(workoutSteps) {
  const bloques = (workoutSteps && workoutSteps.bloques) || []
  let total = 0
  for (const b of bloques) {
    if (b.tipo === 'repeat') {
      const veces = Number(b.repeticiones) || 0
      for (const p of b.pasos || []) if (esTecnica(p)) total += metrosDistancia(p) * veces
    } else if (esTecnica(b)) {
      total += metrosDistancia(b)
    }
  }
  return total
}

// Línea de un paso: '- <cue> <cantidad><unidad> <objetivo>'
function lineaPaso(paso, disciplina, cueNombre, objetivo) {
  if (disciplina === 'swim' && esDescanso(paso)) objetivo = ' intensity=rest'
  let cue = cueStr(cueNombre, paso.material, disciplina)
  if (disciplina === 'swim' && !esDescanso(paso) && esTecnica(paso)) {
    objetivo = `${objetivo || ''} press lap`
    cue = `${cue ? `${cue.trim()} · ` : ''}pulsa vuelta al acabar `
  }
  return '- ' + cue + paso.cantidad + unidadIntervals(paso.unidad) + objetivo
}

// 'Calentamiento' + nombre opcional del coach → 'Calentamiento · 75 crol 25 otro'
function conPrefijo(prefijo, nombre) {
  const n = nombre && String(nombre).trim()
  return n ? `${prefijo} · ${n}` : prefijo
}

function objetivoStr(step, disciplina) {
  const tipo = step.objetivo_tipo
  const valor = step.objetivo_valor
  if (!tipo || !valor) return ''
  if (tipo === 'zona') {
    const zona = normalizarZona(valor)
    if (disciplina === 'swim') return ` ${zona} Pace`
    // Bici también por pulso (sin potenciómetro). Sesiones antiguas con zona en
    // bici se reinterpretan como zona de FC al reenviarse.
    return ` ${zona} HR`
  }
  if (tipo === 'fc') return ` ${valor}% HR`
  if (tipo === 'potencia') return ` ${valor}%`
  if (tipo === 'ritmo') {
    // Admite ritmo exacto ('5:00') o rango ('4:50-5:10'); Intervals entiende ambos.
    const ritmo = String(valor).replace(/\s+/g, '')
    if (disciplina === 'swim') return ` ${ritmo}/100m Pace`
    if (disciplina === 'run') return ` ${ritmo}/km Pace`
  }
  return ''
}

// Natación: entre cada bloque y el siguiente se intercala una PAUSA que termina
// al pulsar vuelta ("press lap"): el nadador para en la pared, se pone o quita
// material y arranca cuando quiere. Se omite si ahí ya hay un descanso (serie
// que acaba en descanso, o bloque que es un descanso), SALVO que cambie el
// material: un 20" de serie no da para ponerse aletas. Dentro de una serie solo
// se añade si cambia el material entre pasos sin descanso de por medio.
// Se calcula al generar el texto; no se guarda.
const SEG_PAUSA = 15

function claveMaterial(paso) {
  const m = Array.isArray(paso && paso.material) ? paso.material : []
  return m.map((x) => String(x).toLowerCase()).sort().join('|')
}

function esDescanso(paso) {
  if (!paso) return false
  if (/^\s*(descanso|desc\b|rec\b|recup|pausa)/i.test(paso.nombre || '')) return true
  // En natación un paso por segundos sin nombre ni objetivo es un descanso.
  return paso.unidad === 's' && !paso.objetivo_tipo && !(paso.nombre && String(paso.nombre).trim())
}

const UNIDAD_CORTA = { mtr: 'm', km: 'km', min: "'", s: '"', h: 'h' }

function describirPaso(p) {
  const partes = [`${p.cantidad}${UNIDAD_CORTA[p.unidad] || p.unidad || ''}`]
  if (p.objetivo_valor && (p.objetivo_tipo === 'zona' || p.objetivo_tipo === 'ritmo')) partes.push(p.objetivo_valor)
  if (p.objetivo_valor && p.objetivo_tipo === 'fc') partes.push(`${p.objetivo_valor}%`)
  if (p.nombre && String(p.nombre).trim() && !esDescanso(p)) partes.push(String(p.nombre).trim())
  let txt = partes.join(' ')
  if (Array.isArray(p.material) && p.material.length) txt += ` · ${p.material.join(', ')}`
  return txt
}

// Lo que viene después de la pausa, en corto: "300m Progresivo · palas, aletas",
// "4x 100m Z3". Garmin corta las notas largas: máximo ~60 caracteres.
function describirBloque(b) {
  if (!b) return ''
  let txt
  if (b.tipo === 'repeat') {
    const activos = (b.pasos || []).filter((p) => p.tipo !== 'pausa' && !esDescanso(p))
    txt = `${b.repeticiones}x ${activos.map(describirPaso).join(' / ')}`
  } else {
    txt = describirPaso(b)
  }
  return txt.length > 60 ? `${txt.slice(0, 59).trim()}…` : txt
}

function pausa(siguiente, cambiaMaterial, bloqueSiguiente) {
  return {
    tipo: 'pausa',
    cambiaMaterial,
    material: Array.isArray(siguiente.material) ? [...siguiente.material] : [],
    siguiente: describirBloque(bloqueSiguiente || siguiente),
  }
}

const primeroDe = (b) => (b.tipo === 'repeat' ? b.pasos[0] : b)
const ultimoDe = (b) => (b.tipo === 'repeat' ? b.pasos[b.pasos.length - 1] : b)

function pasosConPausas(pasos) {
  const out = []
  pasos.forEach((p, i) => {
    const prev = pasos[i - 1]
    if (prev && claveMaterial(p) !== claveMaterial(prev) && !esDescanso(p) && !esDescanso(prev)) {
      out.push(pausa(p, true))
    }
    out.push(p)
  })
  // Vuelta de la serie: del último paso al primero de la siguiente repetición.
  const primero = pasos[0]
  const ultimo = pasos[pasos.length - 1]
  const vueltaCambia = pasos.length > 1 && claveMaterial(primero) !== claveMaterial(ultimo)
  return { pasos: out, vueltaCambia, primero, ultimo }
}

function conPausas(bloques, disciplina) {
  if (disciplina !== 'swim' || !Array.isArray(bloques)) return bloques || []
  const validos = bloques.filter((b) => b.tipo !== 'pausa' && (b.tipo !== 'repeat' || (Array.isArray(b.pasos) && b.pasos.length > 0)))
  const out = []
  validos.forEach((b, i) => {
    let bloque = b
    let pausaDentro = false
    if (b.tipo === 'repeat') {
      const r = pasosConPausas(b.pasos)
      // Si la serie cambia de material al dar la vuelta, la pausa va al inicio
      // de cada repetición (cubre también la entrada a la serie).
      if (r.vueltaCambia && !esDescanso(r.primero) && !esDescanso(r.ultimo)) {
        r.pasos.unshift(pausa(r.primero, true))
        pausaDentro = true
      }
      bloque = { ...b, pasos: r.pasos }
    }
    const prev = validos[i - 1]
    if (prev && !pausaDentro) {
      const entrada = primeroDe(b)
      const cambia = claveMaterial(ultimoDe(prev)) !== claveMaterial(entrada)
      const hayDescanso = esDescanso(ultimoDe(prev)) || esDescanso(entrada)
      if (cambia || !hayDescanso) out.push(pausa(entrada, cambia, b))
    }
    out.push(bloque)
  })
  return out
}

// Compatibilidad con el nombre anterior.
const conPausasMaterial = conPausas

// Texto de la pausa: qué hacer y qué viene. Lo usan el reloj (vía cueSeguro) y
// el panel. "Quita el material · Siguiente: 200m Soltar" / "Siguiente: 300m
// Progresivo · palas, aletas" (el material del siguiente ya dice qué ponerse).
function textoPausa(p) {
  const partes = []
  if (p.cambiaMaterial && !(p.material && p.material.length)) partes.push('Quita el material')
  if (p.siguiente) partes.push(`Siguiente: ${p.siguiente}`)
  return partes.join(' · ') || 'Siguiente'
}

// Descanso NATIVO de Garmin (intensity=rest): en piscina es la cuenta atrás de
// descanso, no tiempo nadando. La pausa además acaba al pulsar vuelta.
function lineaPausa(p, disciplina) {
  return `- ${cueSeguro(textoPausa(p), disciplina)} ${SEG_PAUSA}s press lap intensity=rest`
}

// Construye el texto de un entrenamiento. Los bloques se separan con \n\n para
// que Intervals los parsee como pasos independientes; los pasos internos de un
// repeat van con \n simple.
//
// options.incluirNotas: true SOLO para el preview. En el envío real debe ser
// false (las notas no llegan al reloj).
function buildIntervalsText(session, options = {}) {
  const incluirNotas = options.incluirNotas === true
  const ws = session.workout_steps || {}
  const disciplinaWs = session.disciplina
  const bloques = conPausas(ws.bloques || [], disciplinaWs)
  const material = ws.material || session.material || []
  const notas = ws.notas ?? session.notas ?? ''
  const disciplina = session.disciplina

  const partes = []

  if (Array.isArray(material) && material.length > 0) {
    partes.push('Material: ' + material.join(', '))
  }

  for (const bloque of bloques) {
    if (bloque.tipo === 'pausa') {
      partes.push(lineaPausa(bloque, disciplina))
    } else if (bloque.tipo === 'warmup') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push(lineaPaso(bloque, disciplina, conPrefijo('Calentamiento', bloque.nombre), obj))
    } else if (bloque.tipo === 'cooldown') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push(lineaPaso(bloque, disciplina, conPrefijo('Vuelta a la calma', bloque.nombre), obj))
    } else if (bloque.tipo === 'step') {
      const obj = objetivoStr(bloque, disciplina) || defaultZona(disciplina)
      partes.push(lineaPaso(bloque, disciplina, bloque.nombre, obj))
    } else if (bloque.tipo === 'repeat') {
      const lines = [(bloque.nombre || 'Serie') + ' ' + bloque.repeticiones + 'x']
      for (const paso of (bloque.pasos || [])) {
        if (paso.tipo === 'pausa') {
          lines.push(lineaPausa(paso, disciplina))
          continue
        }
        lines.push(lineaPaso(paso, disciplina, paso.nombre, objetivoStr(paso, disciplina)))
      }
      partes.push(lines.join('\n'))
    }
  }

  const sintaxis = partes.join('\n\n')
  if (incluirNotas && notas) {
    return sintaxis + '\n\n---\n' + notas
  }
  return sintaxis
}

module.exports = { buildIntervalsText, cueSeguro, conPausas, conPausasMaterial, textoPausa, esTecnica, metrosTecnica }
