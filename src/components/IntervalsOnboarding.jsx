import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS, cardStyle } from '../lib/theme'

export default function IntervalsOnboarding({ athleteId }) {
  const [perfil, setPerfil] = useState(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!athleteId) return
    let activo = true
    supabase
      .from('profiles')
      .select('intervals_api_key, intervals_athlete_id, nombre')
      .eq('id', athleteId)
      .maybeSingle()
      .then(({ data }) => {
        if (activo) setPerfil(data)
      })
    return () => { activo = false }
  }, [athleteId])

  const setupLink = `${window.location.origin}/setup/intervals`
  const configurado = !!(perfil?.intervals_api_key && perfil?.intervals_athlete_id)

  function copiarLink() {
    navigator.clipboard.writeText(setupLink).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    })
  }

  return (
    <div
      style={{
        ...cardStyle,
        marginBottom: 16,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: configurado ? 0 : 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Configuración Garmin
        </span>
        {configurado ? (
          <span style={{ fontSize: 13, color: '#00E5A0', fontWeight: 600 }}>
            ✅ {perfil.intervals_athlete_id} — {perfil.nombre || 'atleta'}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: COLORS.error, fontWeight: 600 }}>
            ❌ No configurado
          </span>
        )}
      </div>

      {!configurado && (
        <div>
          <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.textSecondary }}>
            Este atleta no ha conectado Intervals.icu. Envíale este link de configuración:
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code
              style={{
                background: '#0A0F1E',
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 12,
                color: COLORS.accent,
                flex: 1,
                minWidth: 200,
                wordBreak: 'break-all',
              }}
            >
              {setupLink}
            </code>
            <button
              onClick={copiarLink}
              style={{
                background: copiado ? 'rgba(0,229,160,0.1)' : 'transparent',
                color: copiado ? '#00E5A0' : COLORS.textSecondary,
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                whiteSpace: 'nowrap',
              }}
            >
              {copiado ? '✓ Copiado' : '📋 Copiar link'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
