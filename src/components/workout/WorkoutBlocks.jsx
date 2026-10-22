// Sub-componentes de bloque del WorkoutBuilder (C3: extraídos del componente).
// Son de presentación pura: reciben el bloque y callbacks; la manipulación del
// estado vive en el WorkoutBuilder.
//
// Maquetación (revisión 2026-10-22): los campos van en una rejilla que llena
// el ancho (antes anchos fijos de 70–110 px: en el móvil se cortaban "Sin
// objetivo" y "ej: Descanso"), la zona en su propia fila y la etiqueta a lo
// ancho. Cada paso de una serie lleva su número y su papelera arriba.
import { COLORS, FONTS, inputStyle } from '../../lib/theme'
import { UNIDADES, OBJETIVOS, OBJETIVO_PLACEHOLDER } from './constants'
import Icon from '../ui/Icon'
import { labelSm, miniBtn, addBtnStyle } from './styles'
import { MaterialChips, ZonasChips } from './WorkoutChips'

const rejilla = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }
const campo = { ...inputStyle, width: '100%', minWidth: 0 }
const tarjeta = {
  background: 'rgba(255,255,255,0.03)',
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 10,
  padding: 12,
  marginBottom: 8,
}
const iconBtn = { ...miniBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, padding: 0 }

// Subir / bajar / quitar un bloque, con iconos.
function BotonesBloque({ idx, total, onMove, onRemove }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      <button type="button" onClick={() => onMove(idx, -1)} disabled={idx === 0} style={{ ...iconBtn, opacity: idx === 0 ? 0.35 : 1 }} aria-label="Subir bloque">
        <Icon name="chevronDown" size={15} style={{ transform: 'rotate(180deg)' }} />
      </button>
      <button type="button" onClick={() => onMove(idx, 1)} disabled={idx === total - 1} style={{ ...iconBtn, opacity: idx === total - 1 ? 0.35 : 1 }} aria-label="Bajar bloque">
        <Icon name="chevronDown" size={15} />
      </button>
      <button type="button" onClick={() => onRemove(idx)} style={iconBtn} aria-label="Quitar bloque">
        <Icon name="trash" size={14} />
      </button>
    </div>
  )
}

