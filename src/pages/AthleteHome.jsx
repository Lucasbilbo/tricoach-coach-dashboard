import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COLORS, cardStyle } from '../lib/theme'
import { MESES_CORTOS, hoyMadrid } from '../lib/chartUtils'
import { buildIntervalsText } from '../lib/intervalsText'

const DISCIPLINE_COLORS = {
  swim: '#00D4FF',
  bike: '#00E5A0',
  run: '#FF4D6D',
  strength: '#7C3AED',
  other: '#94A3B8',
}

const DISCIPLINE_LABELS = {
  swim: 'Natación',
  bike: 'Ciclismo',
  run: 'Running',
  strength: 'Fuerza',
  other: 'Otro',
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// 'YYYY-MM-DD' → 'Lun 15 Jun'
function formatFechaLarga(fecha) {
  if (!fecha) return ''
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DIAS_CORTOS[date.getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}`
}

// Resumen del primer bloque repeat: "4x100mtr · 1:30/100m"
function resumeRepeat(workout_steps) {
  if (!Array.isArray(workout_steps)) return null
  const repeat = workout_steps.find((b) => b.tipo === 'repeat')
  if (!repeat) return null
  const paso = repeat.pasos?.[0]
  if (!paso) return `${repeat.repeticiones}x`
  const cant = paso.cantidad && paso.unidad ? `${paso.cantidad}${paso.unidad}` : ''
  const obj = paso.objetivo_valor ? ` · ${paso.objetivo_valor}` : ''
  return `${repeat.repeticiones}x${cant}${obj}`
}

const pageStyle = {
  minHeight: '100vh',
  background: COLORS.background,
  color: COLORS.textPrimary,
  fontFamily: "'Inter', sans-serif",
  padding: 24,
}

const sectionTitle = {
  fontSize: 16,
  fontWeight: 700,
  color: COLORS.textPrimary,
  margin: '0 0 14px',
}

const badgeDisciplina = (disciplina) => ({
  background: DISCIPLINE_COLORS[disciplina] || DISCIPLINE_COLORS.other,
  color: '#FFFFFF',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: 'nowrap',
})

const thStyle = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 12,
  fontWeight: 600,
  color: COLORS.textSecondary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
}

const tdStyle = {
  padding: '10px 12px',
  fontSize: 13,
  color: COLORS.textPrimary,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
}

export default function AthleteHome() {
  const [perfil, setPerfil] = useState(null)
  const [proximas, setProximas] = useState([])
  const [pasadas, setPasadas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [expandidas, setExpandidas] = useState({})

  useEffect(() => {
    let activo = true

    async function cargar() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData?.session?.user?.id
        if (!userId) return

        const hoy = hoyMadrid()

        const [perfilRes, proximasRes, pasadasRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('nombre, intervals_api_key, intervals_athlete_id')
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('coach_sessions')
            .select('*')
            .eq('athlete_id', userId)
            .gte('fecha', hoy)
            .order('fecha', { ascending: true })
            .limit(5),
          supabase
            .from('coach_sessions')
            .select('*')
            .eq('athlete_id', userId)
            .lt('fecha', hoy)
            .order('fecha', { ascending: false })
            .limit(10),
        ])

        if (!activo) return
        setPerfil(perfilRes.data)
        setProximas(proximasRes.data || [])
        setPasadas(pasadasRes.data || [])
      } finally {
        if (activo) setCargando(false)
      }
    }

    cargar()
    return () => { activo = false }
  }, [])

  function toggleDetalle(id) {
    setExpandidas((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (cargando) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: COLORS.textSecondary }}>Cargando…</p>
      </div>
    )
  }

  const intervalsOk = !!(perfil?.intervals_api_key && perfil?.intervals_athlete_id)

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
              Hola, <span style={{ color: COLORS.accent }}>{perfil?.nombre || 'atleta'}</span>
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
              {intervalsOk
                ? `✅ Intervals conectado · ${perfil.intervals_athlete_id}`
                : '❌ Intervals no configurado'}
            </p>
          </div>
          <Link
            to="/setup/intervals"
            style={{
              background: 'transparent',
              color: COLORS.textSecondary,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            ⚙ Configuración Intervals
          </Link>
        </header>

        {/* ── Próximos entrenamientos ───────────────────────────────────── */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={sectionTitle}>Próximos entrenamientos</h2>

          {proximas.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
              <p style={{ color: COLORS.textSecondary, margin: 0 }}>
                No hay entrenamientos programados
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proximas.map((sesion) => {
                const resumen = resumeRepeat(sesion.workout_steps)
                const detalle = buildIntervalsText({
                  disciplina: sesion.disciplina,
                  material: sesion.material || [],
                  bloques: sesion.workout_steps || [],
                  notas: sesion.notas,
                })

                return (
                  <div key={sesion.id} style={cardStyle}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                            marginBottom: 6,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
                            {formatFechaLarga(sesion.fecha)}
                          </span>
                          <span style={badgeDisciplina(sesion.disciplina)}>
                            {DISCIPLINE_LABELS[sesion.disciplina] || sesion.disciplina}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: sesion.enviado_a_garmin ? '#00E5A0' : COLORS.textSecondary,
                            }}
                          >
                            {sesion.enviado_a_garmin ? '✅ En tu Garmin' : '⏳ Pendiente'}
                          </span>
                        </div>

                        <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>
                          {sesion.descripcion || '—'}
                        </p>

                        {resumen && (
                          <p style={{ margin: '4px 0 0', fontSize: 13, color: COLORS.textSecondary }}>
                            {resumen}
                          </p>
                        )}

                        {sesion.notas && !expandidas[sesion.id] && (
                          <p
                            style={{
                              margin: '4px 0 0',
                              fontSize: 12,
                              color: COLORS.textSecondary,
                              fontStyle: 'italic',
                            }}
                          >
                            {sesion.notas}
                          </p>
                        )}
                      </div>

                      {sesion.workout_steps && (
                        <button
                          onClick={() => toggleDetalle(sesion.id)}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${COLORS.cardBorder}`,
                            borderRadius: 6,
                            color: COLORS.textSecondary,
                            padding: '5px 12px',
                            fontSize: 12,
                            cursor: 'pointer',
                            fontFamily: "'Inter', sans-serif",
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {expandidas[sesion.id] ? 'Cerrar' : 'Ver detalle'}
                        </button>
                      )}
                    </div>

                    {expandidas[sesion.id] && detalle && (
                      <pre
                        style={{
                          background: '#0A0F1E',
                          border: `1px solid ${COLORS.cardBorder}`,
                          borderRadius: 8,
                          padding: 12,
                          fontSize: 12,
                          color: COLORS.textSecondary,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'monospace',
                          marginTop: 12,
                          marginBottom: 0,
                        }}
                      >
                        {detalle}
                      </pre>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Entrenamientos pasados ────────────────────────────────────── */}
        <section style={{ marginBottom: 36 }}>
          <h2 style={sectionTitle}>Entrenamientos pasados</h2>

          {pasadas.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 32 }}>
              <p style={{ color: COLORS.textSecondary, margin: 0 }}>
                Sin historial de entrenamientos
              </p>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Fecha</th>
                    <th style={thStyle}>Disciplina</th>
                    <th style={thStyle}>Nombre</th>
                    <th style={thStyle}>Garmin</th>
                  </tr>
                </thead>
                <tbody>
                  {pasadas.map((sesion) => (
                    <tr key={sesion.id}>
                      <td style={tdStyle}>{formatFechaLarga(sesion.fecha)}</td>
                      <td style={tdStyle}>
                        <span style={badgeDisciplina(sesion.disciplina)}>
                          {DISCIPLINE_LABELS[sesion.disciplina] || sesion.disciplina}
                        </span>
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {sesion.descripcion || '—'}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: sesion.enviado_a_garmin ? '#00E5A0' : COLORS.textSecondary,
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        {sesion.enviado_a_garmin ? '✅' : '⏳'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Configuración ────────────────────────────────────────────── */}
        <section>
          <h2 style={sectionTitle}>Configuración</h2>
          {intervalsOk ? (
            <div
              style={{
                ...cardStyle,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 20 }}>✅</span>
              <span style={{ fontSize: 14, color: COLORS.textPrimary }}>
                Intervals conectado como{' '}
                <span style={{ fontWeight: 700, color: COLORS.accent }}>
                  {perfil.intervals_athlete_id}
                </span>
              </span>
            </div>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 28 }}>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: COLORS.textSecondary }}>
                Conecta Intervals.icu para recibir tus entrenamientos en el Garmin
              </p>
              <Link
                to="/setup/intervals"
                style={{
                  display: 'inline-block',
                  background: COLORS.accent,
                  color: COLORS.background,
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Configurar Intervals →
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
