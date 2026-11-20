// Ajustes de carga de un atleta: ¿tiene potenciómetro?, FTP y FC de umbral.
// Los editan el atleta y su coach. Con el interruptor activo, el creador ofrece
// objetivos de potencia en la bici, el reloj los recibe por potencia y el TSS de
// las salidas con medidor se calcula con potencia (necesita FTP). La FC de
// umbral es la base del TSS por pulso (vacía = 90 % de la FC máx).
// Al cambiar el FTP se sube solo a Intervals.icu (sync-ftp).
//
// modo 'tarjeta' (por defecto): tarjeta abierta, visible (/home del atleta).
// modo 'plegable': una línea que se abre (Sesiones del coach).
import { useState } from 'react'
import { COLORS, FONTS, buttonStyle, cardStyle, inputStyle } from '../lib/theme'
import { usePotencia } from '../hooks/usePotencia'
import { ftpValido, fcUmbralValida, sincronizarFtpIntervals } from '../lib/potenciaApi'
import { fcUmbralPorDefecto, ftpAntiguo } from '../lib/potencia'
import { formatDiaMes } from '../lib/chartUtils'
import Icon from './ui/Icon'

const MENSAJE_SYNC = {
  ok: (ftp) => ({ color: COLORS.accent, texto: `FTP de ${ftp} W puesto también en Intervals.icu: el reloj ya lo usa.` }),
  NO_INTERVALS: () => ({ color: COLORS.warning, texto: 'Guardado. Sin Intervals.icu conectado, el reloj no puede convertir las zonas en vatios.' }),
  otro: () => ({ color: COLORS.warning, texto: 'Guardado, pero no se pudo poner el FTP en Intervals.icu. Ponlo allí a mano (ajustes de ciclismo).' }),
}

function Interruptor({ activo, onChange, etiqueta }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      onClick={() => onChange(!activo)}
      style={{
        flexShrink: 0, width: 46, height: 28, borderRadius: 14, padding: 3, cursor: 'pointer',
        border: `1px solid ${activo ? COLORS.accent : COLORS.cardBorder}`,
        background: activo ? 'rgba(47,191,175,0.18)' : COLORS.background,
        display: 'flex', justifyContent: activo ? 'flex-end' : 'flex-start', transition: 'all 150ms',
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: 10, background: activo ? COLORS.accent : COLORS.textSecondary }} />
    </button>
  )
}

