// Botón del atleta: copia el entreno en texto limpio para pegarlo en la
// descripción de la actividad de Strava (lib/textoStrava.js).
import { useState } from 'react'
import { COLORS } from '../lib/theme'
import { textoParaStrava } from '../lib/textoStrava'
import Icon from './ui/Icon'

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    // Respaldo (navegadores sin permiso de portapapeles): selección + execCommand
    try {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

export default function CopiarStrava({ sesion }) {
  const [estado, setEstado] = useState('') // '' | 'ok' | 'error'
  const texto = textoParaStrava(sesion)
  if (!texto) return null

  async function alPulsar() {
    const ok = await copiar(texto)
    setEstado(ok ? 'ok' : 'error')
    setTimeout(() => setEstado(''), 2500)
  }

  return (
    <button
      type="button"
      onClick={alPulsar}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: '8px 0', minHeight: 36, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', color: estado === 'ok' ? COLORS.accent : estado === 'error' ? COLORS.error : COLORS.textSecondary }}
    >
      <Icon name={estado === 'ok' ? 'check' : 'copy'} size={15} strokeWidth={estado === 'ok' ? 2.2 : 1.8} />
      {estado === 'ok' ? 'Copiado, pégalo en Strava' : estado === 'error' ? 'No se pudo copiar' : 'Copiar para Strava'}
    </button>
  )
}
