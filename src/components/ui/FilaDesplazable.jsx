// Fila horizontal que se desplaza (chips de fecha y hora). Si hay más contenido a
// la derecha, un degradado en el borde lo anuncia (antes los chips se cortaban sin
// pista de que había más: W6). El degradado no recibe toques y desaparece al llegar
// al final. `fondo` debe ser el color de lo que hay detrás de la fila.
import { useCallback, useEffect, useRef, useState } from 'react'
import { COLORS } from '../../lib/theme'

export default function FilaDesplazable({ children, fondo = COLORS.card, style }) {
  const fila = useRef(null)
  const [hayMas, setHayMas] = useState(false)

  const medir = useCallback(() => {
    const el = fila.current
    if (!el) return
    setHayMas(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    medir()
    const el = fila.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [medir, children])

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={fila}
        onScroll={medir}
        style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none', ...style }}
      >
        {children}
      </div>
      {hayMas && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', top: 0, right: 0, bottom: 6, width: 48, pointerEvents: 'none',
            background: `linear-gradient(90deg, rgba(0,0,0,0), ${fondo})`,
          }}
        />
      )}
    </div>
  )
}
