-- 020_recetas_bidon.sql — recetas de bidón por producto (2026-11)
--
-- `atleta_productos_nutricion.receta` (jsonb): los GRAMOS a pesar de un bidón
-- ({ maltodextrina_g, fructosa_g, sales_g }). Un bidón con receta es una opción
-- con nombre (Bidón rodillo…); sin receta es "a medida" (hidratos y sodio por
-- sesión, como hasta ahora). ADITIVA.
-- Semilla: las recetas de Lucas (natación 500 ml, rodillo / bici / bici larga
-- 800 ml). Hidratos = 0,95·malto + fructosa; sodio = 2,5 g Evolytes ≈ 356 mg.
--
-- Rollback:
--   DELETE FROM public.atleta_productos_nutricion WHERE receta IS NOT NULL;
--   ALTER TABLE public.atleta_productos_nutricion DROP COLUMN receta;

BEGIN;

ALTER TABLE public.atleta_productos_nutricion
  ADD COLUMN IF NOT EXISTS receta jsonb
  CHECK (receta IS NULL OR jsonb_typeof(receta) = 'object');

INSERT INTO public.atleta_productos_nutricion (athlete_id, nombre, tipo, carbohidratos_g, cafeina_mg, sodio_mg, volumen_ml, receta, orden)
SELECT 'fcd0f6cb-771e-482e-b541-1ff093ab871b'::uuid, v.nombre, 'bidon', v.hidratos, 0, v.sodio, v.ml, v.receta::jsonb, v.orden
FROM (VALUES
  ('Bidón natación',   19,   0, 500, '{"maltodextrina_g":13.5,"fructosa_g":6.5,"sales_g":0}',  9),
  ('Bidón rodillo',    46, 356, 800, '{"maltodextrina_g":32,"fructosa_g":16,"sales_g":2.5}',  10),
  ('Bidón bici',       58, 356, 800, '{"maltodextrina_g":40,"fructosa_g":20,"sales_g":2.5}',  11),
  ('Bidón bici larga', 73, 356, 800, '{"maltodextrina_g":50,"fructosa_g":25,"sales_g":2.5}',  12)
) AS v(nombre, hidratos, sodio, ml, receta, orden)
WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b')
  AND NOT EXISTS (
    SELECT 1 FROM public.atleta_productos_nutricion x
    WHERE x.athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND x.nombre = v.nombre
  );

COMMIT;
