// Aviso ámbar (algo salió a medias y hay que hacer algo) o rojo (error), con
// botón para cerrarlo. Mismo ámbar que el aviso de disponibilidad del creador.
import { COLORS } from '../../lib/theme'
import Icon from './Icon'

const TONOS = {
  ambar: { color: '#E8B84A', borde: 'rgba(232,184,74,0.45)', fondo: 'rgba(232,184,74,0.08)' },
  error: { color: COLORS.error, borde: 'rgba(232,93,93,0.45)', fondo: 'rgba(232,93,93,0.08)' },
}

export default function Aviso({ children, tono = 'ambar', onCerrar, style }) {
  if (!children) return null
  const t = TONOS[tono] || TONOS.ambar
  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8, fontSize: 13,
        lineHeight: 1.45, color: t.color, border: `1px solid ${t.borde}`, background: t.fondo, ...style,
      }}
    >
      <Icon name="alert" size={15} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          style={{ background: 'none', border: 'none', color: t.color, padding: 2, cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
