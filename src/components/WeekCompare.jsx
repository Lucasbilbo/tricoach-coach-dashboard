import { useEffect, useState } from 'react'
import Icon from './ui/Icon'
import { num } from '../lib/numero'
import { COLORS, FONTS, inputStyle, iconButtonStyle } from '../lib/theme'
import { formatFechaCorta, formatHorasMin, hoyMadrid, lunesDeSemana, sumarDias } from '../lib/chartUtils'
import { indicesPorDefecto } from '../lib/compararSemanas'

// Sin verde/rojo: eran el teal de natación y el coral de carrera, y además más
// km no es "bueno" ni menos "malo" (una semana de descarga baja a propósito).
// La flecha dice el sentido; el color no juzga.

const FILAS = [
  { clave: 'km_run', label: 'Km carrera' },
  { clave: 'km_bike', label: 'Km bici' },
  { clave: 'km_swim', label: 'Km natación' },
  { clave: 'horas_totales', label: 'Horas totales', horas: true },
  { clave: 'n_sesiones', label: 'Nº sesiones' },
  { clave: 'tss_total', label: 'TSS total' },
]

// 'YYYY-MM-DD' (lunes) → '2 Jun – 8 Jun' (· en curso)
function etiquetaSemana(lunes, lunesHoy) {
  const base = `${formatFechaCorta(lunes)} – ${formatFechaCorta(sumarDias(lunes, 6))}`
  return lunes === lunesHoy ? `${base} · en curso` : base
}

// Horas en "3h 30m" (antes "3.5"); el resto tal cual
const valorTexto = (v, fila) => (v == null ? '—' : fila.horas ? formatHorasMin(v) : num(v, 1))

function Diferencia({ a, b, fila }) {
  if (a == null || b == null) {
    return <span style={{ color: COLORS.textSecondary }}>—</span>
  }
  const delta = Math.round((a - b) * 10) / 10
  if (delta === 0) {
    return <span style={{ color: COLORS.textSecondary }}>=</span>
  }
  const flecha = delta > 0 ? '▲' : '▼'
  return (
    <span style={{ color: COLORS.textPrimary, fontWeight: 600, fontFamily: FONTS.mono }}>
      {flecha} {fila.horas ? formatHorasMin(Math.abs(a - b)) : num(Math.abs(delta), 1)}
    </span>
  )
}

const celdaStyle = {
  padding: '10px 4px',
  fontSize: 14.5,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
}

export default function WeekCompare({ semanas, onClose }) {
  // semanas viene ordenado ascendente: la última es la más reciente
  const hoy = hoyMadrid()
  const lunesHoy = lunesDeSemana(hoy)
  const [indiceA, setIndiceA] = useState(() => indicesPorDefecto(semanas, hoy).a)
  const [indiceB, setIndiceB] = useState(() => indicesPorDefecto(semanas, hoy).b)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const semanaA = semanas[indiceA]
  const semanaB = semanas[indiceB]

  const selectorStyle = { ...inputStyle, marginTop: 4 }

  return (
    <aside
      role="dialog"
      aria-label="Comparar semanas"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 380,
        maxWidth: '90vw',
        background: COLORS.card,
        borderLeft: `1px solid ${COLORS.cardBorder}`,
        padding: 24,
        boxSizing: 'border-box',
        overflowY: 'auto',
        zIndex: 90,
        fontFamily: FONTS.sans,
        boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, fontStretch: '112%', letterSpacing: '-0.015em', color: COLORS.textPrimary }}>
          Comparar semanas
        </h2>
        <button
          aria-label="Cerrar"
          title="Cerrar"
          onClick={onClose}
          style={iconButtonStyle}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {semanas.length === 0 && (
        <p style={{ color: COLORS.textSecondary, fontSize: 14.5 }}>
          No hay semanas con datos en el rango seleccionado.
        </p>
      )}

      {semanas.length > 0 && (
        <>
          <label style={{ display: 'block', fontSize: 13.5, color: COLORS.textSecondary }}>
            Semana A
            <select
              value={indiceA}
              onChange={(e) => setIndiceA(Number(e.target.value))}
              style={selectorStyle}
            >
              {semanas.map((s, i) => (
                <option key={s.semana} value={i}>
                  {etiquetaSemana(s.semana, lunesHoy)}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{ display: 'block', fontSize: 13.5, color: COLORS.textSecondary, marginTop: 14 }}
          >
            Semana B
            <select
              value={indiceB}
              onChange={(e) => setIndiceB(Number(e.target.value))}
              style={selectorStyle}
            >
              {semanas.map((s, i) => (
                <option key={s.semana} value={i}>
                  {etiquetaSemana(s.semana, lunesHoy)}
                </option>
              ))}
            </select>
          </label>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
            <thead>
              <tr>
                <th style={{ ...celdaStyle, textAlign: 'left', color: COLORS.textSecondary, fontSize: 13, fontWeight: 600 }} />
                <th style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textSecondary, fontSize: 13, fontWeight: 600 }}>
                  A
                </th>
                <th style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textSecondary, fontSize: 13, fontWeight: 600 }}>
                  B
                </th>
                <th style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textSecondary, fontSize: 13, fontWeight: 600 }}>
                  Dif.
                </th>
              </tr>
            </thead>
            <tbody>
              {FILAS.map((fila) => {
                const valorA = semanaA?.[fila.clave] ?? null
                const valorB = semanaB?.[fila.clave] ?? null
                return (
                  <tr key={fila.clave}>
                    <td style={{ ...celdaStyle, color: COLORS.textSecondary }}>{fila.label}</td>
                    <td style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textPrimary, fontWeight: 600, fontFamily: FONTS.mono }}>
                      {valorTexto(valorA, fila)}
                    </td>
                    <td style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textPrimary, fontFamily: FONTS.mono }}>
                      {valorTexto(valorB, fila)}
                    </td>
                    <td style={{ ...celdaStyle, textAlign: 'right' }}>
                      <Diferencia a={valorA} b={valorB} fila={fila} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </aside>
  )
}
