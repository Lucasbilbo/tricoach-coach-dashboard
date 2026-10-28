// SemanaCalendario — la semana como AGENDA: días en columnas, horas en el eje
// vertical, las franjas del atleta como fondo + carriles finos por disciplina, y
// cada sesión colocada A SU HORA (coach_sessions.hora_inicio_min). Las que no
// tienen hora van en la fila "sin hora" de arriba. La usan el coach (Sesiones)
// y el atleta (/home).
//
// Decisiones que NO hay que deshacer sin motivo (ver CLAUDE.md):
// - Carriles FIJOS natación · bici · carrera · fuerza: cada deporte siempre en
//   la misma vertical para escanear la semana. Finos (3 px) para dejar sitio a
//   las tarjetas; el fondo claro dice "aquí puede entrenar".
// - Ventana horaria calculada de los tramos y de las sesiones (ventanaAgenda).
// - Lo pasado se pierde: días pasados apagados y sus sesiones no se mueven. Hoy
//   solo a una hora que no ha llegado (reglas en lib/mover-reglas.cjs).
// - Escritorio: arrastrar para mover (ajusta a 30 min; mientras arrastras se
//   iluminan las franjas de esa disciplina y los totales cambian en vivo).
//   Móvil: un día cada vez con tira de días; tocar una sesión abre la hoja
//   "Mover" (arrastrar con el dedo en una rejilla tan pequeña es un suplicio).
import { useEffect, useState } from 'react'
import { COLORS, DISCIPLINE_COLORS, DISCIPLINE_LABELS, FONTS } from '../lib/theme'
import { DISCIPLINAS_DISPONIBILIDAD, evaluarDisponibilidad, formatHora, formatTramo, minutosPlanificados, resumenSemana } from '../lib/disponibilidad'
import { ahoraMadrid, ajustar, colocarDia, esMovible, sinHora, tituloSesion, validarMovimiento, ventanaAgenda } from '../lib/agenda'
import { useIsMobile } from '../hooks/useIsMobile'
import { duracionPrevista } from '../lib/tssPrevisto'
import HojaMover from './HojaMover'
import Icon from './ui/Icon'

const INICIAL_DIA = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const CORTO_DIA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
const NOMBRE_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const AMBAR = '#E8B84A'
const PX_ESCRITORIO = 0.5 // px por minuto (30 px/h)
const PX_MOVIL = 0.6 // 36 px/h
const ANCHO_HORAS = 32
const CARRIL = { swim: 3, bike: 7, run: 11, strength: 15 } // x de cada carril (3 px)
const MARGEN_TARJETA = 21 // las tarjetas empiezan tras los carriles
const RAYADO = 'repeating-linear-gradient(135deg, #1B202C 0 5px, transparent 5px 11px)'

const fmtDur = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
// Duración real o estimada (pasos por distancia) en minutos, para dibujar
const durMin = (s) => duracionPrevista(s)?.min ?? null

// Aviso corto para la tarjeta (el largo va en el title / la lista).
function avisoCorto(ev, disciplina) {
  if (!ev || ev.nivel !== 'aviso') return null
  if (ev.motivo === 'dia_libre') return 'día no disponible'
  if (ev.motivo === 'disciplina_no_disponible') return `sin ${DISCIPLINE_LABELS[disciplina]?.toLowerCase() || 'franja'}`
  if (ev.motivo === 'fuera_de_horas') return 'fuera de sus horas'
  if (ev.motivo === 'excede_minutos') return `su franja: ${ev.limite} min`
  return null
}

function marcas(min, max) {
  const paso = max - min <= 600 ? 60 : 120
  const res = []
  for (let h = Math.ceil(min / paso) * paso; h <= max; h += paso) res.push(h)
  return res
}

