// Ajustes de bici de un atleta: ¿tiene potenciómetro? y FTP. Los editan el
// atleta y su coach. Con el interruptor activo, el creador ofrece objetivos de
// potencia en la bici, el reloj los recibe por potencia y el TSS de las salidas
// con medidor se calcula con potencia (necesita FTP).
import { useState } from 'react'
import { COLORS, FONTS, buttonStyle, inputStyle } from '../lib/theme'
import { usePotencia } from '../hooks/usePotencia'
import { ftpValido } from '../lib/potenciaApi'
import Icon from './ui/Icon'

export default function PotenciaAjustes({ athleteId, uid, compacto = false }) {
  const p = usePotencia(athleteId, uid)
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  if (!p.disponible) return null // tabla sin crear o cargando: no se pinta

  const actual = form || { potenciometro: p.potenciometro, ftp: p.ftp_w == null ? '' : String(p.ftp_w) }
  const ftpOk = ftpValido(actual.ftp) !== undefined
  const sucio = form && (form.potenciometro !== p.potenciometro || (ftpValido(form.ftp) ?? null) !== (p.ftp_w ?? null))

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await p.guardar({ potenciometro: actual.potenciometro, ftp_w: ftpValido(actual.ftp) })
      setForm(null)
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const resumen = p.potenciometro
    ? `Potenciómetro${p.ftp_w ? ` · FTP ${p.ftp_w} W` : ' · sin FTP'}`
    : 'Sin potenciómetro (bici por pulso)'

  return (
    <div style={{ marginBottom: compacto ? 0 : 16 }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: '8px 0', minHeight: 36, color: COLORS.textSecondary, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}
      >
        <Icon name="chevronDown" size={16} style={{ transform: abierto ? 'rotate(180deg)' : 'none' }} />
        Bici: {resumen}
      </button>

      {abierto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0 8px' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', minHeight: 32 }}>
            <input
              type="checkbox"
              checked={actual.potenciometro}
              onChange={(e) => setForm({ ...actual, potenciometro: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: COLORS.accent, margin: 0 }}
            />
            Tiene potenciómetro en la bici
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', maxWidth: 200 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }}>FTP (vatios)</span>
            <input
              type="number"
              inputMode="numeric"
              min="50"
              max="700"
              value={actual.ftp}
              onChange={(e) => setForm({ ...actual, ftp: e.target.value })}
              placeholder="Ej.: 230"
              aria-label="FTP en vatios"
              style={{ ...inputStyle, fontFamily: FONTS.mono }}
            />
          </label>
          <p style={{ margin: 0, fontSize: 12.5, color: COLORS.textTertiary, lineHeight: 1.45 }}>
            Con potenciómetro, la bici se prescribe y se envía al reloj por potencia, y el TSS de las salidas con medidor se calcula con potencia (necesita FTP). El mismo FTP tiene que estar en Intervals.icu (ajustes de ciclismo) para que el reloj convierta zonas y % en vatios.
          </p>
          {error && <p style={{ margin: 0, fontSize: 13, color: COLORS.error }}>{error}</p>}
          <div>
            <button
              type="button"
              onClick={guardar}
              disabled={!sucio || !ftpOk || guardando}
              style={{ ...buttonStyle, padding: '8px 16px', opacity: !sucio || !ftpOk || guardando ? 0.5 : 1, cursor: !sucio || !ftpOk ? 'default' : 'pointer' }}
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
