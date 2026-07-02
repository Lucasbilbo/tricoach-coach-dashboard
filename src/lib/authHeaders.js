import { supabase } from './supabase'

// Cabeceras para llamar a las Netlify Functions autenticadas: el JWT de la
// sesión de Supabase es lo que identifica al usuario (sustituye al antiguo
// x-coach-secret, que iba en el bundle público y no autenticaba nada).
export async function authHeaders() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
