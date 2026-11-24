-- 027_quitar_bidon_750.sql (2026-11-24)
-- Menos opciones: se quita el bidón a medida de 750 ml de la despensa de Lucas
-- (quedan Bidón 500 y Bidón 800). Comprobado antes: ninguna sesión lo usaba.
--
-- Rollback:
--   INSERT INTO public.atleta_productos_nutricion (athlete_id, nombre, tipo, carbohidratos_g, cafeina_mg, sodio_mg, volumen_ml, orden)
--   VALUES ('fcd0f6cb-771e-482e-b541-1ff093ab871b', 'Bidón 750', 'bidon', 0, 0, 0, 750, 10);

BEGIN;

DELETE FROM public.atleta_productos_nutricion
  WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND tipo = 'bidon' AND receta IS NULL AND nombre = 'Bidón 750';

COMMIT;
