// parser.js — "escritura rápida" del WorkoutBuilder: una línea de texto →
// bloques. Puro (sin imports) para probarlo con node --test.
//
// Ejemplos que entiende:
//   15' Z1 + 8x(1' Z5 / 1' Z1) + 10' Z1
//   20' + 5x(400m Z4 / 2' rec) + 10'
//   50' Z2 4:50-5:10
//   cal 500m palas + 4x(100m 1:45 / 20" descanso) + vc 200m
//   400 cal + 8x100 1:45 rec 20" + 200 vc          (natación: sin unidad = metros)
//   15' Z1 + 6x3' Z4 r2' + 10' Z1                   (serie sin paréntesis + descanso)
//
// Reglas:
//  - Bloques separados por "+" (también ";" o ", "). Serie: "Nx(paso / paso)"
//    o sin paréntesis "Nx paso rec 20"" / "paso x N" (el descanso es el 2º paso).
//  - Cantidad: 15' o 15min = minutos · 20" o 20s = segundos · 1h · 5km · 400m = metros.
//  - Objetivo: Z1..Z5 (zona FC) o ritmo 5:00 / 4:50-5:10. "%"→ FC % (p. ej. 75%).
//  - Material (natación): palas, aletas, pull buoy/pull, tubo, tabla, chapas.
//  - "cal"/"calentamiento" fuerza calentamiento; "vc"/"vuelta"/"enfriar" fuerza
//    vuelta a la calma. Si hay 3+ bloques, el primero y el último sueltos se
//    toman como calentamiento y vuelta a la calma.
//  - El resto del texto queda como nombre del paso ("rec", "suave", "a tope").

const MATERIALES = [
  ['pull buoy', 'pull buoy'],
  ['pull', 'pull buoy'],
  ['palas cortas', 'palas cortas'],
  ['palas', 'palas'],
  ['aletas', 'aletas'],
  ['tubo', 'tubo'],
  ['tabla', 'tabla'],
  ['chapas', 'chapas'],
]

const RE_CANTIDAD = /(\d+(?:[.,]\d+)?)\s*(min(?:utos?)?|'|’|seg(?:undos?)?|s|"|”|h|km|mts|mtr|m)(?![a-záéíóúñ])/i
const RE_RITMO = /\b(\d{1,2}:[0-5]\d)(?:\s*-\s*(\d{1,2}:[0-5]\d))?\b/
const RE_ZONA = /\bz([1-5])(?:\s*-\s*z?[1-5])?\b/i
const RE_PORCENTAJE = /\b(\d{2,3})\s*%/
const RE_CAL = /^(cal|calent\w*)\b/i
const RE_VC = /^(vc|vuelta(\s+a\s+la\s+calma)?|enfriar\w*)\b/i

function unidadDe(u) {
  const x = u.toLowerCase()
  if (x.startsWith('min') || x === "'" || x === '’') return 'min'
  if (x.startsWith('seg') || x === 's' || x === '"' || x === '”') return 's'
  if (x === 'h') return 'h'
  if (x === 'km') return 'km'
  return 'mtr'
}

// Divide por un separador ignorando lo que haya dentro de paréntesis.
function dividir(texto, separadores, { comaEspacio = false } = {}) {
  const partes = []
  let nivel = 0
  let actual = ''
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (c === '(') nivel++
    if (c === ')') nivel = Math.max(0, nivel - 1)
    // ", " entre bloques (no la coma decimal de "1,5km")
    const comaBloque = comaEspacio && c === ',' && /\s/.test(texto[i + 1] || '')
    if (nivel === 0 && (separadores.includes(c) || comaBloque)) {
      partes.push(actual)
      actual = ''
    } else {
      actual += c
    }
  }
  partes.push(actual)
  return partes.map((p) => p.trim()).filter(Boolean)
}

