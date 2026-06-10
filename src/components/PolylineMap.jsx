import { useEffect, useRef } from 'react'
import { COLORS } from '../lib/theme'

// Decodificador del formato de polyline de Google (sin librerías externas)
function decodePolyline(encoded) {
  const puntos = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    for (const eje of [0, 1]) {
      let result = 0
      let shift = 0
      let byte
      do {
        byte = encoded.charCodeAt(index) - 63
        index += 1
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (eje === 0) lat += delta
      else lng += delta
    }
    puntos.push([lat / 1e5, lng / 1e5])
  }
  return puntos
}

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 400
const PADDING = 24

export default function PolylineMap({ polyline }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!polyline || !canvasRef.current) return

    let puntos
    try {
      puntos = decodePolyline(polyline)
    } catch {
      return
    }
    if (puntos.length < 2) return

    const lats = puntos.map((p) => p[0])
    const lngs = puntos.map((p) => p[1])
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    const anchoUtil = CANVAS_WIDTH - PADDING * 2
    const altoUtil = CANVAS_HEIGHT - PADDING * 2
    const rangoLat = maxLat - minLat || 1e-6
    const rangoLng = maxLng - minLng || 1e-6
    // Misma escala en ambos ejes para no deformar la ruta
    const escala = Math.min(anchoUtil / rangoLng, altoUtil / rangoLat)
    const offsetX = PADDING + (anchoUtil - rangoLng * escala) / 2
    const offsetY = PADDING + (altoUtil - rangoLat * escala) / 2

    const ctx = canvasRef.current.getContext('2d')
    ctx.fillStyle = COLORS.background
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.strokeStyle = COLORS.accent
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    ctx.beginPath()
    puntos.forEach(([lat, lng], i) => {
      const x = offsetX + (lng - minLng) * escala
      const y = offsetY + (maxLat - lat) * escala
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [polyline])

  if (!polyline) return null

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{
        width: '100%',
        maxHeight: 400,
        borderRadius: 8,
        border: `1px solid ${COLORS.cardBorder}`,
        background: COLORS.background,
        display: 'block',
      }}
    />
  )
}
