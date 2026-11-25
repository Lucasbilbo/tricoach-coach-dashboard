import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes alojadas en la propia app (antes Google Fonts: CSS bloqueante de otro
// origen). Archivo variable con eje de anchura (títulos anchos, font-stretch).
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