// Un paso: "1' Z5", "400m Z4 fuerte", "500m palas", "2' rec".
function parsearPaso(texto, disciplina) {
  let resto = ` ${texto.trim()} `
  let forzado = null
  const limpio = resto.trim()
  if (RE_CAL.test(limpio)) {
    forzado = 'warmup'
    resto = ' ' + limpio.replace(RE_CAL, '') + ' '
  } else if (RE_VC.test(limpio)) {
    forzado = 'cooldown'
    resto = ' ' + limpio.replace(RE_VC, '') + ' '
  }

  // Ritmo antes que cantidad: "5:00" no debe leerse como cantidad.
  let objetivo_tipo = null
  let objetivo_valor = null
  const mr = resto.match(RE_RITMO)
  if (mr) {
    objetivo_tipo = 'ritmo'
    objetivo_valor = mr[2] ? `${mr[1]}-${mr[2]}` : mr[1]
    resto = resto.replace(mr[0], ' ').replace(/\s(a|al|@)\s+(?=\s*$|\s)/gi, ' ')
  }

  let cantidad
  let unidad
  const mc = resto.match(RE_CANTIDAD)
  if (mc) {
    cantidad = Number(mc[1].replace(',', '.'))
    unidad = unidadDe(mc[2])
    resto = resto.replace(mc[0], ' ')
  } else {
    // Natación: un número suelto son metros ("400 cal", "100 palas").
    const mn = disciplina === 'swim' ? resto.match(/(?<![\d:.,])(\d{2,4})(?![\d:.,])/) : null
    if (!mn) {
      return { error: `Falta la duración o distancia en "${texto.trim()}" (usa 15', 400m, 5km…)` }
    }
    cantidad = Number(mn[1])
    unidad = 'mtr'
    resto = resto.replace(mn[0], ' ')
  }

  if (!objetivo_tipo) {
    const mz = resto.match(RE_ZONA)
    if (mz) {
      objetivo_tipo = 'zona'
      objetivo_valor = `Z${mz[1]}`
      resto = resto.replace(mz[0], ' ')
    } else {
      const mp = resto.match(RE_PORCENTAJE)
      if (mp) {
        objetivo_tipo = 'fc'
        objetivo_valor = mp[1]
        resto = resto.replace(mp[0], ' ')
      }
    }
  }

  const material = []
  for (const [clave, valor] of MATERIALES) {
    const re = new RegExp(`\\b${clave}\\b`, 'i')
    if (re.test(resto)) {
      if (!material.includes(valor)) material.push(valor)
      resto = resto.replace(re, ' ')
    }
  }

  if (material.length > 0) resto = resto.replace(/\b(con|usando)\b/gi, ' ')
  const nombre = resto.replace(/[@·]/g, ' ').replace(/\s+/g, ' ').trim() || null
  return {
    paso: { cantidad, unidad, objetivo_tipo, objetivo_valor, nombre, material },
    forzado,
  }
}

