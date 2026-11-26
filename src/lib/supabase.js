// Cliente de Supabase «a medida» (2026-11-26): solo lo que usa la app —auth,
// tablas (from/rpc) y, bajo demanda, storage— montado con los mismos paquetes
// que usa @supabase/supabase-js por dentro y con su misma configuración
// (clave de sesión `sb-<ref>-auth-token`, auto-refresh, sesión persistente,
// flujo implícito). Así no entra en el bundle de arranque realtime (websocket),
// functions ni el storage: ~20 KB gzip menos en cada carga.
// Ojo al actualizar @supabase/*: auth-js, postgrest-js y storage-js van a la
// misma versión que supabase-js (se fijan en package.json).
import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son obligatorias'
  )
}

const base = new URL(supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`)

const auth = new AuthClient({
  url: new URL('auth/v1', base).href,
  headers: { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey },
  // La misma clave que supabase-js: las sesiones ya abiertas siguen valiendo
  storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  flowType: 'implicit',
})

// fetch con el JWT de la sesión (o la anon key si no hay), como supabase-js
async function fetchConSesion(input, init) {
  const { data } = await auth.getSession()
  const token = data.session?.access_token ?? supabaseAnonKey
  const headers = new Headers(init?.headers)
  if (!headers.has('apikey')) headers.set('apikey', supabaseAnonKey)
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

const rest = new PostgrestClient(new URL('rest/v1', base).href, {
  headers: {},
  schema: 'public',
  fetch: fetchConSesion,
})

let storageP = null
// Storage solo se descarga si se usa (capturas de entrenos de fuerza)
export function storageDe() {
  storageP =
    storageP ||
    import('@supabase/storage-js').then(
      ({ StorageClient }) => new StorageClient(new URL('storage/v1', base).href, {}, fetchConSesion)
    )
  return storageP
}

export const supabase = {
  auth,
  from: (tabla) => rest.from(tabla),
  rpc: (fn, args, opciones) => rest.rpc(fn, args, opciones),
}
