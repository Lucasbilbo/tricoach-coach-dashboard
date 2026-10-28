// AgendaAtleta — "Mi semana" en /home: la misma agenda que ve el coach, con las
// franjas del atleta y sus entrenos a su hora. El atleta puede mover sus
// sesiones (de hoy en adelante) con la hoja "Mover"; pasa por move-session,
// que también las mueve en el reloj, y el coach lo ve marcado.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { authHeaders } from '../lib/authHeaders'
import { formatDiaMes, hoyMadrid, lunesDeSemana, sumarDias } from '../lib/chartUtils'
import { COLORS, iconButtonStyle } from '../lib/theme'
import { useDisponibilidad } from '../hooks/useDisponibilidad'
import SemanaCalendario from './SemanaCalendario'
import Icon from './ui/Icon'
import Aviso from './ui/Aviso'
import { avisoEventoAntiguo } from '../lib/avisosReloj'

const ordenar = (a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.hora_inicio_min ?? -1) - (b.hora_inicio_min ?? -1))

export default function AgendaAtleta({ userId, onCambio }) {
  const [lunes, setLunes] = useState(() => lunesDeSemana(hoyMadrid()))
  const [carga, setCarga] = useState({ clave: null, sesiones: [], error: false })
  // Resultado del último movimiento que hay que contar: error (también al
  // arrastrar, que antes fallaba en silencio) o reloj con el entreno duplicado
  const [aviso, setAviso] = useState(null) // { texto, tono }
  const datos = useDisponibilidad(userId, true)
  const clave = `${userId}|${lunes}`

  useEffect(() => {
    if (!userId) return undefined
    let vivo = true
    supabase
      .from('coach_sessions')
      .select('*')
      .eq('athlete_id', userId)
      .gte('fecha', lunes)
      .lte('fecha', sumarDias(lunes, 6))
      .order('fecha', { ascending: true })
      .then(({ data, error: e }) => {
        if (vivo) setCarga({ clave: `${userId}|${lunes}`, sesiones: (data || []).sort(ordenar), error: !!e })
      })
    return () => { vivo = false }
  }, [userId, lunes])

  const sesiones = carga.clave === clave ? carga.sesiones : []
  const esActual = lunes === lunesDeSemana(hoyMadrid())

  async function mover(sesion, fecha, hora) {
    try {
      const res = await fetch('/.netlify/functions/move-session', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ sessionId: sesion.id, fecha, hora_inicio_min: hora }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = json.error || 'No se pudo mover el entreno'
        setAviso({ texto: msg, tono: 'error' })
        return { error: msg }
      }
      const textoReloj = avisoEventoAntiguo(json, sesion.fecha, 'atleta')
      setAviso(textoReloj ? { texto: textoReloj, tono: 'ambar' } : null)
      const fueraDeSemana = fecha < lunes || fecha > sumarDias(lunes, 6)
      setCarga((c) => ({
        ...c,
        sesiones: fueraDeSemana
          ? c.sesiones.filter((s) => s.id !== sesion.id)
          : c.sesiones.map((s) => (s.id === sesion.id ? { ...s, ...json.sesion } : s)).sort(ordenar),
      }))
      onCambio?.()
      return { ok: true }
    } catch {
      setAviso({ texto: 'Error de conexión moviendo el entreno', tono: 'error' })
      return { error: 'Error de conexión moviendo el entreno' }
    }
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{esActual ? 'Mi semana' : `Semana del ${formatDiaMes(lunes)}`}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: COLORS.textTertiary }}>Toca un entreno para moverlo de día u hora.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => setLunes((l) => sumarDias(l, -7))} style={iconButtonStyle} aria-label="Semana anterior">
            <Icon name="back" size={16} />
          </button>
          <button type="button" onClick={() => setLunes((l) => sumarDias(l, 7))} style={iconButtonStyle} aria-label="Semana siguiente">
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </div>
      {aviso && (
        <Aviso tono={aviso.tono} onCerrar={() => setAviso(null)} style={{ marginBottom: 10 }}>{aviso.texto}</Aviso>
      )}
      {carga.error && carga.clave === clave ? (
        <p style={{ color: COLORS.error, fontSize: 14 }}>No se pudo cargar la semana.</p>
      ) : (
        <SemanaCalendario lunes={lunes} datos={datos} sesiones={sesiones} onMover={mover} quien="atleta" />
      )}
    </section>
  )
}