// Cantidad · unidad · objetivo (· valor) + zona. Compartido por bloque y paso.
function CamposPaso({ datos, disciplina, onCambio }) {
  const unidades = UNIDADES[disciplina] || UNIDADES.other
  const objetivos = OBJETIVOS[disciplina] || []
  const conValor = datos.objetivo_tipo && datos.objetivo_tipo !== 'zona'
  return (
    <>
      <div style={rejilla}>
        <div>
          <label style={labelSm}>Cantidad</label>
          <input
            type="number"
            min="1"
            inputMode="decimal"
            value={datos.cantidad || ''}
            onChange={(e) => onCambio({ cantidad: Number(e.target.value) })}
            style={{ ...campo, fontFamily: FONTS.mono }}
          />
        </div>
        <div>
          <label style={labelSm}>Unidad</label>
          <select value={datos.unidad || unidades[0]} onChange={(e) => onCambio({ unidad: e.target.value })} style={campo}>
            {unidades.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {objetivos.length > 0 && (
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelSm}>Objetivo</label>
            <select
              value={datos.objetivo_tipo || ''}
              onChange={(e) => onCambio({ objetivo_tipo: e.target.value || null, objetivo_valor: null })}
              style={campo}
            >
              {objetivos.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        {conValor && (
          <div>
            <label style={labelSm}>Valor</label>
            <input
              type="text"
              value={datos.objetivo_valor || ''}
              onChange={(e) => onCambio({ objetivo_valor: e.target.value })}
              placeholder={OBJETIVO_PLACEHOLDER[disciplina]?.[datos.objetivo_tipo] || ''}
              style={{ ...campo, fontFamily: FONTS.mono }}
            />
          </div>
        )}
      </div>
      {datos.objetivo_tipo === 'zona' && (
        <div style={{ marginTop: 8 }}>
          <ZonasChips valor={datos.objetivo_valor} onSelect={(z) => onCambio({ objetivo_valor: z })} />
        </div>
      )}
    </>
  )
}

export function BloqueSimple({ bloque, idx, disciplina, total, onUpdate, onRemove, onMove }) {
  const titulo = bloque.tipo === 'warmup' ? 'Calentamiento'
    : bloque.tipo === 'cooldown' ? 'Vuelta a la calma'
    : 'Paso'

  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{titulo}</span>
        <BotonesBloque idx={idx} total={total} onMove={onMove} onRemove={onRemove} />
      </div>

      <CamposPaso datos={bloque} disciplina={disciplina} onCambio={(c) => onUpdate(idx, c)} />

      <div style={{ marginTop: 8 }}>
        <label style={labelSm}>Nombre / cue (opcional)</label>
        <input
          type="text"
          value={bloque.nombre || ''}
          onChange={(e) => onUpdate(idx, { nombre: e.target.value })}
          placeholder="ej: Progresivo"
          style={campo}
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

export function PasoRepeat({ paso, pasoIdx, repeatIdx, disciplina, onUpdatePaso, onRemovePaso }) {
  const cambiar = (c) => onUpdatePaso(repeatIdx, pasoIdx, c)
  return (
    <div style={{ marginBottom: 10, paddingLeft: 12, borderLeft: '2px solid rgba(139,127,209,0.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.04em', color: COLORS.textTertiary, fontWeight: 600 }}>Paso {pasoIdx + 1}</span>
        <button type="button" onClick={() => onRemovePaso(repeatIdx, pasoIdx)} style={iconBtn} aria-label={`Quitar paso ${pasoIdx + 1}`}>
          <Icon name="trash" size={14} />
        </button>
      </div>

      <CamposPaso datos={paso} disciplina={disciplina} onCambio={cambiar} />

      <div style={{ marginTop: 8 }}>
        <label style={labelSm}>Etiqueta (opcional)</label>
        <input
          type="text"
          value={paso.nombre || ''}
          onChange={(e) => cambiar({ nombre: e.target.value || null })}
          placeholder="ej: Descanso"
          style={campo}
        />
      </div>

      <MaterialChips material={paso.material} disciplina={disciplina} onChange={(mat) => cambiar({ material: mat })} />
    </div>
  )
}

export function BloqueRepeat({ bloque, idx, disciplina, total, onUpdate, onRemove, onMove, onUpdatePaso, onRemovePaso, onAddPaso }) {
  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.load, flexShrink: 0 }}>Serie</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: 13, color: COLORS.textSecondary }}>
            <input
              type="number"
              min="1"
              inputMode="numeric"
              aria-label="Repeticiones"
              value={bloque.repeticiones || 4}
              onChange={(e) => onUpdate(idx, { repeticiones: Number(e.target.value) })}
              style={{ ...inputStyle, width: 56, padding: '7px 8px', fontFamily: FONTS.mono, textAlign: 'center' }}
            />
            ×
          </label>
        </div>
        <BotonesBloque idx={idx} total={total} onMove={onMove} onRemove={onRemove} />
      </div>
      <input
        type="text"
        value={bloque.nombre || ''}
        onChange={(e) => onUpdate(idx, { nombre: e.target.value })}
        placeholder="Nombre de la serie (opcional)"
        aria-label="Nombre de la serie"
        style={{ ...campo, marginBottom: 12, fontSize: 13 }}
      />

      {(bloque.pasos || []).map((paso, pi) => (
        <PasoRepeat
          key={pi}
          paso={paso}
          pasoIdx={pi}
          repeatIdx={idx}
          disciplina={disciplina}
          onUpdatePaso={onUpdatePaso}
          onRemovePaso={onRemovePaso}
        />
      ))}

      <button type="button" onClick={() => onAddPaso(idx)} style={{ ...addBtnStyle, marginTop: 2 }}>
        + Añadir paso
      </button>
    </div>
  )
}
