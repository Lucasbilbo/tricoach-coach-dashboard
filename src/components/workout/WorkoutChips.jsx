// Chips de material y de zona del WorkoutBuilder (C3: extraídos del componente).
// Mismo estilo que el resto de chips del creador (chipStyle): seleccionado en
// blanco translúcido; el teal queda para la acción principal.
import { MATERIAL_POR_DISCIPLINA, ZONAS } from './constants'
import { chipStyle, labelSm } from './styles'

export function MaterialChips({ material, disciplina, onChange }) {
  const items = MATERIAL_POR_DISCIPLINA[disciplina] || []
  if (items.length === 0) return null
  const sel = Array.isArray(material) ? material : []
  return (
    <div style={{ marginTop: 8 }}>
      <span style={labelSm}>Material</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
        {items.map((item) => {
          const activo = sel.includes(item)
          return (
            <button
              key={item}
              type="button"
              aria-pressed={activo}
              onClick={() => onChange(activo ? sel.filter((m) => m !== item) : [...sel, item])}
              style={{ ...chipStyle(activo), minHeight: 28, padding: '4px 9px', fontSize: 12 }}
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
      <div role="radiogroup" aria-label="Zona" style={{ display: 'flex', gap: 5, marginTop: 4 }}>
        {ZONAS.map((z) => (
          <button
            key={z}
            type="button"
            role="radio"
            aria-checked={valor === z}
            onClick={() => onSelect(z)}
            style={{ ...chipStyle(valor === z, { mono: true }), flex: '1 1 0', justifyContent: 'center', maxWidth: 64 }}
          >
            {z}
          </button>
        ))}
      </div>
    </div>
  )
}
