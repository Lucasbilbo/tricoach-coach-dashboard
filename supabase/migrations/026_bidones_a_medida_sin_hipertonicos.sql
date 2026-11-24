-- 026_bidones_a_medida_sin_hipertonicos.sql (2026-11-24)
--
-- Deshace 025: los bidones sin receta vuelven a ser «Bidón 500 / 750 / 800» porque
-- son los "a medida": Jon pone en cada sesión los hidratos (y sodio) POR BIDÓN.
-- Y se quitan los tres hipertónicos de la semilla (80 / 90 / 100 g): para más
-- hidratos usa un bidón a medida y escribe los g. Menos opciones en la despensa.
-- Comprobado antes: ninguna sesión usaba los hipertónicos.
--
-- Rollback: renombrar a «Agua N ml» (ver 025) y reinsertar los hipertónicos con las
-- recetas de 020_recetas_bidon.sql.

BEGIN;

UPDATE public.atleta_productos_nutricion SET nombre = 'Bidón ' || volumen_ml
  WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND tipo = 'bidon' AND receta IS NULL
    AND nombre IN ('Agua 500 ml', 'Agua 750 ml', 'Agua 800 ml');

DELETE FROM public.atleta_productos_nutricion
  WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND tipo = 'bidon'
    AND nombre IN ('Bidón hipertónico · 80 g', 'Bidón hipertónico · 90 g', 'Bidón hipertónico · 100 g');

COMMIT;
