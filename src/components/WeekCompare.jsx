import { useState } from 'react'
import { COLORS, inputStyle } from '../lib/theme'
import { formatFechaCorta, sumarDias } from '../lib/chartUtils'

const VERDE = '#00E5A0'
const ROJO = '#FF4D6D'

const FILAS = [
  { clave: 'km_run', label: 'Km carrera' },
  { clave: 'km_bike', label: 'Km bici' },
  { clave: 'km_swim', label: 'Km natación' },
  { clave: 'horas_totales', label: 'Horas totales' },
  { clave: 'n_sesiones', label: 'Nº sesiones' },
  { clave: 'tss_total', label: 'TSS total', neutro: true },
]

// 'YYYY-MM-DD' (lunes) → 'Jun 2 – Jun 8'
function etiquetaSemana(lunes) {
  return `${formatFechaCorta(lunes)} – ${formatFechaCorta(sumarDias(lunes, 6))}`
}

function Diferencia({ a, b, neutro }) {
  if (a == null || b == null) {
    return <span style={{ color: COLORS.textSecondary }}>—</span>
  }
  const delta = Math.round((a - b) * 10) / 10
  if (delta === 0) {
    return <span style={{ color: COLORS.textSecondary }}>=</span>
  }
  const color = neutro ? COLORS.textSecondary : delta > 0 ? VERDE : ROJO
  const flecha = delta > 0 ? '▲' : '▼'
  return (
    <span style={{ color, fontWeight: 600 }}>
      {flecha} {Math.abs(delta)}
    </span>
  )
}

const celdaStyle = {
  padding: '10px 4px',
  fontSize: 13,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
}

export default function WeekCompare({ semanas, onClose }) {
  // semanas viene ordenado ascendente: la última es la más reciente
  const [indiceA, setIndiceA] = useState(semanas.length - 1)
  const [indiceB, setIndiceB] = useState(Math.max(semanas.length - 2, 0))

  const semanaA = semanas[indiceA]
  const semanaB = semanas[indiceB]

  const selectorStyle = { ...inputStyle, marginTop: 4 }

  return (
    <aside
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
        fontFamily: "'Inter', sans-serif",
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
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.textPrimary }}>
          Comparar semanas
        </h2>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            background: 'transparent',
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 8,
            color: COLORS.textSecondary,
            width: 28,
            height: 28,
            fontSize: 14,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {semanas.length === 0 && (
        <p style={{ color: COLORS.textSecondary, fontSize: 13 }}>
          No hay semanas con datos en el rango seleccionado.
        </p>
      )}

      {semanas.length > 0 && (
        <>
          <label style={{ display: 'block', fontSize: 12, color: COLORS.textSecondary }}>
            Semana A
            <select
              value={indiceA}
              onChange={(e) => setIndiceA(Number(e.target.value))}
              style={selectorStyle}
            >
              {semanas.map((s, i) => (
                <option key={s.semana} value={i}>
                  {etiquetaSemana(s.semana)}
                </option>
              ))}
            </select>
          </label>

          <label
            style={{ display: 'block', fontSize: 12, color: COLORS.textSecondary, marginTop: 14 }}
          >
            Semana B
            <select
              value={indiceB}
              onChange={(e) => setIndiceB(Number(e.target.value))}
              style={selectorStyle}
            >
              {semanas.map((s, i) => (
                <option key={s.semana} value={i}>
                  {etiquetaSemana(s.semana)}
                </option>
              ))}
            </select>
          </label>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
            <thead>
              <tr>
                <th style={{ ...celdaStyle, textAlign: 'left', color: COLORS.textSecondary, fontSize: 11, fontWeight: 600 }} />
                <th style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textSecondary, fontSize: 11, fontWeight: 600 }}>
                  A
                </th>
                <th style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textSecondary, fontSize: 11, fontWeight: 600 }}>
                  B
                </th>
                <th style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textSecondary, fontSize: 11, fontWeight: 600 }}>
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
                    <td style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textPrimary, fontWeight: 600 }}>
                      {valorA != null ? valorA : '—'}
                    </td>
                    <td style={{ ...celdaStyle, textAlign: 'right', color: COLORS.textPrimary }}>
                      {valorB != null ? valorB : '—'}
                    </td>
                    <td style={{ ...celdaStyle, textAlign: 'right' }}>
                      <Diferencia a={valorA} b={valorB} neutro={fila.neutro} />
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
