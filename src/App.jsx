import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { COLORS, pageStyle } from './lib/theme'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AthleteView from './components/AthleteView'
import JoinPage from './pages/JoinPage'
import IntervalsSetup from './pages/IntervalsSetup'

// Solo protege /dashboard y /athlete/:id.
// Gestiona su propio estado de auth — las rutas públicas no pasan por aquí.
function ProtectedRoute({ children }) {
  const [session, setSession] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
        setCargando(false)
      })
      .catch(() => setCargando(false))

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nuevaSesion) => {
      setSession(nuevaSesion)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  if (cargando) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: COLORS.textSecondary }}>Cargando…</p>
      </div>
    )
  }
  if (!session) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* Rutas de coach — requieren sesión */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/athlete/:id" element={<ProtectedRoute><AthleteView /></ProtectedRoute>} />

        {/* Rutas públicas — sin auth, sin checks de coaches */}
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/setup/intervals" element={<IntervalsSetup />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
