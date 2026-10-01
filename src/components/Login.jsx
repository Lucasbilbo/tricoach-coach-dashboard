import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COLORS, pageStyle, inputStyle, buttonStyle, ghostButtonStyle } from '../lib/theme'
import { Brand } from './ui/Layout'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Mensaje propagado desde una redirección (p.ej. cuenta de Google no vinculada, F2)
  const [error, setError] = useState(location.state?.authError || '')
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Introduce email y contraseña')
      return
    }

    setCargando(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (authError) {
        setError('Email o contraseña incorrectos')
        return
      }

      const [{ data: coach }, { data: profile }] = await Promise.all([
        supabase.from('coaches').select('id').eq('id', data.user.id).maybeSingle(),
        supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle(),
      ])

      if (coach) {
        navigate('/dashboard')
        return
      }

      if (profile) {
        navigate('/home')
        return
      }

      setError('Acceso restringido')
      await supabase.auth.signOut()
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  async function handleGoogle() {
    setError('')
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://jongarcia.getricoach.com/dashboard' },
      })
      if (oauthError) {
        setError('No se pudo iniciar sesión con Google. Inténtalo de nuevo.')
      }
    } catch {
      setError('Error de conexión con Google. Inténtalo de nuevo.')
    }
  }

  const etiqueta = { display: 'block', fontSize: 14, fontWeight: 500, color: COLORS.textPrimary, marginBottom: 6 }
  const campo = { ...inputStyle, padding: '13px 14px', fontSize: 16, borderRadius: 10 }

  return (
    <div style={{ ...pageStyle, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ paddingTop: 8 }}>
          <Brand />
        </div>

        <form onSubmit={handleSubmit} style={{ margin: 'auto 0', padding: '48px 0' }}>
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.02em' }}>Entra en tu panel</h1>
          <p style={{ color: COLORS.textSecondary, fontSize: 15, margin: '10px 0 28px', lineHeight: 1.5 }}>
            Entrenos, análisis y temporada, para entrenadores y atletas.
          </p>

          <label style={etiqueta} htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            style={{ ...campo, marginBottom: 16 }}
          />

          <label style={etiqueta} htmlFor="login-pass">Contraseña</label>
          <input
            id="login-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ ...campo, marginBottom: 20 }}
          />

          {error && (
            <p role="alert" style={{ color: COLORS.error, fontSize: 14, marginTop: 0, marginBottom: 16 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            style={{ ...buttonStyle, width: '100%', padding: '14px 16px', fontSize: 16, borderRadius: 10, opacity: cargando ? 0.6 : 1 }}
          >
            {cargando ? 'Entrando…' : 'Entrar'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: COLORS.cardBorder }} />
            <span style={{ color: COLORS.textTertiary, fontSize: 13 }}>o</span>
            <div style={{ flex: 1, height: 1, background: COLORS.cardBorder }} />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            style={{ ...ghostButtonStyle, width: '100%', padding: '14px 16px', fontSize: 16, borderRadius: 10 }}
          >
            Continuar con Google
          </button>
        </form>
      </div>
    </div>
  )
}
