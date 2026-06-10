import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { COLORS, pageStyle } from './lib/theme'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import AthleteView from './components/AthleteView'

function ProtectedRoute({ session, cargando, children }) {
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

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute session={session} cargando={cargando}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/athlete/:id"
          element={
            <ProtectedRoute session={session} cargando={cargando}>
              <AthleteView />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