function Tarjeta({ sesion, top, height, left, right, aviso, movidaPor, estilo = 'normal', onClick, arrastrable, onDragStart, onDragEnd, compacta, capa = 0 }) {
  const color = DISCIPLINE_COLORS[sesion.disciplina] || COLORS.textTertiary
  const h = Number.isInteger(sesion.hora_inicio_min) ? formatHora(sesion.hora_inicio_min) : null
  // Estimada (va por distancia): "~1:05" y borde discontinuo
  const dp = duracionPrevista(sesion)
  const estimada = !!dp?.estimada
  const dur = dp ? `${estimada ? '~' : ''}${fmtDur(dp.min)}` : null
  const linea = aviso ? `⚠ ${aviso}` : [h, dur].filter(Boolean).join(' · ') || 'sin duración'
  const enUnaLinea = compacta || height < 32
  const fantasma = estilo === 'fantasma'
  const flotante = estilo === 'flotante'
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      draggable={arrastrable || undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${tituloSesion(sesion)}${h ? ` · ${h}` : ''}${dur ? ` · ${dur}${estimada ? ' (estimada)' : ''}` : ''}${aviso ? ` · ${aviso}` : ''}${movidaPor ? ` · movida por ${movidaPor}` : ''}`}
      style={{
        position: top == null ? 'relative' : 'absolute',
        ...(top == null ? {} : { top, height, left, right }),
        minHeight: top == null ? undefined : 18,
        boxSizing: 'border-box',
        padding: enUnaLinea ? '0 6px 0 9px' : '4px 6px 4px 9px',
        display: enUnaLinea ? 'flex' : 'block',
        alignItems: 'center',
        gap: 5,
        overflow: 'hidden',
        borderRadius: 7,
        background: fantasma ? 'transparent' : flotante ? '#1D2230' : '#181C26',
        border: fantasma ? '1px dashed #3A4256' : aviso ? `1px dashed ${AMBAR}` : flotante ? `1px solid ${color}8C` : estimada ? '1px dashed #343C4D' : '1px solid #232A38',
        boxShadow: fantasma ? 'none' : `inset 3px 0 0 ${color}${flotante ? ', 0 14px 30px rgba(0,0,0,0.55)' : capa ? ', -4px 0 10px rgba(0,0,0,0.45)' : ''}`,
        opacity: fantasma ? 0.7 : 1,
        zIndex: flotante ? 5 : 2 + capa,
        cursor: arrastrable ? 'grab' : onClick ? 'pointer' : 'default',
        textAlign: 'left',
      }}
    >
      {fantasma ? (
        <span style={{ fontFamily: FONTS.mono, fontSize: 10, color: COLORS.textTertiary }}>{h || 'antes'}</span>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: enUnaLinea ? '1 1 auto' : undefined }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
              {tituloSesion(sesion)}
            </span>
            {movidaPor && <Icon name="move" size={11} color={COLORS.accent} strokeWidth={2.4} style={{ marginLeft: 'auto' }} />}
          </div>
          <div style={{ fontFamily: FONTS.mono, fontSize: 10, color: aviso ? AMBAR : COLORS.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: enUnaLinea ? 0 : 1, flexShrink: enUnaLinea ? 0 : undefined }}>
            {enUnaLinea ? (aviso ? <Icon name="alert" size={12} color={AMBAR} /> : h || '') : linea}
          </div>
        </>
      )}
    </div>
  )
}

export default function SemanaCalendario({ lunes, datos, sesiones, onDia, onAbrir, onMover, quien = 'coach', nombreAtleta }) {
  const esMovil = useIsMobile()
  const [ahora, setAhora] = useState(() => ahoraMadrid())
  const [arrastre, setArrastre] = useState(null) // { id, desfase }
  const [destino, setDestino] = useState(null) // { fecha, hora }
  const [hoja, setHoja] = useState(null) // sesión en la hoja "Mover"
  const [diaMovil, setDiaMovil] = useState(null)

  // La línea de "ahora" y lo que ya ha pasado se refrescan cada minuto.
  useEffect(() => {
    const t = setInterval(() => setAhora(ahoraMadrid()), 60000)
    return () => clearInterval(t)
  }, [])

  const dias = resumenSemana(datos, lunes)
  if (dias.length === 0) return null

  const lista = sesiones || []
  const enArrastre = arrastre ? lista.find((s) => s.id === arrastre.id) : null
  // Vista con la sesión arrastrada ya en su destino: totales y avisos en vivo.
  const vista = enArrastre && destino
    ? lista.map((s) => (s.id === enArrastre.id ? { ...s, fecha: destino.fecha, hora_inicio_min: destino.hora } : s))
    : lista

  const [MIN, MAX] = ventanaAgenda(dias, vista)
  const px = esMovil ? PX_MOVIL : PX_ESCRITORIO
  const alto = (MAX - MIN) * px
  const y = (m) => (Math.min(Math.max(m, MIN), MAX) - MIN) * px
  const hayMover = !!onMover
  const movible = (s) => hayMover && esMovible(s.fecha, ahora)
  const nombreMovida = (s) => (quien === 'coach' && s.movida_por === 'atleta' ? nombreAtleta || 'el atleta' : null)
  const avisoDe = (s) => avisoCorto(evaluarDisponibilidad(datos, s.fecha, s.disciplina, durMin(s) ?? undefined, s.hora_inicio_min ?? undefined), s.disciplina)

  const abrir = (s) => {
    if (esMovil && movible(s)) setHoja(s)
    else if (onAbrir) onAbrir(s)
    else if (movible(s)) setHoja(s)
  }

  // ── Arrastrar (escritorio) ────────────────────────────────────────────────
  const minutoEn = (e, desfase = 0) => {
    const r = e.currentTarget.getBoundingClientRect()
    return ajustar(MIN + (e.clientY - r.top) / px - desfase)
  }
  const empezar = (s) => (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const desfase = Number.isInteger(s.hora_inicio_min) ? (e.clientY - r.top) / px : 0
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', s.id)
    // Diferido: así el navegador captura la imagen de arrastre con la tarjeta normal
    setTimeout(() => setArrastre({ id: s.id, desfase }), 0)
  }
  const terminar = () => { setArrastre(null); setDestino(null) }
  const sobre = (fecha) => (e) => {
    if (!enArrastre) return
    const hora = minutoEn(e, arrastre.desfase)
    const ok = validarMovimiento({ origen: { fecha: enArrastre.fecha, hora: enArrastre.hora_inicio_min ?? null }, destino: { fecha, hora }, ahora })
    if (!ok.ok && ok.code !== 'SIN_CAMBIOS') return // sin preventDefault = no se puede soltar aquí
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!destino || destino.fecha !== fecha || destino.hora !== hora) setDestino({ fecha, hora })
  }
  const soltar = (fecha) => async (e) => {
    e.preventDefault()
    const s = enArrastre
    const hora = minutoEn(e, arrastre?.desfase || 0)
    terminar()
    if (!s) return
    const ok = validarMovimiento({ origen: { fecha: s.fecha, hora: s.hora_inicio_min ?? null }, destino: { fecha, hora }, ahora })
    if (ok.ok) await onMover(s, fecha, hora)
  }

  // Click en hueco de un día planificable (coach): nueva sesión a esa hora.
  const planificar = (dia) => (e) => {
    if (!onDia) return
    // La media hora en la que has pulsado (hacia abajo, no la más cercana: un
    // clic a las 15:20 en un tramo que acaba a las 15:30 es 15:00, no 15:30).
    const r = e.currentTarget.getBoundingClientRect()
    const hora = Math.min(Math.max(Math.floor((MIN + (e.clientY - r.top) / px) / 30) * 30, 0), 1410)
    onDia(dia.fecha, dia.fecha === ahora.fecha && hora < ahora.min ? null : hora)
  }

  const infoDia = (dia) => {
    const delDia = vista.filter((s) => s.fecha === dia.fecha)
    const { minutos, sinDuracion, estimadas } = minutosPlanificados(delDia)
    const libre = dia.origen === 'dia_libre'
    const conTramos = DISCIPLINAS_DISPONIBILIDAD.filter((d) => dia.disciplinas[d])
    const sinActividad = libre || (dia.origen !== 'sin_datos' && conTramos.length === 0)
    const pasado = dia.fecha < ahora.fecha
    const choca = delDia.some((s) => avisoDe(s))
    return { delDia, minutos, sinDuracion, estimadas, libre, sinActividad, pasado, choca, esHoy: dia.fecha === ahora.fecha, pulsable: !!onDia && !pasado && !sinActividad }
  }

  const totalTexto = (inf) => {
    if (inf.delDia.length === 0) return ''
    if (inf.minutos > 0) return (inf.estimadas ? '~' : '') + fmtDur(inf.minutos) + (inf.sinDuracion ? ` +${inf.sinDuracion}` : '')
    return 'sin hora'
  }

  // ── Columna de un día (rejilla horaria) ───────────────────────────────────
  function columna(dia, i, inf, ancha) {
    const resaltar = enArrastre && !inf.pasado ? (dia.disciplinas[enArrastre.disciplina] || []) : []
    const tramos = DISCIPLINAS_DISPONIBILIDAD.flatMap((d) => (dia.disciplinas[d] || []).map((t) => ({ ...t, d })))
    const bloques = colocarDia(lista.filter((s) => s.fecha === dia.fecha))
    const ahoraY = inf.esHoy && ahora.min >= MIN && ahora.min <= MAX ? y(ahora.min) : null
    return (
      <div
        onDragOver={hayMover && !esMovil ? sobre(dia.fecha) : undefined}
        onDrop={hayMover && !esMovil ? soltar(dia.fecha) : undefined}
        onClick={inf.pulsable && !arrastre ? planificar(dia) : undefined}
        title={dia.nota || (inf.pulsable ? `Pulsa en una hora para planificar el ${NOMBRE_DIA[i]}` : undefined)}
        style={{
          position: 'relative', height: alto, borderLeft: ancha ? 'none' : `1px solid ${COLORS.cardBorder}`,
          background: inf.libre ? RAYADO : inf.esHoy ? 'rgba(47,191,175,0.035)' : 'transparent',
          cursor: inf.pulsable ? 'copy' : 'default',
        }}
      >
        {/* rejilla */}
        {!inf.libre && marcas(MIN, MAX).map((m) => (
          <span key={m} style={{ position: 'absolute', left: 0, right: 0, top: y(m), height: 1, background: 'rgba(255,255,255,0.07)' }} />
        ))}
        {/* horas libres: fondo claro (unión de franjas) */}
        {tramos.map((t) => (
          <span key={`f${t.d}${t.inicio_min}`} style={{ position: 'absolute', left: 0, right: 0, top: y(t.inicio_min), height: y(t.fin_min) - y(t.inicio_min), background: 'rgba(237,238,242,0.055)' }} />
        ))}
        {/* mientras arrastras: dónde cabe esa disciplina */}
        {resaltar.map((t) => {
          const c = DISCIPLINE_COLORS[enArrastre.disciplina]
          return <span key={`r${t.inicio_min}`} style={{ position: 'absolute', left: 1, right: 1, top: y(t.inicio_min), height: y(t.fin_min) - y(t.inicio_min), background: `${c}25`, boxShadow: `inset 0 0 0 1px ${c}55`, borderRadius: 5 }} />
        })}
        {/* carriles fijos */}
        {tramos.map((t) => (
          <span
            key={`c${t.d}${t.inicio_min}`}
            title={`${DISCIPLINE_LABELS[t.d]}: ${formatTramo(t)}`}
            style={{ position: 'absolute', left: CARRIL[t.d], width: 3, top: y(t.inicio_min), height: Math.max(y(t.fin_min) - y(t.inicio_min), 3), borderRadius: 2, background: DISCIPLINE_COLORS[t.d], opacity: enArrastre && enArrastre.disciplina !== t.d ? 0.35 : 1 }}
          />
        ))}
        {inf.libre && (
          <div style={{ position: 'absolute', left: 6, right: 6, top: 8, background: COLORS.card, border: `1px solid ${COLORS.restBorder}`, borderRadius: 7, padding: '6px 8px' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600 }}>No disponible</div>
            {dia.nota && <div style={{ fontSize: 10.5, color: COLORS.textSecondary, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dia.nota}</div>}
          </div>
        )}
        {/* sesiones a su hora */}
        {bloques.map((b) => {
          const s = b.sesion
          const esLaArrastrada = enArrastre && s.id === enArrastre.id
          // Solapes en cascada (no a partes iguales): en una columna de ~150 px
          // repartir el ancho deja tarjetas ilegibles.
          return (
            <Tarjeta
              key={s.id}
              sesion={s}
              top={y(b.inicio)}
              height={Math.max(y(b.fin) - y(b.inicio), 18)}
              left={MARGEN_TARJETA + b.col * 14}
              right={3}
              capa={b.col}
              aviso={avisoDe(s)}
              movidaPor={nombreMovida(s)}
              estilo={esLaArrastrada && destino ? 'fantasma' : 'normal'}
              onClick={() => abrir(s)}
              arrastrable={!esMovil && movible(s)}
              onDragStart={empezar(s)}
              onDragEnd={terminar}
            />
          )
        })}
        {/* vista previa en el destino (elemento aparte: la original no se desmonta mientras arrastras) */}
        {enArrastre && destino && destino.fecha === dia.fecha && destino.hora != null && (
          <Tarjeta
            sesion={{ ...enArrastre, fecha: destino.fecha, hora_inicio_min: destino.hora }}
            top={y(destino.hora)}
            height={Math.max(y(destino.hora + (durMin(enArrastre) || 60)) - y(destino.hora), 18)}
            left={MARGEN_TARJETA - 3}
            right={1}
            aviso={avisoDe({ ...enArrastre, fecha: destino.fecha, hora_inicio_min: destino.hora })}
            estilo="flotante"
          />
        )}
        {enArrastre && destino && destino.fecha === dia.fecha && destino.hora != null && (
          <span style={{ position: 'absolute', zIndex: 6, left: MARGEN_TARJETA, top: Math.min(y(destino.hora + (durMin(enArrastre) || 60)) + 4, alto - 18), padding: '1px 6px', borderRadius: 5, background: COLORS.accent, color: COLORS.background, fontFamily: FONTS.mono, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            {formatHora(destino.hora)}{durMin(enArrastre) ? ` – ${duracionPrevista(enArrastre).estimada ? '~' : ''}${formatHora(destino.hora + durMin(enArrastre))}` : ''}
          </span>
        )}
        {/* ahora */}
        {ahoraY != null && (
          <>
            <span style={{ position: 'absolute', left: 0, right: 0, top: ahoraY, height: 2, background: COLORS.accent, zIndex: 4, pointerEvents: 'none' }} />
            <span style={{ position: 'absolute', left: -4, top: ahoraY - 3.5, width: 9, height: 9, borderRadius: '50%', background: COLORS.accent, zIndex: 4, pointerEvents: 'none' }} />
          </>
        )}
        {/* lo pasado, apagado */}
        {(inf.pasado || inf.esHoy) && hayMover && enArrastre && (
          <span style={{ position: 'absolute', left: 0, right: 0, top: 0, height: inf.pasado ? alto : ahoraY ?? 0, background: 'rgba(11,13,18,0.6)', zIndex: 3, pointerEvents: 'none' }} />
        )}
      </div>
    )
  }

  function ejeHoras() {
    return (
      <div style={{ position: 'relative', height: alto, fontFamily: FONTS.mono, fontSize: 9.5, color: COLORS.textTertiary }}>
        {marcas(MIN, MAX).map((m) => (
          <span key={m} style={{ position: 'absolute', right: 6, top: y(m), transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>{esMovil ? formatHora(m) : m / 60}</span>
        ))}
      </div>
    )
  }

  const infos = dias.map((d) => infoDia(d))
  const haySinHora = vista.some((s) => !Number.isInteger(s.hora_inicio_min) && dias.some((d) => d.fecha === s.fecha))

  const hojaMover = hoja && (
    <HojaMover
      sesion={hoja}
      titulo={tituloSesion(hoja)}
      datos={datos}
      ahora={ahora}
      onMover={onMover}
      onCerrar={() => setHoja(null)}
      onEditar={onAbrir ? () => { const s = hoja; setHoja(null); onAbrir(s) } : undefined}
    />
  )

  // ── Móvil: un día cada vez ────────────────────────────────────────────────
  if (esMovil) {
    const porDefecto = Math.max(0, dias.findIndex((d) => d.fecha === ahora.fecha))
    const sel = diaMovil != null && diaMovil < 7 ? diaMovil : porDefecto
    const dia = dias[sel]
    const inf = infos[sel]
    const sueltas = sinHora(inf.delDia)
    return (
      <div style={{ marginBottom: 14 }}>
        <div role="tablist" aria-label="Día" style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
          {dias.map((d, i) => {
            const n = infos[i]
            const activo = i === sel
            return (
              <button
                key={d.fecha}
                type="button"
                role="tab"
                aria-selected={activo}
                aria-label={`${NOMBRE_DIA[i]} ${Number(d.fecha.slice(8))}`}
                onClick={() => setDiaMovil(i)}
                style={{
                  position: 'relative', flex: 1, minWidth: 0, padding: '7px 0 6px', borderRadius: 11, cursor: 'pointer',
                  border: `1px solid ${activo ? COLORS.accent : COLORS.cardBorder}`,
                  background: activo ? 'rgba(47,191,175,0.08)' : COLORS.card,
                  color: COLORS.textPrimary, opacity: n.pasado && !activo ? 0.55 : 1,
                  backgroundImage: n.libre && !activo ? RAYADO : undefined,
                }}
              >
                {n.choca && <span style={{ position: 'absolute', top: 5, right: 6, width: 5, height: 5, borderRadius: '50%', background: AMBAR }} />}
                <div style={{ fontSize: 10.5, fontWeight: 600, color: activo || n.esHoy ? COLORS.accent : COLORS.textSecondary }}>{INICIAL_DIA[i]}</div>
                <div style={{ fontFamily: FONTS.mono, fontSize: 15, fontWeight: 600, color: activo ? COLORS.accent : COLORS.textPrimary }}>{Number(d.fecha.slice(8))}</div>
                <div style={{ fontFamily: FONTS.mono, fontSize: 9, color: n.choca ? AMBAR : COLORS.textTertiary, minHeight: 11 }}>{n.minutos > 0 ? fmtDur(n.minutos) : n.delDia.length ? '·' : ''}</div>
              </button>
            )
          })}
        </div>

        {sueltas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: COLORS.textTertiary }}>Sin hora</span>
            {sueltas.map((s) => (
              <Tarjeta key={s.id} sesion={s} aviso={avisoDe(s)} movidaPor={nombreMovida(s)} onClick={() => abrir(s)} compacta />
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: `${ANCHO_HORAS}px minmax(0, 1fr)`, background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12, padding: '10px 8px 10px 0', opacity: inf.pasado ? 0.6 : 1 }}>
          {ejeHoras()}
          {columna(dia, sel, inf, true)}
        </div>
        {inf.pulsable && (
          <p style={{ margin: '6px 0 0', fontSize: 11.5, color: COLORS.textTertiary }}>Toca una hora libre para planificar.</p>
        )}
        {hojaMover}
      </div>
    )
  }

  // ── Escritorio: la semana entera ──────────────────────────────────────────
  const cols = `${ANCHO_HORAS}px repeat(7, minmax(0, 1fr))`
  return (
    <div style={{ marginBottom: 14, background: COLORS.card, border: `1px solid ${COLORS.cardBorder}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${COLORS.cardBorder}` }}>
        <div />
        {dias.map((d, i) => {
          const n = infos[i]
          const Cab = n.pulsable ? 'button' : 'div'
          return (
            <Cab
              key={d.fecha}
              {...(n.pulsable ? { type: 'button', onClick: () => onDia(d.fecha, null), 'aria-label': `Planificar entreno el ${NOMBRE_DIA[i]} ${Number(d.fecha.slice(8))}` } : {})}
              style={{
                padding: '8px 8px 7px', textAlign: 'left', border: 'none', borderLeft: `1px solid ${COLORS.cardBorder}`,
                background: n.esHoy ? 'rgba(47,191,175,0.06)' : 'transparent', cursor: n.pulsable ? 'pointer' : 'default',
                color: COLORS.textPrimary, fontFamily: FONTS.sans, minWidth: 0,
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: '0.08em', fontWeight: 700, color: n.esHoy ? COLORS.accent : COLORS.textSecondary }}>
                {CORTO_DIA[i]}{n.esHoy ? ' · HOY' : ''}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 1 }}>
                <span style={{ fontFamily: FONTS.mono, fontSize: 17, fontWeight: 600, color: n.esHoy ? COLORS.accent : n.pasado ? COLORS.textSecondary : COLORS.textPrimary }}>{Number(d.fecha.slice(8))}</span>
                <span style={{ fontFamily: FONTS.mono, fontSize: 11, color: n.choca ? AMBAR : COLORS.textTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {totalTexto(n)}{n.choca ? ' !' : ''}
                </span>
              </div>
            </Cab>
          )
        })}
      </div>

      {haySinHora && (
        <div style={{ display: 'grid', gridTemplateColumns: cols, borderBottom: `1px solid ${COLORS.cardBorder}` }}>
          <div style={{ fontSize: 9.5, color: COLORS.textTertiary, padding: '8px 0 0 6px', lineHeight: 1.2 }}>sin<br />hora</div>
          {dias.map((d, i) => (
            <div key={d.fecha} style={{ borderLeft: `1px solid ${COLORS.cardBorder}`, padding: 5, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, opacity: infos[i].pasado ? 0.6 : 1 }}>
              {sinHora(infos[i].delDia).map((s) => (
                <Tarjeta key={s.id} sesion={s} aviso={avisoDe(s)} movidaPor={nombreMovida(s)} onClick={() => abrir(s)} compacta
                  arrastrable={movible(s)} onDragStart={empezar(s)} onDragEnd={terminar} />
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: cols, padding: '8px 0' }}>
        {ejeHoras()}
        {dias.map((d, i) => (
          <div key={d.fecha} style={{ opacity: infos[i].pasado && !enArrastre ? 0.6 : 1, minWidth: 0 }}>
            {columna(d, i, infos[i], false)}
          </div>
        ))}
      </div>
      {hojaMover}
    </div>
  )
}
