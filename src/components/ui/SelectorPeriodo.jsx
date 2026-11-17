import { useState } from 'react'
import { COLORS, FONTS, iconButtonStyle, inputStyle } from '../../lib/theme'
import { hoyMadrid } from '../../lib/chartUtils'
import {
  SEMANAS_PRESET,
  etiquetaPeriodo,
  limiteMinimo,
  moverSemana,
  periodoRango,
  periodoRangoPorDefecto,
  periodoSemanaPasada,
  periodoSemanas,
  terminaHoy,
} from '../../lib/periodo'
import Icon from './Icon'
import { Segmented } from './Layout'

// Selector del periodo de Análisis (coach y atleta): últimas N semanas, una
// semana concreta (◀ ▶ de lunes a domingo) o un rango entre dos fechas. La
// lógica está en lib/periodo.js; aquí solo se pinta y se llama a `onChange`.
export default function SelectorPeriodo({ periodo, onChange }) {
  const hoy = hoyMadrid()
  const preset = periodo.tipo === 'semanas' ? periodo.semanas : null
  const modo = periodo.tipo === 'semanas' ? null : periodo.tipo // 'semana' | 'rango'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Segmented
          ariaLabel="Semanas a mostrar"
          value={preset}
          onChange={(n) => onChange(periodoSemanas(n))}
          options={SEMANAS_PRESET.map((n) => ({ value: n, label: `${n} sem` }))}
        />
        <Segmented
          ariaLabel="Una semana o un rango de fechas"
          value={modo}
          onChange={(m) => {
            if (m === modo) return
            const p = m === 'semana' ? periodoSemanaPasada(hoy) : periodoRangoPorDefecto(hoy)
            if (p) onChange(p)
          }}
          options={[
            { value: 'semana', label: 'Semana' },
            { value: 'rango', label: 'Fechas' },
          ]}
        />
      </div>

      {modo === 'semana' && <NavegadorSemana periodo={periodo} hoy={hoy} onChange={onChange} />}
      {modo === 'rango' && <CamposFechas periodo={periodo} hoy={hoy} onChange={onChange} />}
    </div>
  )
}

function NavegadorSemana({ periodo, hoy, onChange }) {
  const anterior = moverSemana(periodo, -1, hoy)
  const siguiente = moverSemana(periodo, 1, hoy)
  const boton = (destino, icono, etiqueta) => (
    <button
      type="button"
      aria-label={etiqueta}
      disabled={!destino}
      onClick={() => destino && onChange(destino)}
      style={{ ...iconButtonStyle, opacity: destino ? 1 : 0.35, cursor: destino ? 'pointer' : 'not-allowed' }}
    >
      <Icon name={icono} size={16} strokeWidth={2} />
    </button>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {boton(anterior, 'back', 'Semana anterior')}
      <span style={{ fontFamily: FONTS.mono, fontSize: 13, color: COLORS.textPrimary, minWidth: 130, textAlign: 'center' }}>
        {etiquetaPeriodo(periodo, hoy)}
      </span>
      {boton(siguiente, 'chevronRight', 'Semana siguiente')}
      {terminaHoy(periodo, hoy) && <span style={{ fontSize: 12, color: COLORS.textTertiary }}>en curso</span>}
    </div>
  )
}

function CamposFechas({ periodo, hoy, onChange }) {
  // Borrador local: un campo de fecha a medio escribir no es un periodo válido
  const [desde, setDesde] = useState(periodo.desde)
  const [hasta, setHasta] = useState(periodo.hasta)

  function cambiar(nuevoDesde, nuevoHasta) {
    const p = periodoRango(nuevoDesde, nuevoHasta, hoy)
    if (p) {
      // Se enseña el rango ya ajustado (ordenado y dentro de lo que hay)
      setDesde(p.desde)
      setHasta(p.hasta)
      onChange(p)
    } else {
      setDesde(nuevoDesde)
      setHasta(nuevoHasta)
    }
  }

  const campo = (texto, valor, alCambiar) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.textSecondary }}>
      {texto}
      <input
        type="date"
        value={valor}
        min={limiteMinimo(hoy)}
        max={hoy}
        onChange={(e) => alCambiar(e.target.value)}
        style={{ ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: 13, fontFamily: FONTS.mono, colorScheme: 'dark' }}
      />
    </label>
  )

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
      {campo('Desde', desde, (v) => cambiar(v, hasta))}
      {campo('Hasta', hasta, (v) => cambiar(desde, v))}
    </div>
  )
}
