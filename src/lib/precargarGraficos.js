// Precarga el paquete de gráficos de Análisis (Recharts, ~100 KB gzip).
//
// StravaAnalysis carga los gráficos con React.lazy, pero solo se monta cuando ya
// han llegado los datos: el paquete se pedía DESPUÉS de esperar a la función, y
// durante unos segundos Forma y Carga semanal eran un cuadro vacío. Esto lo pide
// al abrir la pestaña Análisis, en paralelo con los datos. Solo ahí: las demás
// pestañas no descargan Recharts (regla de rendimiento del proyecto).
//
// Usa las mismas rutas que StravaAnalysis, así que es el mismo chunk: React.lazy
// lo encuentra ya descargado. Idempotente; si falla la red no pasa nada, lazy
// volverá a pedirlo al pintarse.

let pedido = false

export function precargarGraficos() {
  if (pedido) return
  pedido = true
  const reintentable = () => { pedido = false }
  import('../components/charts/FormaChart').catch(reintentable)
  import('../components/charts/TSSChart').catch(reintentable)
}
