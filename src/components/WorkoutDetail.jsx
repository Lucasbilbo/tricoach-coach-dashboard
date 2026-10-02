import { COLORS, FONTS } from '../lib/theme'
import { conPausas, textoPausa } from '../lib/intervalsText'

// Detalle de un entreno prescrito: perfil de intensidad (como lo dibuja el
// reloj) + lista de pasos. Lo ven el coach (lista de sesiones) y el atleta.

const PISCINA_LABEL = { '25': 'Piscina de 25 m', '50': 'Piscina de 50 m', open: 'Aguas abiertas' }

// Intensidad 1–5 → color (de suave a máximo, con la paleta del panel).
const COLOR_NIVEL = { 1: '#4E6475', 2: '#2FBFAF', 3: '#E8934A', 4: '#E8704F', 5: '#E85D5D' }

function nivelPaso(paso) {
  const v = paso.objetivo_valor
  if (paso.objetivo_tipo === 'zona' && v) return Math.min(Math.max(Number(String(v).replace(/\D/g, '').charAt(0)) || 1, 1), 5)
  if (paso.objetivo_tipo === 'fc' && v) {
    const pct = Number(v)
    return pct >= 92 ? 5 : pct >= 85 ? 4 : pct >= 78 ? 3 : pct >= 70 ? 2 : 1
  }
  if (paso.objetivo_tipo === 'ritmo' || paso.objetivo_tipo === 'potencia') return 3
  // Sin objetivo: se interpreta por el nombre ("fuerte", "Z4", "descanso")
  const n = (paso.nombre || '').toLowerCase()
  const z = n.match(/z([1-5])/)
  if (z) return Number(z[1])
  if (/tope|fuerte|r[aá]pido/.test(n)) return 4
  return 1
}

// Peso relativo de un paso en el perfil: minutos reales o una estimación por
// distancia (solo para dibujar proporciones).
function pesoPaso(paso, disciplina) {
  const c = Number(paso.cantidad) || 0
  if (paso.unidad === 'min') return c
  if (paso.unidad === 'h') return c * 60
  if (paso.unidad === 's') return c / 60
  const metros = paso.unidad === 'km' ? c * 1000 : c
  if (disciplina === 'swim') return (metros / 100) * 2
  if (disciplina === 'bike') return (metros / 1000) * 2
  return (metros / 1000) * 5
}

function aplanar(bloques) {
  const out = []
  for (const b of bloques) {
    if (b.tipo === 'repeat') {
      const veces = Math.min(Number(b.repeticiones) || 1, 40)
      for (let i = 0; i < veces; i++) for (const p of b.pasos || []) if (p.tipo !== 'pausa') out.push(p)
    } else if (b.tipo !== 'pausa') out.push(b)
  }
  return out
}

function Perfil({ bloques, disciplina }) {
  const pasos = aplanar(bloques)
  const total = pasos.reduce((s, p) => s + pesoPaso(p, disciplina), 0)
  if (!total) return null
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 36, marginBottom: 12 }}>
      {pasos.map((p, i) => {
        const nivel = nivelPaso(p)
        return (
          <div
            key={i}
            style={{
              flexGrow: pesoPaso(p, disciplina),
              flexBasis: 0,
              minWidth: 2,
              height: `${20 + nivel * 16}%`,
              background: COLOR_NIVEL[nivel],
              borderRadius: 2,
            }}
          />
        )
      })}
    </div>
  )
}

function formatCant(cant, unidad) {
  if (!cant && cant !== 0) return ''
  if (unidad === 'min') return `${cant}′`
  if (unidad === 's') return `${cant}″`
  if (unidad === 'h') return `${cant} h`
  if (unidad === 'mtr') return `${cant} m`
  return `${cant} ${unidad || ''}`
}

function formatObjetivo(tipo, valor) {
  if (!tipo || !valor) return ''
  if (tipo === 'fc') return `${valor}% FC`
  if (tipo === 'potencia') return `${valor}% pot.`
  if (tipo === 'ritmo') return valor
  return valor
}

