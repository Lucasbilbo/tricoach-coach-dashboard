import { COLORS, DISCIPLINE_COLORS, cardStyle } from '../lib/theme'

const SECCIONES = [
  {
    titulo: 'Running',
    color: DISCIPLINE_COLORS.run,
    grupo: 'running',
    sufijo: '/km',
    filas: [
      { clave: '1km', label: '1 km' },
      { clave: '5km', label: '5 km' },
      { clave: '10km', label: '10 km' },
      { clave: '21km', label: '21.1 km' },
      { clave: '42km', label: '42.2 km' },
    ],
  },
  {
    titulo: 'Ciclismo',
    color: DISCIPLINE_COLORS.bike,
    grupo: 'ciclismo',
    sufijo: 'km/h',
    filas: [
      { clave: '10km', label: '10 km' },
      { clave: '20km', label: '20 km' },
      { clave: '40km', label: '40 km' },
      { clave: '90km', label: '90 km' },
      { clave: '180km', label: '180 km' },
    ],
  },
  {
    titulo: 'Natación',
    color: DISCIPLINE_COLORS.swim,
    grupo: 'natacion',
    sufijo: '/100m',
    filas: [
      { clave: '100m', label: '100 m' },
      { clave: '400m', label: '400 m' },
      { clave: '1km', label: '1.000 m' },
      { clave: '1500m', label: '1.500 m' },
      { clave: '3800m', label: '3.800 m' },
    ],
  },
]

export default function PRsBlock({ records, weeks }) {
  if (!records) return null

  return (
    <div style={{ ...cardStyle, marginBottom: 24 }}>
      <p
        style={{
          color: COLORS.textSecondary,
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginTop: 0,
          marginBottom: 16,
          fontWeight: 600,
        }}
      >
        Mejores marcas · últimas {weeks} semanas
      </p>

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        {SECCIONES.map((seccion) => {
          const marcas = records[seccion.grupo] || {}
          return (
            <div key={seccion.grupo} style={{ flex: 1, minWidth: 180 }}>
              <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: seccion.color }}>
                {seccion.titulo}
              </p>
              {seccion.filas.map((fila) => {
                const valor = marcas[fila.clave]
                return (
                  <div
                    key={fila.clave}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      padding: '6px 0',
                      borderBottom: `1px solid ${COLORS.cardBorder}`,
                    }}
                  >
                    <span style={{ fontSize: 12, color: COLORS.textSecondary }}>{fila.label}</span>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: valor != null ? seccion.color : COLORS.textSecondary,
                      }}
                    >
                      {valor != null ? `${valor} ${seccion.sufijo}` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <p style={{ margin: '16px 0 0', fontSize: 12, color: COLORS.textSecondary }}>
        Calculado sobre actividades del período seleccionado
      </p>
    </div>
  )
}