const RE_DESCANSO = /\b(?:rec(?:up\w*)?|descanso|desc|pausa|r)\.?\s*(\d+(?:[.,]\d+)?\s*(?:min(?:utos?)?|'|’|seg(?:undos?)?|s|"|”))/i

// Serie sin paréntesis: "8x100m 1:45 rec 20"" → 8 × (100m 1:45 / 20" descanso).
function serieSimple(repeticiones, textoPaso, disciplina, nombreSerie = '') {
  let resto = textoPaso
  let descanso = null
  const md = resto.match(RE_DESCANSO)
  if (md) {
    const rd = parsearPaso(md[1], disciplina)
    if (rd.error) return { error: rd.error }
    descanso = { ...rd.paso, nombre: 'Descanso' }
    resto = resto.replace(md[0], ' ')
  }
  const r = parsearPaso(resto, disciplina)
  if (r.error) return { error: r.error }
  const pasos = [ajustarADisciplina(r.paso, disciplina)]
  if (descanso) pasos.push(descanso)
  return { bloque: { tipo: 'repeat', nombre: nombreSerie, repeticiones, pasos } }
}

// Objetivos que el builder no ofrece para esa disciplina (ritmo en bici, todo
// en fuerza) se pasan al nombre del paso para no perder la indicación.
// Natación admite ritmo /100m, zona (de ritmo) y FC %.
function ajustarADisciplina(paso, disciplina) {
  const noVale =
    (disciplina === 'bike' && paso.objetivo_tipo === 'ritmo') ||
    disciplina === 'strength'
  if (!noVale || !paso.objetivo_tipo) return paso
  const etiqueta = paso.objetivo_tipo === 'fc' ? `${paso.objetivo_valor}%` : paso.objetivo_valor
  return {
    ...paso,
    objetivo_tipo: null,
    objetivo_valor: null,
    nombre: [etiqueta, paso.nombre].filter(Boolean).join(' '),
  }
}

// Devuelve { bloques, errores }. Si hay errores, bloques puede venir incompleto.
export function parsearEntreno(texto, disciplina) {
  const errores = []
  const bloques = []
  const segmentos = dividir(String(texto || ''), ['+', ';'], { comaEspacio: true })
  if (segmentos.length === 0) return { bloques, errores: ['Escribe el entrenamiento'] }

  const forzados = []
  for (const seg of segmentos) {
    const serie = seg.match(/^(\d+)\s*[x×]\s*\((.*)\)\s*(.*)$/i)
    if (serie) {
      const repeticiones = Number(serie[1])
      const pasos = []
      for (const p of dividir(serie[2], ['/', ','])) {
        const r = parsearPaso(p, disciplina)
        if (r.error) errores.push(r.error)
        else pasos.push(ajustarADisciplina(r.paso, disciplina))
      }
      if (pasos.length === 0) {
        errores.push(`La serie "${seg}" no tiene pasos`)
        continue
      }
      bloques.push({ tipo: 'repeat', nombre: serie[3].trim(), repeticiones, pasos })
      forzados.push(null)
      continue
    }
    // "8x100m 1:45 rec 20"" (sin paréntesis) y "100m x 8 a 1:45".
    const sin = seg.match(/^(\d+)\s*[x×]\s*(\d.*)$/i)
    const inv = seg.match(/^(\d+(?:[.,]\d+)?\s*(?:min|km|mts|mtr|m|h|s|'|"|’|”)?)\s+[x×]\s*(\d+)\b(.*)$/i)
    if (sin || inv) {
      const rep = sin ? Number(sin[1]) : Number(inv[2])
      const texto = sin ? sin[2] : `${inv[1]} ${inv[3]}`
      const rs = serieSimple(rep, texto, disciplina)
      if (rs.error) errores.push(rs.error)
      else {
        bloques.push(rs.bloque)
        forzados.push(null)
      }
      continue
    }
    const r = parsearPaso(seg, disciplina)
    if (r.error) {
      errores.push(r.error)
      continue
    }
    if (/\b\d+\s*[x×]/i.test(r.paso.nombre || '')) {
      errores.push(`No entiendo la serie en "${seg}". Escríbela como 8x100m 1:45 o 8x(100m 1:45 / 20" rec)`)
      continue
    }
    bloques.push({ tipo: r.forzado || 'step', ...ajustarADisciplina(r.paso, disciplina) })
    forzados.push(r.forzado)
  }

  // Con 3+ bloques, el primero y el último sueltos son calentamiento y vuelta
  // a la calma (lo habitual en las sesiones de Jon), salvo que ya se marcaran.
  if (bloques.length >= 3) {
    const primero = bloques[0]
    const ultimo = bloques[bloques.length - 1]
    if (primero.tipo === 'step' && !forzados[0]) primero.tipo = 'warmup'
    if (ultimo.tipo === 'step' && !forzados[forzados.length - 1]) ultimo.tipo = 'cooldown'
  }

  return { bloques, errores }
}