// Pausa automática entre bloques de natación: acaba al pulsar vuelta.
function Pausa({ paso }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <span style={{ fontFamily: FONTS.mono, fontSize: 12, color: COLORS.textTertiary, width: 58, flexShrink: 0, textAlign: 'right' }}>
        vuelta
      </span>
      <span style={{ width: 8, height: 8, borderRadius: 4, border: `1px solid ${COLORS.textTertiary}`, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: COLORS.textTertiary, fontStyle: 'italic' }}>
        Pulsa vuelta · {textoPausa(paso)}
      </span>
    </div>
  )
}

function Paso({ paso, etiqueta, disciplina }) {
  const nivel = nivelPaso(paso)
  const obj = formatObjetivo(paso.objetivo_tipo, paso.objetivo_valor)
  const mat = Array.isArray(paso.material) && paso.material.length > 0 ? paso.material.join(', ') : null
  const texto = [etiqueta, paso.nombre].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '5px 0' }}>
      <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textPrimary, width: 58, flexShrink: 0, textAlign: 'right' }}>
        {formatCant(paso.cantidad, paso.unidad)}
      </span>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_NIVEL[nivel], flexShrink: 0, alignSelf: 'center' }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.4 }}>
        {obj && <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary, marginRight: 6 }}>{obj}</span>}
        {texto}
        {mat && <span style={{ color: COLORS.textTertiary }}> — {mat}</span>}
        {!obj && !texto && !mat && disciplina !== 'swim' && <span style={{ color: COLORS.textTertiary }}>Libre</span>}
      </span>
    </div>
  )
}

export default function WorkoutDetail({ sesion, mostrarNotas = true }) {
  const ws = sesion?.workout_steps
  if (!ws?.bloques?.length) return null

  const disciplina = sesion.disciplina
  const notas = ws.notas || sesion.notas
  const bloques = conPausas(ws.bloques, disciplina)

  return (
    <div style={{ marginTop: 8, padding: '12px 12px 8px', background: 'rgba(255,255,255,0.025)', borderRadius: 10 }}>
      <Perfil bloques={ws.bloques} disciplina={disciplina} />
      {disciplina === 'swim' && ws.piscina && (
        <p style={{ margin: '0 0 6px', fontSize: 12, color: COLORS.textTertiary }}>{PISCINA_LABEL[ws.piscina] || ws.piscina}</p>
      )}

      {bloques.map((bloque, idx) =>
        bloque.tipo === 'pausa' ? (
          <Pausa key={idx} paso={bloque} />
        ) : bloque.tipo === 'repeat' ? (
          <div key={idx} style={{ margin: '4px 0', padding: '4px 0 4px 0', borderLeft: `2px solid ${COLORS.load}`, borderRadius: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '2px 0' }}>
              <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontWeight: 600, color: COLORS.load, width: 56, textAlign: 'right' }}>
                {bloque.repeticiones} ×
              </span>
              <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{bloque.nombre || 'Serie'}</span>
            </div>
            {(bloque.pasos || []).map((paso, pi) =>
              paso.tipo === 'pausa' ? <Pausa key={pi} paso={paso} /> : <Paso key={pi} paso={paso} disciplina={disciplina} />
            )}
          </div>
        ) : (
          <Paso
            key={idx}
            paso={bloque}
            disciplina={disciplina}
            etiqueta={bloque.tipo === 'warmup' ? 'Calentamiento' : bloque.tipo === 'cooldown' ? 'Vuelta a la calma' : null}
          />
        )
      )}

      {mostrarNotas && notas && (
        <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${COLORS.cardBorder}`, background: COLORS.background }}>
          <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>Nota del entrenador</p>
          <p style={{ margin: 0, fontSize: 14, color: COLORS.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{notas}</p>
        </div>
      )}
    </div>
  )
}
