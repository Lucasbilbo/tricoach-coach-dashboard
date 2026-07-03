// Chips de material y de zona del WorkoutBuilder (C3: extraídos del componente).
import { COLORS } from '../../lib/theme'
import { MATERIAL_POR_DISCIPLINA, ZONAS } from './constants'
import { labelSm } from './styles'

export function MaterialChips({ material, disciplina, onChange }) {
  const items = MATERIAL_POR_DISCIPLINA[disciplina] || []
  if (items.length === 0) return null
  const sel = Array.isArray(material) ? material : []
  return (
    <div style={{ marginTop: 6 }}>
      <span style={labelSm}>Material</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
        {items.map((item) => {
          const activo = sel.includes(item)
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(activo ? sel.filter((m) => m !== item) : [...sel, item])}
              style={{
                background: activo ? 'rgba(47,191,175,0.1)' : 'transparent',
                color: activo ? COLORS.accent : COLORS.textSecondary,
                border: `1px solid ${activo ? COLORS.accent : COLORS.cardBorder}`,
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: "'Archivo', sans-serif",
              }}
            >
              {item}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ZonasChips({ valor, onSelect }) {
  return (
    <div>
      <span style={labelSm}>Zona</span>
      <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
        {ZONAS.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => onSelect(z)}
            style={{
              background: valor === z ? COLORS.accent : 'transparent',
              color: valor === z ? COLORS.background : COLORS.textSecondary,
              border: `1px solid ${valor === z ? COLORS.accent : COLORS.cardBorder}`,
              borderRadius: 4,
              padding: '3px 7px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Archivo', sans-serif",
            }}
          >
            {z}
          </button>
        ))}
      </div>
    </div>
  )
}
