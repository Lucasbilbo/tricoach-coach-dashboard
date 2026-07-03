// Sub-componentes de bloque del WorkoutBuilder (C3: extraídos del componente).
// Son de presentación pura: reciben el bloque y callbacks; la manipulación del
// estado vive en el WorkoutBuilder.
import { COLORS, inputStyle } from '../../lib/theme'
import { UNIDADES, OBJETIVOS, OBJETIVO_PLACEHOLDER } from './constants'
import { labelSm, miniBtn, addBtnStyle } from './styles'
import { MaterialChips, ZonasChips } from './WorkoutChips'

export function BloqueSimple({ bloque, idx, disciplina, total, onUpdate, onRemove, onMove }) {
  const unidades = UNIDADES[disciplina] || UNIDADES.other
  const objetivos = OBJETIVOS[disciplina] || []

  const titulo = bloque.tipo === 'warmup' ? '🌊 Calentamiento'
    : bloque.tipo === 'cooldown' ? '🌊 Vuelta calma'
    : '▸ Paso libre'

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent }}>{titulo}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onMove(idx, -1)} disabled={idx === 0} style={miniBtn}>↑</button>
          <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1} style={miniBtn}>↓</button>
          <button onClick={() => onRemove(idx)} style={{ ...miniBtn, color: COLORS.error }}>🗑</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={labelSm}>Cantidad</label>
          <input
            type="number"
            min="1"
            value={bloque.cantidad || ''}
            onChange={(e) => onUpdate(idx, { cantidad: Number(e.target.value) })}
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <div>
          <label style={labelSm}>Unidad</label>
          <select
            value={bloque.unidad || unidades[0]}
            onChange={(e) => onUpdate(idx, { unidad: e.target.value })}
            style={{ ...inputStyle, width: 80 }}
          >
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {objetivos.length > 0 && (
          <>
            <div>
              <label style={labelSm}>Objetivo</label>
              <select
                value={bloque.objetivo_tipo || ''}
                onChange={(e) => onUpdate(idx, { objetivo_tipo: e.target.value || null, objetivo_valor: null })}
                style={{ ...inputStyle, width: 110 }}
              >
                {objetivos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {bloque.objetivo_tipo && (
              bloque.objetivo_tipo === 'zona' ? (
                <ZonasChips
                  valor={bloque.objetivo_valor}
                  onSelect={(z) => onUpdate(idx, { objetivo_valor: z })}
                />
              ) : (
                <div>
                  <label style={labelSm}>Valor</label>
                  <input
                    type="text"
                    value={bloque.objetivo_valor || ''}
                    onChange={(e) => onUpdate(idx, { objetivo_valor: e.target.value })}
                    placeholder={OBJETIVO_PLACEHOLDER[disciplina]?.[bloque.objetivo_tipo] || ''}
                    style={{ ...inputStyle, width: 80 }}
                  />
                </div>
              )
            )}
          </>
        )}
      </div>

      <div style={{ marginTop: 8 }}>
        <label style={labelSm}>Nombre / cue (opcional)</label>
        <input
          type="text"
          value={bloque.nombre || ''}
          onChange={(e) => onUpdate(idx, { nombre: e.target.value })}
          placeholder="ej: Progresivo"
          style={{ ...inputStyle, width: '100%' }}
        />
      </div>

      <MaterialChips
        material={bloque.material}
        disciplina={disciplina}
        onChange={(mat) => onUpdate(idx, { material: mat })}
      />
    </div>
  )
}

