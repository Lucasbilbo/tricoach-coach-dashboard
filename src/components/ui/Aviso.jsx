// Aviso ámbar (algo salió a medias y hay que hacer algo) o rojo (error), con
// botón para cerrarlo. Mismo ámbar que el aviso de disponibilidad del creador.
import { COLORS } from '../../lib/theme'
import Icon from './Icon'

const TONOS = {
  ambar: { color: '#E8B84A', texto: '#F1D79A', fondo: 'rgba(232,184,74,0.1)' },
  error: { color: COLORS.error, texto: '#F2A3A3', fondo: 'rgba(232,93,93,0.12)' },
}

export default function Aviso({ children, tono = 'ambar', onCerrar, style }) {
  if (!children) return null
  const t = TONOS[tono] || TONOS.ambar
  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 14, fontSize: 15,
        lineHeight: 1.45, color: t.texto, background: t.fondo, ...style,
      }}
    >
      <Icon name="alert" size={17} strokeWidth={2.2} color={t.color} style={{ flexShrink: 0, marginTop: 2 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {onCerrar && (
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar aviso"
          style={{ background: 'none', border: 'none', color: t.color, padding: 0, width: 32, height: 32, margin: '-6px -6px -6px 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  )
}
