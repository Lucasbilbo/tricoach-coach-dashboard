// Vacía todas las cachés en memoria del cliente cuando cambia el usuario de la
// sesión (logout, o entrar con otra cuenta en la misma pestaña): los datos
// cacheados se autorizaron para el usuario anterior y no deben verse con otro.
import { supabase } from './supabase'

const limpiezas = new Set()
let uidActual // undefined hasta el primer evento (INITIAL_SESSION)

supabase.auth.onAuthStateChange((_evento, sesion) => {
  const uid = sesion?.user?.id ?? null
  if (uid === uidActual) return
  if (uidActual !== undefined) for (const limpiar of limpiezas) limpiar()
  uidActual = uid
})

export function registrarCache(limpiar) {
  limpiezas.add(limpiar)
}
