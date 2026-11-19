-- 018_productos_nutricion.sql — despensa de nutrición por atleta (2026-11)
-- PENDIENTE de aplicar en producción (SQL Editor). Aditiva y reversible.
--
-- 1) Tabla `atleta_productos_nutricion`: los productos que TIENE cada atleta
--    (gel 30 g, gel 45 g con cafeína, guayaba, bidón de 750 ml…). Los editan el
--    atleta y su coach vinculado (mismo patrón de acceso que sesion_nutricion).
-- 2) `sesion_nutricion.productos` (jsonb): lo que lleva la sesión, como lista de
--    { producto_id, nombre, tipo, cantidad, carbohidratos_g, cafeina_mg,
--      sodio_mg, volumen_ml } (valores POR UNIDAD, copiados del producto: si
--    luego se edita el catálogo, los planes ya hechos no cambian). Los g/h salen
--    de dividir por la duración al pintar; las columnas *_g_h antiguas se
--    mantienen para los planes ya guardados.
-- 3) La restricción "la fila no puede estar vacía" se amplía para admitir una
--    fila que solo tiene productos.
-- 4) Semilla: los productos de Lucas (solo si no tiene ninguno).
--
-- Para deshacer:
--   DROP TABLE public.atleta_productos_nutricion;
--   ALTER TABLE public.sesion_nutricion DROP COLUMN productos;
--   (y volver a crear la restricción de 017 sin `productos`)

BEGIN;

CREATE TABLE IF NOT EXISTS public.atleta_productos_nutricion (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nombre          text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 60),
  tipo            text NOT NULL CHECK (tipo IN ('gel', 'solido', 'bidon')),
  carbohidratos_g smallint NOT NULL DEFAULT 0 CHECK (carbohidratos_g BETWEEN 0 AND 200),
  cafeina_mg      smallint NOT NULL DEFAULT 0 CHECK (cafeina_mg BETWEEN 0 AND 400),
  sodio_mg        smallint NOT NULL DEFAULT 0 CHECK (sodio_mg BETWEEN 0 AND 3000),
  volumen_ml      smallint NOT NULL DEFAULT 0 CHECK (volumen_ml BETWEEN 0 AND 2000),
  orden           smallint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS atleta_productos_nutricion_athlete_idx ON public.atleta_productos_nutricion (athlete_id);

ALTER TABLE public.atleta_productos_nutricion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver productos nutricion" ON public.atleta_productos_nutricion;
CREATE POLICY "ver productos nutricion" ON public.atleta_productos_nutricion
  FOR SELECT TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_productos_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "crear productos nutricion" ON public.atleta_productos_nutricion;
CREATE POLICY "crear productos nutricion" ON public.atleta_productos_nutricion
  FOR INSERT TO authenticated
  WITH CHECK (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_productos_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "editar productos nutricion" ON public.atleta_productos_nutricion;
CREATE POLICY "editar productos nutricion" ON public.atleta_productos_nutricion
  FOR UPDATE TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_productos_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  )
  WITH CHECK (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_productos_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "borrar productos nutricion" ON public.atleta_productos_nutricion;
CREATE POLICY "borrar productos nutricion" ON public.atleta_productos_nutricion
  FOR DELETE TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_productos_nutricion.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

REVOKE ALL ON public.atleta_productos_nutricion FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.atleta_productos_nutricion TO authenticated;

-- Lo que lleva cada sesión
ALTER TABLE public.sesion_nutricion
  ADD COLUMN IF NOT EXISTS productos jsonb
  CHECK (productos IS NULL OR (jsonb_typeof(productos) = 'array' AND jsonb_array_length(productos) BETWEEN 1 AND 30));

-- La restricción de fila no vacía (la de 017, con nombre automático) se
-- sustituye por otra que también admite una fila con solo productos.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.sesion_nutricion'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%sodio_mg_h IS NOT NULL%'
      AND pg_get_constraintdef(oid) LIKE '%tomado_notas%'
  LOOP
    EXECUTE format('ALTER TABLE public.sesion_nutricion DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.sesion_nutricion DROP CONSTRAINT IF EXISTS sesion_nutricion_no_vacia;
ALTER TABLE public.sesion_nutricion
  ADD CONSTRAINT sesion_nutricion_no_vacia CHECK (
    carbohidratos_g_h IS NOT NULL OR liquido_ml_h IS NOT NULL OR sodio_mg_h IS NOT NULL
    OR productos IS NOT NULL
    OR char_length(coalesce(notas, '')) > 0
    OR tomado_carbohidratos_g_h IS NOT NULL OR tomado_liquido_ml_h IS NOT NULL OR estomago IS NOT NULL
    OR char_length(coalesce(tomado_notas, '')) > 0
  );

-- Semilla: lo que tiene Lucas (solo si aún no tiene productos). Las cifras
-- salen de lo que él dijo; la guayaba ("unos 20 g") se puede corregir en la app.
INSERT INTO public.atleta_productos_nutricion (athlete_id, nombre, tipo, carbohidratos_g, cafeina_mg, volumen_ml, orden)
SELECT p.id, v.nombre, v.tipo, v.carbohidratos_g, v.cafeina_mg, v.volumen_ml, v.orden
FROM public.profiles p
CROSS JOIN (VALUES
  ('Guayaba',                   'solido', 20,   0,   0, 1),
  ('Gel 30 g',                  'gel',    30,   0,   0, 2),
  ('Gel 45 g',                  'gel',    45,   0,   0, 3),
  ('Gel 45 g · cafeína 75 mg',  'gel',    45,  75,   0, 4),
  ('Gel 45 g · cafeína 130 mg', 'gel',    45, 130,   0, 5),
  ('Bidón 500',                 'bidon',   0,   0, 500, 6),
  ('Bidón 750',                 'bidon',   0,   0, 750, 7),
  ('Bidón 800',                 'bidon',   0,   0, 800, 8)
) AS v(nombre, tipo, carbohidratos_g, cafeina_mg, volumen_ml, orden)
WHERE p.id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b'
  AND NOT EXISTS (SELECT 1 FROM public.atleta_productos_nutricion x WHERE x.athlete_id = p.id);

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ────────────────────────────────
-- select policyname, cmd from pg_policies where tablename = 'atleta_productos_nutricion';
--   → 4 filas: ver / crear / editar / borrar productos nutricion
-- select conname from pg_constraint where conrelid = 'public.sesion_nutricion'::regclass and contype = 'c';
--   → debe aparecer sesion_nutricion_no_vacia y UNA sola restricción de fila vacía
-- select nombre, tipo, carbohidratos_g, cafeina_mg, volumen_ml from public.atleta_productos_nutricion order by orden;
