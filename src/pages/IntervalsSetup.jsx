import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

const PASOS_TOTAL = 4

const pageStyle = {
  minHeight: '100vh',
  background: COLORS.background,
  color: COLORS.textPrimary,
  fontFamily: "'Inter', sans-serif",
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const cardStyle = {
  background: '#0F1729',
  border: `1px solid rgba(255,255,255,0.06)`,
  borderRadius: 16,
  padding: 40,
  maxWidth: 480,
  width: '100%',
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: COLORS.background,
  border: `1px solid rgba(255,255,255,0.06)`,
  borderRadius: 8,
  padding: '10px 12px',
  color: COLORS.textPrimary,
  fontSize: 14,
  fontFamily: "'Inter', sans-serif",
  outline: 'none',
  marginTop: 6,
}

const btnPrimary = {
  width: '100%',
  background: COLORS.accent,
  color: COLORS.background,
  border: 'none',
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
  marginTop: 16,
}

const btnSecondary = {
  width: '100%',
  background: 'transparent',
  color: COLORS.textSecondary,
  border: `1px solid rgba(255,255,255,0.06)`,
  borderRadius: 8,
  padding: '12px 16px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
  marginTop: 8,
}

function ProgressDots({ paso }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            width: i === paso ? 20 : 8,
            height: 8,
            borderRadius: 4,
            background: i === paso ? COLORS.accent : i < paso ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)',
            transition: 'all 0.2s',
          }}
        />
      ))}
    </div>
  )
}

export default function IntervalsSetup() {
  const [paso, setPaso] = useState(1)
  const [apiKey, setApiKey] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [verificado, setVerificado] = useState(null) // { athleteId, nombre }
  const [errorKey, setErrorKey] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function verificarKey() {
    if (!apiKey.trim()) {
      setErrorKey('Pega tu API key primero')
      return
    }
    setVerificando(true)
    setErrorKey('')
    setVerificado(null)
    try {
      const res = await fetch('/.netlify/functions/verify-intervals-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (json.ok) {
        setVerificado({ athleteId: json.athleteId, nombre: json.nombre })
        // Guardar en perfil si el atleta está logado
        await guardarEnPerfil(apiKey.trim(), String(json.athleteId))
        setPaso(3)
      } else {
        setErrorKey(json.error || 'API key inválido')
      }
    } catch {
      setErrorKey('Error de conexión verificando la key')
    } finally {
      setVerificando(false)
    }
  }

  async function guardarEnPerfil(key, athleteId) {
    setGuardando(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id
      if (!userId) return
      await supabase
        .from('profiles')
        .update({ intervals_api_key: key, intervals_athlete_id: athleteId })
        .eq('id', userId)
    } catch {
      // Si no está logado o falla, no bloquear el wizard
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <ProgressDots paso={paso} />

        {/* Paso 1 — Crear cuenta */}
        {paso === 1 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: COLORS.textSecondary }}>
              Paso 1 de {PASOS_TOTAL}
            </p>
            <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700 }}>
              📱 Crea tu cuenta en Intervals.icu
            </h2>
            <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              Intervals.icu es la plataforma que conecta a tu entrenador con tu Garmin. Es gratuita.
            </p>
            <a
              href="https://intervals.icu/signup"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                background: COLORS.accent,
                color: COLORS.background,
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Ir a intervals.icu/signup ↗
            </a>
            <button onClick={() => setPaso(2)} style={btnSecondary}>
              Ya tengo cuenta → Siguiente
            </button>
          </div>
        )}

        {/* Paso 2 — Obtener API key */}
        {paso === 2 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: COLORS.textSecondary }}>
              Paso 2 de {PASOS_TOTAL}
            </p>
            <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700 }}>
              🔑 Obtén tu API key
            </h2>
            <ol style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.8, margin: '0 0 20px', paddingLeft: 20 }}>
              <li>Entra en intervals.icu</li>
              <li>Ve a <strong style={{ color: COLORS.textPrimary }}>Settings</strong> (esquina superior derecha)</li>
              <li>Baja hasta <strong style={{ color: COLORS.textPrimary }}>Developer Settings</strong></li>
              <li>Haz click en <strong style={{ color: COLORS.textPrimary }}>API Key</strong> y cópiala</li>
            </ol>

            <label style={{ fontSize: 13, color: COLORS.textSecondary }}>
              Pega tu API key aquí:
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setErrorKey('') }}
              placeholder="icu_..."
              style={inputStyle}
            />

            {errorKey && (
              <p style={{ color: COLORS.error, fontSize: 13, margin: '8px 0 0' }}>{errorKey}</p>
            )}

            {verificado && (
              <p style={{ color: '#00E5A0', fontSize: 13, margin: '8px 0 0' }}>
                ✅ Conectado como {verificado.nombre}
              </p>
            )}

            <button
              onClick={verificarKey}
              disabled={verificando || guardando}
              style={{ ...btnPrimary, opacity: verificando ? 0.7 : 1 }}
            >
              {verificando ? 'Verificando...' : 'Verificar y continuar'}
            </button>
            <button onClick={() => setPaso(1)} style={btnSecondary}>
              ← Volver
            </button>
          </div>
        )}

        {/* Paso 3 — Conectar Garmin */}
        {paso === 3 && (
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: COLORS.textSecondary }}>
              Paso 3 de {PASOS_TOTAL}
            </p>
            <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700 }}>
              ⌚ Conecta tu Garmin
            </h2>
            <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>
              Para que los entrenamientos lleguen a tu reloj:
            </p>
            <ol style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.8, margin: '0 0 20px', paddingLeft: 20 }}>
              <li>En intervals.icu, ve a <strong style={{ color: COLORS.textPrimary }}>Settings</strong></li>
              <li>Busca <strong style={{ color: COLORS.textPrimary }}>Garmin Connect</strong></li>
              <li>Haz click en <strong style={{ color: COLORS.textPrimary }}>Connect Garmin</strong></li>
              <li>Autoriza el acceso</li>
            </ol>
            <a
              href="https://intervals.icu/settings"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                background: 'transparent',
                color: COLORS.accent,
                border: `1px solid ${COLORS.accent}`,
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Ir a intervals.icu/settings ↗
            </a>
            <button onClick={() => setPaso(4)} style={btnPrimary}>
              ✅ Ya he conectado mi Garmin → Siguiente
            </button>
          </div>
        )}

        {/* Paso 4 — Listo */}
        {paso === 4 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700 }}>
              ¡Todo configurado!
            </h2>
            <p style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 1.7, margin: '0 0 24px' }}>
              Tu entrenador ya puede enviarte entrenamientos directamente a tu Garmin.
              Los recibirás en la app Garmin Connect y en tu reloj antes de cada sesión.
            </p>
            <button
              onClick={() => (window.location.href = '/')}
              style={btnPrimary}
            >
              Volver al inicio
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
