-- 025_bidones_solo_agua.sql — bidones sin receta pasan a «Agua N ml» (2026-11-24)
--
-- Los tres bidones "a medida" de la semilla (Bidón 500 / 750 / 800, sin receta) se
-- quedaron sin detallar: se renombran a «Agua 500 ml», «Agua 750 ml», «Agua 800 ml».
-- Solo cambia el nombre. Los planes ya hechos guardan su copia del nombre.
--
-- Rollback:
--   UPDATE public.atleta_productos_nutricion SET nombre = 'Bidón ' || volumen_ml
--     WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND tipo = 'bidon' AND receta IS NULL
--       AND nombre IN ('Agua 500 ml', 'Agua 750 ml', 'Agua 800 ml');

BEGIN;

UPDATE public.atleta_productos_nutricion SET nombre = 'Agua ' || volumen_ml || ' ml'
  WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND tipo = 'bidon' AND receta IS NULL
    AND nombre IN ('Bidón 500', 'Bidón 750', 'Bidón 800');

COMMIT;
