import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { COLORS, inputStyle } from '../../lib/theme'
import { parsearEntreno } from './parser'
import { sectionLabel, miniBtn } from './styles'

const linkStyle = { marginTop: 6, background: 'transparent', border: 'none', padding: 0, color: COLORS.textSecondary, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: "'Archivo', sans-serif" }

// Atajos del WorkoutBuilder para que el coach prescriba rápido:
//  1) Escritura rápida: una línea → bloques (parser.js).
//  2) Plantillas: cargar/guardar sesiones típicas (tabla coach_plantillas, RLS
//     por coach). Si la tabla no existe todavía, la sección no se muestra.
export default function AtajosBuilder({ disciplina, bloques, nombre, piscina, onBloques }) {
  const [linea, setLinea] = useState('')
  const [errores, setErrores] = useState([])
  const [plantillas, setPlantillas] = useState(null) // null = no disponible
  const [guardandoComo, setGuardandoComo] = useState(false)
  const [nombrePlantilla, setNombrePlantilla] = useState('')
  const [aviso, setAviso] = useState('')
  // La chuleta de la sintaxis, plegada: se abre a mano o si hay un error
  const [ayuda, setAyuda] = useState(false)

  useEffect(() => {
    let activo = true
    supabase
      .from('coach_plantillas')
      .select('id, nombre, disciplina, workout_steps')
      .order('nombre', { ascending: true })
      .then(({ data, error }) => {
        if (activo) setPlantillas(error ? null : data || [])
      })
    return () => {
      activo = false
    }
  }, [])

  function generar() {
    const r = parsearEntreno(linea, disciplina)
    setErrores(r.errores)
    if (r.bloques.length > 0 && r.errores.length === 0) {
      onBloques(r.bloques, null)
      setAviso(`${r.bloques.length} bloque${r.bloques.length === 1 ? '' : 's'} generado${r.bloques.length === 1 ? '' : 's'}`)
    }
  }

  function cargarPlantilla(id) {
    const p = (plantillas || []).find((x) => x.id === id)
    if (!p) return
    onBloques(p.workout_steps?.bloques || [], p.nombre)
    setAviso(`Plantilla "${p.nombre}" cargada`)
  }

  async function guardarPlantilla() {
    const n = nombrePlantilla.trim() || nombre?.trim()
    if (!n) {
      setAviso('Ponle un nombre a la plantilla')
      return
    }
    const fila = {
      nombre: n.slice(0, 80),
      disciplina,
      workout_steps: { bloques, ...(disciplina === 'swim' ? { piscina } : {}) },
    }
    const { data, error } = await supabase
      .from('coach_plantillas')
      .upsert(fila, { onConflict: 'coach_id,disciplina,nombre' })
      .select('id, nombre, disciplina, workout_steps')
      .single()
    if (error) {
      setAviso('No se pudo guardar la plantilla')
      return
    }
    setPlantillas((prev) => [...(prev || []).filter((x) => x.id !== data.id), data].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')))
    setGuardandoComo(false)
    setNombrePlantilla('')
    setAviso(`Guardada como plantilla "${data.nombre}"`)
  }

  const propias = (plantillas || []).filter((p) => p.disciplina === disciplina)

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={sectionLabel}>Escritura rápida</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={linea}
          onChange={(e) => setLinea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              generar()
            }
          }}
          placeholder={disciplina === 'swim' ? 'cal 400 + 8x100 1:45 rec 20" + 200 suave' : "15' Z1 + 8x(1' Z5 / 1' Z1) + 10' Z1"}
          style={{ ...inputStyle, flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
        />
        <button type="button" onClick={generar} style={{ ...miniBtn, padding: '0 12px', color: COLORS.accent, borderColor: COLORS.accent }}>
          Generar
        </button>
      </div>
      {ayuda || errores.length > 0 ? (
        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: COLORS.textTertiary, lineHeight: 1.5 }}>
          ' minutos · " segundos · m/km distancia (en natación, un número suelto son metros) · Z1–Z5 · ritmo 4:50-5:10 · series: 8x100m 1:45 rec 20" o Nx( … / … ). Reemplaza los bloques.
        </p>
      ) : (
        <button type="button" onClick={() => setAyuda(true)} style={linkStyle}>
          Cómo se escribe
        </button>
      )}
      {errores.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: COLORS.error, fontSize: 12 }}>
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {/* Plantillas: el selector solo si hay alguna de esta disciplina; guardar,
          solo cuando ya hay bloques (antes eran dos controles siempre a la vista,
          con un "Aún no hay plantillas" deshabilitado). */}
      {plantillas !== null && (propias.length > 0 || bloques.length > 0) && (
        <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {propias.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && cargarPlantilla(e.target.value)}
              aria-label="Cargar plantilla"
              style={{ ...inputStyle, flex: '1 1 180px', width: 'auto' }}
            >
              <option value="">Cargar plantilla…</option>
              {propias.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          )}
          {!guardandoComo && bloques.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setNombrePlantilla(nombre || '')
                setGuardandoComo(true)
              }}
              style={linkStyle}
            >
              Guardar como plantilla
            </button>
          )}
        </div>
      )}
      {guardandoComo && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={nombrePlantilla}
            onChange={(e) => setNombrePlantilla(e.target.value)}
            placeholder="Nombre de la plantilla"
            maxLength={80}
            autoFocus
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={guardarPlantilla} style={{ ...miniBtn, padding: '0 10px', color: COLORS.accent, borderColor: COLORS.accent }}>
            Guardar
          </button>
          <button type="button" onClick={() => setGuardandoComo(false)} aria-label="Cancelar" style={{ ...miniBtn, padding: '0 10px' }}>
            ×
          </button>
        </div>
      )}

      {aviso && <p style={{ margin: '8px 0 0', fontSize: 12, color: COLORS.accent }}>{aviso}</p>}
    </div>
  )
}
