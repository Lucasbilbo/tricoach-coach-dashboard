// Hook de resolución SOLO para tests: el código de src/ importa sin extensión
// ('./chartUtils'), como permite Vite. Node no lo resuelve; aquí se prueba con
// '.js' antes de fallar. No afecta al build.
import { register } from 'node:module'

register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?jsx?$/.test(specifier)) {
      return next(specifier + '.js', context)
    }
    throw err
  }
}`),
  import.meta.url
)
