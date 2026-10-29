import { COLORS, buttonStyle, cardStyle } from '../../lib/theme'

// Estado vacío del análisis cuando el atleta no tiene Strava conectado.
// Antes salía el error del backend en rojo ("El atleta no tiene Strava
// conectado"), como si algo se hubiera roto, cuando es un estado normal.
// Coach: explica qué falta. Atleta: además, el botón para conectarlo.
export default function SinStrava({ nombre, onConectar }) {
  const esAtleta = !!onConectar
  return (
    <div style={{ ...cardStyle, textAlign: 'center', padding: '32px 20px' }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: COLORS.textPrimary }}>
        {esAtleta ? 'Conecta Strava para ver tu análisis' : `${nombre || 'Este atleta'} aún no ha conectado Strava`}
      </p>
      <p style={{ margin: '8px auto 0', maxWidth: 420, fontSize: 13.5, lineHeight: 1.5, color: COLORS.textSecondary }}>
        {esAtleta
          ? 'Tu forma, el volumen por semana y tus actividades salen de Strava. Se conecta una vez y llegan solas.'
          : 'Su forma, el volumen por semana y sus actividades salen de Strava. Puede conectarlo desde su pantalla de inicio, en Conexiones. Las sesiones se pueden planificar igualmente.'}
      </p>
      {esAtleta && (
        <button
          onClick={onConectar}
          style={{ ...buttonStyle, background: '#FC4C02', borderColor: '#FC4C02', color: '#FFFFFF', marginTop: 18 }}
        >
          Conectar Strava
        </button>
      )}
    </div>
  )
}
