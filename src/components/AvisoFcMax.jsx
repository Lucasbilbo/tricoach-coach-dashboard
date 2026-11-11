// Aviso de la FC máxima del atleta, arriba del Análisis. Sin ella, el TSS, las
// zonas de pulso y la CTL salen con 185 ppm por defecto y nadie lo sabe. Con
// FC máxima puesta queda una línea discreta para cambiarla. La editan el propio
// atleta y su coach (función set-fc-max).
import { useState } from 'react'
import { COLORS, FONTS, inputStyle, ghostButtonStyle } from '../lib/theme'
import { guardarFcMax } from '../lib/fcMaxApi'
import { validarFcMax, FC_MAX_MIN, FC_MAX_MAX } from '../lib/fcMax'
import Aviso from './ui/Aviso'

function Formulario({ inicial, onGuardar, onCancelar, guardando, error }) {
  const [valor, setValor] = useState(inicial ? String(inicial) : '')
  const valida = validarFcMax(valor) !== null
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (valida && !guardando) onGuardar(validarFcMax(valor)) }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}
    >
      <input
        type="number"
        inputMode="numeric"
        min={FC_MAX_MIN}
        max={FC_MAX_MAX}
        step="1"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder="ej: 192"
        aria-label="FC máxima en pulsaciones por minuto"
        style={{ ...inputStyle, width: 96, padding: '7px 8px', fontFamily: FONTS.mono, textAlign: 'center' }}
      />
      <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>ppm</span>
      <button type="submit" disabled={!valida || guardando} style={{ ...ghostButtonStyle, padding: '7px 12px', fontSize: 13, opacity: valida && !guardando ? 1 : 0.5 }}>
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      {onCancelar && (
        <button type="button" onClick={onCancelar} style={{ ...ghostButtonStyle, padding: '7px 12px', fontSize: 13, color: COLORS.textSecondary }}>
          Cancelar
        </button>
      )}
      {error && <span role="alert" style={{ flexBasis: '100%', fontSize: 12.5, color: COLORS.error }}>{error}</span>}
    </form>
  )
}

export default function AvisoFcMax({ athleteId, fcMaxima, porDefecto, nombre, esCoach, onGuardada }) {
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  if (!athleteId || !fcMaxima) return null

  async function guardar(valor) {
    setGuardando(true)
    setError('')
    const r = await guardarFcMax(athleteId, valor)
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    setEditando(false)
    if (onGuardada) onGuardada(r.fcMax)
  }

  const quien = esCoach ? (nombre ? `${nombre} no tiene` : 'Este atleta no tiene') : 'No tienes'
  const margen = { marginBottom: 14 }

  if (porDefecto) {
    return (
      <Aviso style={margen}>
        <div>
          {quien} FC máxima puesta: se usa <span style={{ fontFamily: FONTS.mono }}>{fcMaxima} ppm</span> por defecto y el TSS, las zonas y la CTL salen con ese valor. Ponla para que sean los reales.
        </div>
        <Formulario inicial={null} onGuardar={guardar} guardando={guardando} error={error} />
      </Aviso>
    )
  }

  if (editando) {
    return (
      <div style={margen}>
        <Formulario inicial={fcMaxima} onGuardar={guardar} onCancelar={() => { setEditando(false); setError('') }} guardando={guardando} error={error} />
      </div>
    )
  }

  return (
    <div style={{ ...margen, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: COLORS.textSecondary }}>
      <span>FC máxima <span style={{ fontFamily: FONTS.mono, color: COLORS.textPrimary }}>{fcMaxima} ppm</span></span>
      <button type="button" onClick={() => setEditando(true)} style={{ ...ghostButtonStyle, padding: '4px 8px', fontSize: 12.5, color: COLORS.textSecondary }}>
        Cambiar
      </button>
    </div>
  )
}
