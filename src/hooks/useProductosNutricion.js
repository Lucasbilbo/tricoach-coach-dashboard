// Despensa de nutrición de un atleta (productosApi) con altas, ediciones y
// borrados que actualizan la lista al momento. `disponible` es false mientras
// carga o si la tabla no existe.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { actualizarProducto, borrarProducto, cargarProductos, crearProducto } from '../lib/productosApi'

export function useProductosNutricion(athleteId, activo = true) {
  const [estado, setEstado] = useState({ athleteId: null, productos: [], disponible: false })

  useEffect(() => {
    let vivo = true
    if (athleteId && activo) {
      cargarProductos(athleteId).then((r) => vivo && setEstado({ athleteId, ...r }))
    }
    return () => { vivo = false }
  }, [athleteId, activo])

  // Datos de OTRO atleta (o sin cargar): vacío hasta que lleguen los suyos
  const propio = estado.athleteId === athleteId
  const productos = useMemo(() => (propio ? estado.productos : []), [propio, estado.productos])
  const disponible = propio && estado.disponible

  const anadir = useCallback(async (campos) => {
    const orden = (productos.reduce((m, p) => Math.max(m, p.orden || 0), 0) || 0) + 1
    const nuevo = await crearProducto(athleteId, campos, orden)
    setEstado((e) => ({ ...e, productos: [...e.productos, nuevo] }))
    return nuevo
  }, [athleteId, productos])

  const editar = useCallback(async (id, campos) => {
    const p = await actualizarProducto(athleteId, id, campos)
    setEstado((e) => ({ ...e, productos: e.productos.map((x) => (x.id === id ? p : x)) }))
    return p
  }, [athleteId])

  const quitar = useCallback(async (id) => {
    await borrarProducto(athleteId, id)
    setEstado((e) => ({ ...e, productos: e.productos.filter((x) => x.id !== id) }))
  }, [athleteId])

  return { productos, disponible, anadir, editar, quitar }
}
