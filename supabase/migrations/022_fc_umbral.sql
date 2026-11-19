-- 022_fc_umbral.sql — FC de umbral por atleta + permisos de atleta_potencia (2026-11-20)
-- APLICADA en producción el 2026-11-20 (Supabase MCP, nombre `022_fc_umbral`); verificado: anon sin permisos.
--
-- 1) `atleta_potencia.fc_umbral` (lpm, opcional): FC de umbral láctico del atleta.
--    El TSS por pulso pasa a ser horas × (FC media / FC umbral)² × 100, la misma
--    escala que el TSS por potencia (NP / FTP). Sin valor → 90 % de la FC máxima.
--    Va en esta tabla (ajustes de carga por atleta) y no en `profiles`, que es
--    compartida con TriCoach v2.
-- 2) `atleta_potencia` no debe tener permisos para `anon` (018 los quitó en su
--    tabla; 021 no). La RLS ya lo bloqueaba (las policies son TO authenticated):
--    esto es higiene, no cierra ninguna fuga.
--
-- ADITIVA. Para deshacer:
--   ALTER TABLE public.atleta_potencia DROP COLUMN fc_umbral;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.atleta_potencia TO anon;

BEGIN;

ALTER TABLE public.atleta_potencia
  ADD COLUMN IF NOT EXISTS fc_umbral smallint
  CHECK (fc_umbral IS NULL OR fc_umbral BETWEEN 100 AND 220);

REVOKE ALL ON public.atleta_potencia FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.atleta_potencia TO authenticated;

COMMIT;

-- Verificación (solo lectura):
-- select column_name from information_schema.columns where table_name = 'atleta_potencia';
-- select grantee, privilege_type from information_schema.role_table_grants where table_name = 'atleta_potencia';
