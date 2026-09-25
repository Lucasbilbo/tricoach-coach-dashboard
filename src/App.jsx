import { useEffect, useState, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { COLORS, pageStyle } from './lib/theme'
import Login from './components/Login'
import JoinPage from './pages/JoinPage'
import IntervalsSetup from './pages/IntervalsSetup'

// Rutas con Recharts (StravaAnalysis) o pesadas van en chunks aparte: así
// /login y /join/:token no descargan Recharts. Login/JoinPage/IntervalsSetup se
// mantienen eager (entrada pública, primer render rápido).
const Dashboard = lazy(() => import('./components/Dashboard'))
const AthleteView = lazy(() => import('./components/AthleteView'))
const AthleteHome = lazy(() => import('./pages/AthleteHome'))

// Fallback de carga coherente con el diseño (mismo patrón que ProtectedRoute).
function PageFallback() {
  return (
    <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: COLORS.textSecondary }}>Cargando…</p>
    </div>
  )
}

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
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* Rutas de coach — requieren sesión */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/athlete/:id" element={<ProtectedRoute><AthleteView /></ProtectedRoute>} />

        {/* Rutas de atleta — requieren sesión */}
        <Route path="/home" element={<ProtectedRoute><AthleteHome /></ProtectedRoute>} />

        {/* Rutas públicas — sin auth, sin checks de coaches */}
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/setup/intervals" element={<IntervalsSetup />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
