-- 024_bidones_isotonicos.sql — bidones de natación y rodillo pasan a "Isotónico" (2026-11-24)
--
-- Solo cambia el NOMBRE (receta, tamaño y orden se quedan): el de natación (500 ml)
-- es el isotónico pequeño y el de rodillo (800 ml) el isotónico grande. "Bidón bici
-- larga" y el resto no se tocan. Los planes ya hechos guardan su propia copia del
-- nombre, así que no cambian.
--
-- Rollback:
--   UPDATE public.atleta_productos_nutricion SET nombre = 'Bidón natación'
--     WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND nombre = 'Isotónico pequeño';
--   UPDATE public.atleta_productos_nutricion SET nombre = 'Bidón rodillo'
--     WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND nombre = 'Isotónico grande';

BEGIN;

UPDATE public.atleta_productos_nutricion SET nombre = 'Isotónico pequeño'
  WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND tipo = 'bidon' AND nombre = 'Bidón natación';
UPDATE public.atleta_productos_nutricion SET nombre = 'Isotónico grande'
  WHERE athlete_id = 'fcd0f6cb-771e-482e-b541-1ff093ab871b' AND tipo = 'bidon' AND nombre = 'Bidón rodillo';

COMMIT;
