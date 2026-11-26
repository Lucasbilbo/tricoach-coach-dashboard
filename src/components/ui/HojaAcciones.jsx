// HojaAcciones — hoja inferior con una lista de acciones (móvil). Se cierra con
// el fondo, con Escape o al elegir una. Cada fila mide ≥ 52 px (táctil ≥ 44).
import { useEffect, useRef } from 'react'
import { COLORS, FONTS } from '../../lib/theme'
import Icon from './Icon'

export default function HojaAcciones({ titulo, acciones, onCerrar }) {
  const primera = useRef(null)

  useEffect(() => {
    primera.current?.focus()
    const alPulsar = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [onCerrar])

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={onCerrar} style={{ position: 'absolute', inset: 0, background: 'rgba(5,6,9,0.66)' }} />
      <div
        style={{
          position: 'relative', width: '100%', maxWidth: 520, boxSizing: 'border-box',
          background: COLORS.raised, borderTop: '1px solid rgba(255,255,255,0.06)', borderRadius: '24px 24px 0 0',
          padding: '12px 20px calc(24px + env(safe-area-inset-bottom))', boxShadow: '0 -20px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#3A4152', margin: '0 auto 14px' }} />
        <div style={{ fontFamily: FONTS.sans, fontSize: 18, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>{titulo}</div>
        {acciones.map((a, i) => (
          <button
            key={a.etiqueta}
            ref={i === 0 ? primera : null}
            type="button"
            disabled={a.desactivada}
            onClick={() => {
              onCerrar()
              a.onElegir()
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 52,
              padding: '0 4px', background: 'transparent', border: 'none',
              borderBottom: i < acciones.length - 1 ? `1px solid ${COLORS.cardBorder}` : 'none',
              color: COLORS.textPrimary, fontFamily: FONTS.sans, fontSize: 16, textAlign: 'left',
              cursor: a.desactivada ? 'not-allowed' : 'pointer', opacity: a.desactivada ? 0.5 : 1,
            }}
          >
            <span>{a.etiqueta}</span>
            {a.detalle ? (
              <span style={{ fontSize: 12.5, color: COLORS.textSecondary }}>{a.detalle}</span>
            ) : (
              <Icon name="chevronRight" size={18} strokeWidth={2} />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
