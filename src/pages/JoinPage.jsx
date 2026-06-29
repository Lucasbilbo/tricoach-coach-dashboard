import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COLORS } from '../lib/theme'

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
  maxWidth: 440,
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
  marginBottom: 14,
}

const labelStyle = {
  display: 'block',
  fontSize: 13,
  color: COLORS.textSecondary,
}

export default function JoinPage() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [invitacion, setInvitacion] = useState(null)
  const [tokenValido, setTokenValido] = useState(null) // null = cargando
  const [coachNombre, setCoachNombre] = useState('')

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setTokenValido(false)
      return
    }
    let activo = true

    async function verificarToken() {
      const { data } = await supabase
        .from('athlete_invitations')
        .select('*, coaches(nombre, email)')
        .eq('token', token)
        .is('used', false)
        .maybeSingle()

      if (!activo) return

      if (!data) {
        setTokenValido(false)
        return
      }

      setInvitacion(data)
      setTokenValido(true)
      if (data.email) setEmail(data.email)
      setCoachNombre(data.coaches?.nombre || data.coaches?.email || 'tu entrenador')
    }

    verificarToken()
    return () => { activo = false }
  }, [token])

  async function handleRegistrar(e) {
    e.preventDefault()
    setError('')

    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (!email.trim()) { setError('El email es obligatorio'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }

    setRegistrando(true)
    try {
      // Crear usuario vía función backend (bypasa RLS con service key)
      const res = await fetch('/.netlify/functions/accept-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email: email.trim(), password, nombre: nombre.trim() }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(json.error || 'Error creando la cuenta')
        return
      }

      // Iniciar sesión con las credenciales recién creadas
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (loginError) {
        // Cuenta creada pero login falló — redirigir al inicio
        navigate('/')
        return
      }

      // Redirigir al wizard de Intervals
      navigate('/setup/intervals')
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.')
    } finally {
      setRegistrando(false)
    }
  }

  // Cargando
  if (tokenValido === null) {
    return (
      <div style={pageStyle}>
        <p style={{ color: COLORS.textSecondary }}>Verificando invitación…</p>
      </div>
    )
  }

  // Token inválido
  if (!tokenValido) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700 }}>
            Link no válido
          </h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>
            Este link de invitación ya no es válido o ha sido usado.
            Pide a tu entrenador un nuevo link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>
            Te ha invitado {coachNombre}
          </h2>
          <p style={{ color: COLORS.textSecondary, fontSize: 14, margin: 0 }}>
            Crea tu cuenta para ver tus entrenamientos
          </p>
        </div>

        <form onSubmit={handleRegistrar}>
          <label style={labelStyle}>Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Tu nombre"
            style={inputStyle}
            autoComplete="name"
          />

          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            readOnly={!!invitacion?.email}
            style={{
              ...inputStyle,
              opacity: invitacion?.email ? 0.7 : 1,
            }}
            autoComplete="email"
          />

          <label style={labelStyle}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            style={inputStyle}
            autoComplete="new-password"
          />

          {error && (
            <p style={{ color: COLORS.error, fontSize: 13, margin: '-6px 0 12px' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={registrando}
            style={{
              width: '100%',
              background: COLORS.accent,
              color: COLORS.background,
              border: 'none',
              borderRadius: 8,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: registrando ? 'wait' : 'pointer',
              fontFamily: "'Inter', sans-serif",
              opacity: registrando ? 0.7 : 1,
            }}
          >
            {registrando ? 'Creando cuenta...' : 'Crear cuenta y empezar'}
          </button>
        </form>
      </div>
    </div>
  )
}
