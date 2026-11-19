-- 020_recetas_bidon.sql — recetas de bidón por producto (2026-11)
--
-- `atleta_productos_nutricion.receta` (jsonb): los GRAMOS a pesar de un bidón
-- ({ maltodextrina_g, fructosa_g, sales_g }). Un bidón con receta es una opción
-- con nombre (Bidón rodillo…); sin receta es "a medida" (hidratos y sodio por
-- sesión, como hasta ahora). ADITIVA.
-- Semilla: las recetas de Lucas (natación 500 ml, rodillo / bici / bici larga
-- 800 ml) y tres bidones HIPERTÓNICOS de 800 ml por cantidad de hidratos
-- (80 / 90 / 100 g, malto:fructosa 2:1, 2,5 g Evolytes). Hidratos = 0,95·malto +
-- fructosa; sodio = 2,5 g Evolytes ≈ 356 mg. Orden de la despensa de Lucas:
-- guayaba, bidones, geles (su prioridad).
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
  ('Bidón bici larga', 73, 356, 800, '{"maltodextrina_g":50,"fructosa_g":25,"sales_g":2.5}',  12),
  ('Bidón hipertónico · 80 g',  80, 356, 800, '{"maltodextrina_g":55.2,"fructosa_g":27.6,"sales_g":2.5}', 13),
  ('Bidón hipertónico · 90 g',  90, 356, 800, '{"maltodextrina_g":62.1,"fructosa_g":31,"sales_g":2.5}',   14),
  ('Bidón hipertónico · 100 g', 100, 356, 800, '{"maltodextrina_g":69,"fructosa_g":34.5,"sales_g":2.5}',  15)
) AS v(nombre, hidratos, sodio, ml, receta, orden)
WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b')
  AND NOT EXISTS (
    SELECT 1 FROM public.atleta_productos_nutricion x
    WHERE x.athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND x.nombre = v.nombre
  );

-- Orden: guayaba, bidones (recetas primero, luego a medida) y al final los geles
UPDATE public.atleta_productos_nutricion SET orden = CASE nombre
    WHEN 'Guayaba' THEN 1
    WHEN 'Bidón natación' THEN 2 WHEN 'Bidón rodillo' THEN 3 WHEN 'Bidón bici' THEN 4 WHEN 'Bidón bici larga' THEN 5
    WHEN 'Bidón hipertónico · 80 g' THEN 6 WHEN 'Bidón hipertónico · 90 g' THEN 7 WHEN 'Bidón hipertónico · 100 g' THEN 8
    WHEN 'Bidón 500' THEN 9 WHEN 'Bidón 750' THEN 10 WHEN 'Bidón 800' THEN 11
    WHEN 'Gel 30 g' THEN 12 WHEN 'Gel 45 g' THEN 13 WHEN 'Gel 45 g · cafeína 75 mg' THEN 14 WHEN 'Gel 45 g · cafeína 130 mg' THEN 15
    ELSE orden END
WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b';

COMMIT;
