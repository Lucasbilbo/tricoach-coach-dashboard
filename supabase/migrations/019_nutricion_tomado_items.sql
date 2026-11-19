-- 019_nutricion_tomado_items.sql — qué unidades se tomó el atleta (2026-11)
--
-- `sesion_nutricion.tomado_items` (jsonb): lista de claves de unidad del plan
-- que el atleta marcó como tomadas ("<producto_id>#0", "<producto_id>#1"…).
-- Los g/h tomados salen de ahí al pintar (lib/nutricion.js `tomadoEfectivo`).
-- ADITIVA: el código anterior no la toca. La fila no vacía (018) pasa a admitirla.
--
-- Rollback:
--   ALTER TABLE public.sesion_nutricion DROP COLUMN tomado_items;
--   (y volver a crear sesion_nutricion_no_vacia como en 018)

ALTER TABLE public.sesion_nutricion
  ADD COLUMN IF NOT EXISTS tomado_items jsonb
  CHECK (tomado_items IS NULL OR (jsonb_typeof(tomado_items) = 'array' AND jsonb_array_length(tomado_items) BETWEEN 1 AND 60));

ALTER TABLE public.sesion_nutricion DROP CONSTRAINT IF EXISTS sesion_nutricion_no_vacia;
ALTER TABLE public.sesion_nutricion
  ADD CONSTRAINT sesion_nutricion_no_vacia CHECK (
    carbohidratos_g_h IS NOT NULL OR liquido_ml_h IS NOT NULL OR sodio_mg_h IS NOT NULL
    OR productos IS NOT NULL
    OR char_length(coalesce(notas, '')) > 0
    OR tomado_carbohidratos_g_h IS NOT NULL OR tomado_liquido_ml_h IS NOT NULL OR estomago IS NOT NULL
    OR tomado_items IS NOT NULL
    OR char_length(coalesce(tomado_notas, '')) > 0
  );