export function PasoRepeat({ paso, pasoIdx, repeatIdx, disciplina, totalPasos, onUpdatePaso, onRemovePaso }) {
  const unidades = UNIDADES[disciplina] || UNIDADES.other
  const objetivos = OBJETIVOS[disciplina] || []

  return (
    <div
      style={{
        marginBottom: 8,
        paddingLeft: 12,
        borderLeft: `2px solid rgba(255,255,255,0.1)`,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: COLORS.textSecondary, minWidth: 14, paddingBottom: 6 }}>
          {pasoIdx === totalPasos - 1 ? '└' : '├'}
        </span>
        <div>
          <label style={labelSm}>Cant.</label>
          <input
            type="number"
            min="1"
            value={paso.cantidad || ''}
            onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { cantidad: Number(e.target.value) })}
            style={{ ...inputStyle, width: 70 }}
          />
        </div>
        <div>
          <label style={labelSm}>Unidad</label>
          <select
            value={paso.unidad || unidades[0]}
            onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { unidad: e.target.value })}
            style={{ ...inputStyle, width: 70 }}
          >
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {objetivos.length > 0 && (
          <>
            <div>
              <label style={labelSm}>Objetivo</label>
              <select
                value={paso.objetivo_tipo || ''}
                onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { objetivo_tipo: e.target.value || null, objetivo_valor: null })}
                style={{ ...inputStyle, width: 100 }}
              >
                {objetivos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {paso.objetivo_tipo && (
              paso.objetivo_tipo === 'zona' ? (
                <ZonasChips
                  valor={paso.objetivo_valor}
                  onSelect={(z) => onUpdatePaso(repeatIdx, pasoIdx, { objetivo_valor: z })}
                />
              ) : (
                <div>
                  <label style={labelSm}>Valor</label>
                  <input
                    type="text"
                    value={paso.objetivo_valor || ''}
                    onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { objetivo_valor: e.target.value })}
                    placeholder={OBJETIVO_PLACEHOLDER[disciplina]?.[paso.objetivo_tipo] || ''}
                    style={{ ...inputStyle, width: 70 }}
                  />
                </div>
              )
            )}
          </>
        )}
        <div>
          <label style={labelSm}>Etiqueta</label>
          <input
            type="text"
            value={paso.nombre || ''}
            onChange={(e) => onUpdatePaso(repeatIdx, pasoIdx, { nombre: e.target.value || null })}
            placeholder="ej: Descanso"
            style={{ ...inputStyle, width: 80 }}
          />
        </div>
        <button
          onClick={() => onRemovePaso(repeatIdx, pasoIdx)}
          style={{ ...miniBtn, color: COLORS.error, marginBottom: 1 }}
        >
          🗑
        </button>
      </div>

      <div style={{ paddingLeft: 20 }}>
        <MaterialChips
          material={paso.material}
          disciplina={disciplina}
          onChange={(mat) => onUpdatePaso(repeatIdx, pasoIdx, { material: mat })}
        />
      </div>
    </div>
  )
}

export function BloqueRepeat({ bloque, idx, disciplina, total, onUpdate, onRemove, onMove, onUpdatePaso, onRemovePaso, onAddPaso }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#8B7FD1' }}>🔁 Serie</span>
          <input
            type="text"
            value={bloque.nombre || ''}
            onChange={(e) => onUpdate(idx, { nombre: e.target.value })}
            placeholder="Serie principal"
            style={{ ...inputStyle, width: 160, fontSize: 12 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <label style={{ ...labelSm, marginBottom: 0 }}>Reps</label>
            <input
              type="number"
              min="1"
              value={bloque.repeticiones || 4}
              onChange={(e) => onUpdate(idx, { repeticiones: Number(e.target.value) })}
              style={{ ...inputStyle, width: 60, fontSize: 12 }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => onMove(idx, -1)} disabled={idx === 0} style={miniBtn}>↑</button>
          <button onClick={() => onMove(idx, 1)} disabled={idx === total - 1} style={miniBtn}>↓</button>
          <button onClick={() => onRemove(idx)} style={{ ...miniBtn, color: COLORS.error }}>🗑</button>
        </div>
      </div>

      {(bloque.pasos || []).map((paso, pi) => (
        <PasoRepeat
          key={pi}
          paso={paso}
          pasoIdx={pi}
          repeatIdx={idx}
          disciplina={disciplina}
          totalPasos={(bloque.pasos || []).length}
          onUpdatePaso={onUpdatePaso}
          onRemovePaso={onRemovePaso}
        />
      ))}

      <button onClick={() => onAddPaso(idx)} style={{ ...addBtnStyle, marginTop: 6 }}>
        + Añadir paso
      </button>
    </div>
  )
}
