import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COLORS, cardStyle, pageStyle, inputStyle, buttonStyle } from '../lib/theme'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
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

      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (coachError) {
        setError('Error verificando el acceso. Inténtalo de nuevo.')
        await supabase.auth.signOut()
        return
      }

      if (!coach) {
        setError('Acceso restringido')
        await supabase.auth.signOut()
        return
      }

      navigate('/dashboard')
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div
      style={{
        ...pageStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <form onSubmit={handleSubmit} style={{ ...cardStyle, width: 360, padding: 32 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          TriCoach <span style={{ color: COLORS.accent }}>Coach</span>
        </h1>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginTop: 8, marginBottom: 24 }}>
          Panel del entrenador
        </p>

        <label style={{ display: 'block', fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        <label style={{ display: 'block', fontSize: 13, color: COLORS.textSecondary, marginBottom: 6 }}>
          Contraseña
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{ ...inputStyle, marginBottom: 24 }}
        />

        {error && (
          <p style={{ color: COLORS.error, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          style={{ ...buttonStyle, width: '100%', opacity: cargando ? 0.6 : 1 }}
        >
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