export default function PotenciaAjustes({ athleteId, uid, fcMax = null, modo = 'tarjeta', esCoach = false }) {
  const p = usePotencia(athleteId, uid)
  const [abierto, setAbierto] = useState(modo === 'tarjeta')
  const [form, setForm] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState(null)

  if (!p.disponible) return null // tabla sin crear o cargando: no se pinta

  const actual = form || {
    potenciometro: p.potenciometro,
    ftp: p.ftp_w == null ? '' : String(p.ftp_w),
    umbral: p.fc_umbral == null ? '' : String(p.fc_umbral),
  }
  const ftpOk = ftpValido(actual.ftp) !== undefined
  const umbralOk = fcUmbralValida(actual.umbral) !== undefined
  const sucio = form && (
    form.potenciometro !== p.potenciometro ||
    (ftpValido(form.ftp) ?? null) !== (p.ftp_w ?? null) ||
    (fcUmbralValida(form.umbral) ?? null) !== (p.fc_umbral ?? null)
  )
  const umbralDefecto = fcUmbralPorDefecto(fcMax)
  const tu = esCoach ? 'su' : 'tu'

  async function guardar() {
    setGuardando(true)
    setError('')
    setAviso(null)
    try {
      const ftpAntes = p.ftp_w ?? null
      const r = await p.guardar({ potenciometro: actual.potenciometro, ftp_w: ftpValido(actual.ftp), fc_umbral: fcUmbralValida(actual.umbral) })
      setForm(null)
      // FTP nuevo → a Intervals, para que el reloj convierta con el mismo valor
      if (r.ftp_w && r.ftp_w !== ftpAntes) {
        const s = await sincronizarFtpIntervals(athleteId)
        setAviso(s.ok ? MENSAJE_SYNC.ok(s.ftp) : (MENSAJE_SYNC[s.code] || MENSAJE_SYNC.otro)())
      } else {
        setAviso({ color: COLORS.accent, texto: 'Guardado.' })
      }
    } catch {
      setError('No se pudo guardar. Inténtalo de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const resumen = p.potenciometro
    ? `Potenciómetro${p.ftp_w ? ` · FTP ${p.ftp_w} W` : ' · sin FTP'}`
    : 'Sin potenciómetro (bici por pulso)'

  const cuerpo = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{esCoach ? 'Tiene potenciómetro' : 'Tengo potenciómetro'}</div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2, lineHeight: 1.4 }}>
            {actual.potenciometro ? 'La bici se prescribe y llega al reloj por potencia.' : 'La bici va por pulso.'}
          </div>
        </div>
        <Interruptor activo={actual.potenciometro} etiqueta="Potenciómetro en la bici" onChange={(v) => setForm({ ...actual, potenciometro: v })} />
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', flex: '1 1 140px', maxWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }}>FTP (vatios)</span>
          <input
            type="number" inputMode="numeric" min="50" max="700"
            value={actual.ftp}
            onChange={(e) => setForm({ ...actual, ftp: e.target.value })}
            placeholder="Ej.: 230"
            aria-label="FTP en vatios"
            aria-invalid={!ftpOk}
            style={{ ...inputStyle, fontFamily: FONTS.mono, borderColor: ftpOk ? COLORS.cardBorder : COLORS.error }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', flex: '1 1 140px', maxWidth: 220 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, margin: '0 0 6px' }}>FC umbral (lpm)</span>
          <input
            type="number" inputMode="numeric" min="100" max="220"
            value={actual.umbral}
            onChange={(e) => setForm({ ...actual, umbral: e.target.value })}
            placeholder={umbralDefecto ? `≈ ${umbralDefecto}` : 'Opcional'}
            aria-label="FC de umbral en pulsaciones por minuto"
            aria-invalid={!umbralOk}
            style={{ ...inputStyle, fontFamily: FONTS.mono, borderColor: umbralOk ? COLORS.cardBorder : COLORS.error }}
          />
        </label>
      </div>

      {p.ftp_w && p.ftp_fecha && !form && (
        <p style={{ margin: 0, fontSize: 13, color: ftpAntiguo(p.ftp_fecha) ? COLORS.warning : COLORS.textSecondary }}>
          FTP del <span style={{ fontFamily: FONTS.mono }}>{formatDiaMes(p.ftp_fecha)}</span>
          {ftpAntiguo(p.ftp_fecha) ? ' · tiene más de 8 semanas: conviene repetir el test.' : ''}
        </p>
      )}
      {actual.potenciometro && !ftpValido(actual.ftp) && (
        <p style={{ margin: 0, fontSize: 13, color: COLORS.warning, lineHeight: 1.45 }}>
          Sin FTP, el TSS de la bici sigue por pulso y el reloj no puede convertir las zonas en vatios.
        </p>
      )}
      <p style={{ margin: 0, fontSize: 12.5, color: COLORS.textTertiary, lineHeight: 1.45 }}>
        El TSS por pulso se calcula con {tu} FC umbral (si no se pone, el 90 % de {tu} FC máxima) y el de potencia con el FTP: una hora a umbral son 100 en los dos. El FTP se pone solo en Intervals.icu al guardarlo.
      </p>
      {!ftpOk && <p style={{ margin: 0, fontSize: 13, color: COLORS.error }}>El FTP va de 50 a 700 W.</p>}
      {!umbralOk && <p style={{ margin: 0, fontSize: 13, color: COLORS.error }}>La FC umbral va de 100 a 220 lpm.</p>}
      {error && <p style={{ margin: 0, fontSize: 13, color: COLORS.error }}>{error}</p>}
      {aviso && !form && <p role="status" style={{ margin: 0, fontSize: 13, color: aviso.color, lineHeight: 1.45 }}>{aviso.texto}</p>}
      <div>
        <button
          type="button"
          onClick={guardar}
          disabled={!sucio || !ftpOk || !umbralOk || guardando}
          style={{ ...buttonStyle, padding: '8px 16px', opacity: !sucio || !ftpOk || !umbralOk || guardando ? 0.5 : 1, cursor: !sucio || !ftpOk || !umbralOk ? 'default' : 'pointer' }}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  if (modo === 'tarjeta') {
    return (
      <div id="ajustes-bici" style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 12, letterSpacing: 0.2 }}>
          Bici y pulso · {resumen}
        </div>
        {cuerpo}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', padding: '8px 0', minHeight: 36, color: COLORS.textSecondary, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}
      >
        <Icon name="chevronDown" size={16} style={{ transform: abierto ? 'rotate(180deg)' : 'none' }} />
        Bici y pulso: {resumen}
      </button>
      {abierto && <div style={{ ...cardStyle, padding: 16, marginTop: 4 }}>{cuerpo}</div>}
    </div>
  )
}
