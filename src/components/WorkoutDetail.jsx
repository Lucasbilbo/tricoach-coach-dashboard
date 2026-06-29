import { COLORS } from '../lib/theme'

const PISCINA_LABEL = { '25': 'Piscina 25m', '50': 'Piscina 50m', open: 'Aguas abiertas' }
const DISC_EMOJI = { swim: '🏊', bike: '🚴', run: '🏃', strength: '💪', other: '🏋' }

function bloqueColor(tipo, esDescanso) {
  if (esDescanso) return null
  if (tipo === 'warmup' || tipo === 'cooldown') return '#00D4FF'
  if (tipo === 'repeat') return '#7C3AED'
  return '#00E5A0'
}

function bloqueBg(tipo) {
  if (tipo === 'repeat') return 'rgba(124,58,237,0.08)'
  return 'transparent'
}

function bloqueIcono(tipo) {
  if (tipo === 'warmup' || tipo === 'cooldown') return '🔵'
  if (tipo === 'repeat') return '🔁'
  return '🟢'
}

function bloqueNombre(bloque) {
  if (bloque.tipo === 'warmup') return bloque.nombre || 'Calentamiento'
  if (bloque.tipo === 'cooldown') return bloque.nombre || 'Vuelta a la calma'
  return bloque.nombre || '—'
}

function formatCant(cant, unidad) {
  if (!cant) return ''
  if (unidad === 'min') return `${cant}m`
  if (unidad === 'h') return `${cant}h`
  return `${cant} ${unidad || ''}`
}

function formatObjetivo(tipo, valor) {
  if (!tipo || !valor) return ''
  if (tipo === 'fc') return `${valor}% FC`
  if (tipo === 'potencia') return `${valor}% pot.`
  if (tipo === 'ritmo') return valor
  return valor
}

const labelSecundario = { fontSize: 12, color: COLORS.textSecondary }
const materialStyle = { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }

function PasoRow({ paso, esPrimero, esUltimo }) {
  const esDescanso = !paso.objetivo_tipo
  const mat = Array.isArray(paso.material) && paso.material.length > 0 ? paso.material.join(', ') : null
  const obj = formatObjetivo(paso.objetivo_tipo, paso.objetivo_valor)
  return (
    <div
      style={{
        paddingLeft: 8,
        paddingTop: 4,
        paddingBottom: 4,
        display: 'flex',
        gap: 6,
        alignItems: 'flex-start',
        opacity: esDescanso ? 0.7 : 1,
      }}
    >
      <span style={{ color: COLORS.textSecondary, fontSize: 11, paddingTop: 2, flexShrink: 0 }}>
        {esUltimo ? '└' : '├'}
      </span>
      <div>
        <span style={labelSecundario}>
          {formatCant(paso.cantidad, paso.unidad)}
          {obj ? <span style={{ color: COLORS.textSecondary }}> · {obj}</span> : null}
          {paso.nombre ? <span style={{ color: COLORS.textSecondary }}> — {paso.nombre}</span> : null}
        </span>
        {mat && <p style={materialStyle}>{mat}</p>}
      </div>
    </div>
  )
}

function BloqueCard({ bloque, disciplina }) {
  const esDescanso = bloque.tipo === 'step' && !bloque.objetivo_tipo
  const borde = bloqueColor(bloque.tipo, esDescanso)
  const bg = bloqueBg(bloque.tipo)
  const obj = formatObjetivo(bloque.objetivo_tipo, bloque.objetivo_valor)
  const mat = Array.isArray(bloque.material) && bloque.material.length > 0 ? bloque.material.join(', ') : null

  return (
    <div
      style={{
        borderLeft: borde ? `3px solid ${borde}` : '3px solid transparent',
        background: bg,
        borderRadius: 6,
        padding: '8px 12px',
        marginBottom: 6,
      }}
    >
      {bloque.tipo === 'repeat' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13 }}>{bloqueIcono(bloque.tipo)}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
              {bloque.nombre || 'Serie'}{' '}
              <span style={{ color: '#7C3AED', fontWeight: 700 }}>×{bloque.repeticiones}</span>
            </span>
          </div>
          {(bloque.pasos || []).map((paso, pi) => (
            <PasoRow
              key={pi}
              paso={paso}
              esPrimero={pi === 0}
              esUltimo={pi === (bloque.pasos || []).length - 1}
            />
          ))}
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span style={{ fontSize: 13, flexShrink: 0 }}>{bloqueIcono(bloque.tipo)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>
                {bloqueNombre(bloque)}
              </span>
              <span style={labelSecundario}>
                {formatCant(bloque.cantidad, bloque.unidad)}
                {obj ? ` · ${obj}` : ''}
              </span>
            </div>
            {mat && <p style={materialStyle}>{mat}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

export default function WorkoutDetail({ sesion, mostrarNotas = true }) {
  const ws = sesion?.workout_steps
  if (!ws?.bloques?.length) return null

  const disciplina = sesion.disciplina
  const piscina = ws.piscina
  const notas = ws.notas || sesion.notas

  const subtitulo = []
  if (disciplina === 'swim' && piscina) subtitulo.push(PISCINA_LABEL[piscina] || piscina)

  return (
    <div style={{ marginTop: 12 }}>
      {/* Header del workout */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 6,
          borderLeft: `3px solid ${COLORS.accent}`,
        }}
      >
        <span style={{ fontSize: 16 }}>{DISC_EMOJI[disciplina] || '🏋'}</span>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
            {sesion.descripcion || '—'}
          </p>
          {subtitulo.length > 0 && (
            <p style={{ margin: 0, fontSize: 11, color: COLORS.textSecondary }}>
              {subtitulo.join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Bloques */}
      <div>
        {ws.bloques.map((bloque, idx) => (
          <BloqueCard key={idx} bloque={bloque} disciplina={disciplina} />
        ))}
      </div>

      {/* Notas del entrenador */}
      {mostrarNotas && notas && (
        <div
          style={{
            marginTop: 10,
            padding: '10px 12px',
            background: 'rgba(0,212,255,0.06)',
            border: `1px solid ${COLORS.accent}`,
            borderRadius: 8,
          }}
        >
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 600, color: COLORS.accent }}>
            📝 Nota del entrenador
          </p>
          <p style={{ margin: 0, fontSize: 13, color: COLORS.textPrimary, whiteSpace: 'pre-wrap' }}>
            {notas}
          </p>
        </div>
      )}
    </div>
  )
}
