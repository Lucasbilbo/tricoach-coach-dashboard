// AdjuntoEntreno — el entreno "tal cual" (Hyrox / fuerza): texto pegado y/o
// capturas. AdjuntoEditor va en el creador (coach); AdjuntoVista en el detalle
// de la sesión (coach y atleta). Las capturas están en un bucket privado y se
// ven con URL firmada (1 h). Ver src/lib/adjuntos.js y la migración 014.
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BUCKET_ADJUNTOS, MAX_IMAGENES, MAX_TEXTO, rutaAdjunto } from '../lib/adjuntos'
import { COLORS, FONTS, inputStyle } from '../lib/theme'
import Icon from './ui/Icon'

const LADO_MAX = 1800 // px: una captura de móvil se lee bien y pesa ~300 KB

// URLs firmadas de varias rutas: { [ruta]: url }
function useUrlsFirmadas(rutas) {
  const clave = rutas.join('|')
  const [estado, setEstado] = useState({ clave: '', urls: {} })
  useEffect(() => {
    if (!clave) return undefined
    let vivo = true
    supabase.storage.from(BUCKET_ADJUNTOS).createSignedUrls(clave.split('|'), 3600)
      .then(({ data }) => {
        if (!vivo) return
        const urls = {}
        for (const d of data || []) if (d.signedUrl && d.path) urls[d.path] = d.signedUrl
        setEstado({ clave, urls })
      })
      .catch(() => vivo && setEstado({ clave, urls: {} }))
    return () => { vivo = false }
  }, [clave])
  return estado.clave === clave ? estado.urls : {}
}

// Reduce la imagen a JPEG de lado máximo LADO_MAX (las capturas de móvil
// llegan a 3–4 MB en PNG).
async function reducirImagen(file) {
  const bmp = await createImageBitmap(file)
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * escala)
  canvas.height = Math.round(bmp.height * escala)
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85))
}

function Visor({ url, onCerrar }) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Captura del entreno" onClick={onCerrar}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(5,6,9,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <img src={url} alt="Captura del entreno" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
      <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{ position: 'absolute', top: 14, right: 14, background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 10, color: COLORS.textPrimary, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}

function Miniaturas({ rutas, onQuitar }) {
  const urls = useUrlsFirmadas(rutas)
  const [abierta, setAbierta] = useState(null)
  if (rutas.length === 0) return null
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {rutas.map((r, i) => (
          <div key={r} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => urls[r] && setAbierta(urls[r])}
              aria-label={`Ver captura ${i + 1}`}
              style={{ width: 96, height: 128, padding: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${COLORS.cardBorder}`, background: COLORS.background, cursor: urls[r] ? 'zoom-in' : 'wait', display: 'block' }}
            >
              {urls[r]
                ? <img src={urls[r]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
                : <span style={{ fontSize: 11, color: COLORS.textTertiary }}>Cargando…</span>}
            </button>
            {onQuitar && (
              <button type="button" onClick={() => onQuitar(r)} aria-label={`Quitar captura ${i + 1}`}
                style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(11,13,18,0.85)', color: COLORS.textPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name="close" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      {abierta && <Visor url={abierta} onCerrar={() => setAbierta(null)} />}
    </>
  )
}

// Vista (detalle de la sesión): el texto tal cual y las capturas.
export function AdjuntoVista({ adjunto }) {
  if (!adjunto) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
      {adjunto.texto && (
        <pre style={{ margin: 0, padding: '10px 12px', borderRadius: 8, border: `1px solid ${COLORS.cardBorder}`, background: COLORS.background, color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {adjunto.texto}
        </pre>
      )}
      <Miniaturas rutas={adjunto.imagenes || []} />
    </div>
  )
}

// Editor (creador de entrenos): pegar texto, subir capturas o pegarlas (Ctrl+V).
export function AdjuntoEditor({ athleteId, valor, onChange }) {
  const texto = valor?.texto || ''
  const imagenes = valor?.imagenes || []
  const [subiendo, setSubiendo] = useState(0)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  async function subir(files) {
    const lista = [...files].filter((f) => f.type.startsWith('image/')).slice(0, MAX_IMAGENES - imagenes.length)
    if (lista.length === 0) return
    setError(null)
    setSubiendo((n) => n + lista.length)
    const nuevas = []
    for (const f of lista) {
      try {
        const blob = await reducirImagen(f)
        const ruta = rutaAdjunto(athleteId, crypto.randomUUID())
        const { error: e } = await supabase.storage.from(BUCKET_ADJUNTOS).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false })
        if (e) throw e
        nuevas.push(ruta)
      } catch {
        setError('No se pudo subir alguna captura. Inténtalo de nuevo.')
      } finally {
        setSubiendo((n) => n - 1)
      }
    }
    if (nuevas.length) onChange({ texto, imagenes: [...imagenes, ...nuevas] })
  }

  function alPegar(e) {
    const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter(Boolean)
    if (files.length) {
      e.preventDefault()
      subir(files)
    }
  }

  return (
    <div onPaste={alPegar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea
        value={texto}
        maxLength={MAX_TEXTO}
        onChange={(e) => onChange({ texto: e.target.value, imagenes })}
        rows={6}
        placeholder={'Pega aquí el entreno tal cual, p. ej.:\n1000 m SkiErg\n50 m Sled push\n80 m Burpee broad jump…'}
        style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: FONTS.mono, fontSize: 13, lineHeight: 1.5 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={imagenes.length >= MAX_IMAGENES}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 8, color: COLORS.textSecondary, padding: '8px 12px', fontSize: 13, cursor: 'pointer', fontFamily: FONTS.sans, opacity: imagenes.length >= MAX_IMAGENES ? 0.4 : 1 }}
        >
          <Icon name="plus" size={15} />
          Subir captura
        </button>
        <span style={{ fontSize: 12, color: COLORS.textTertiary }}>
          {subiendo > 0 ? `Subiendo ${subiendo}…` : 'o pégala aquí con Ctrl+V / ⌘V'}
        </span>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { subir(e.target.files); e.target.value = '' }} />
      </div>
      <Miniaturas rutas={imagenes} onQuitar={(r) => onChange({ texto, imagenes: imagenes.filter((x) => x !== r) })} />
      {error && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: COLORS.error }}>{error}</p>}
    </div>
  )
}
