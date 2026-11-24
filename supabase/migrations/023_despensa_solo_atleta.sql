-- 023_despensa_solo_atleta.sql — la despensa solo la edita el atleta (2026-11-24)
--
-- Antes (018) atleta y coach vinculado podían crear / editar / borrar productos de
-- `atleta_productos_nutricion`. Decisión de Lucas: el coach (Jon) solo ELIGE de la
-- despensa al prescribir; no la toca. La lectura no cambia (atleta y coach la ven).
-- El plan de cada sesión (`sesion_nutricion`) sigue editándose por los dos.
--
-- Rollback: volver a crear las tres políticas con el `OR EXISTS (… coach_athletes …)`
-- de 018_productos_nutricion.sql.

BEGIN;

DROP POLICY IF EXISTS "crear productos nutricion" ON public.atleta_productos_nutricion;
CREATE POLICY "crear productos nutricion" ON public.atleta_productos_nutricion
  FOR INSERT TO authenticated
  WITH CHECK (athlete_id = (select auth.uid()));

DROP POLICY IF EXISTS "editar productos nutricion" ON public.atleta_productos_nutricion;
CREATE POLICY "editar productos nutricion" ON public.atleta_productos_nutricion
  FOR UPDATE TO authenticated
  USING (athlete_id = (select auth.uid()))
  WITH CHECK (athlete_id = (select auth.uid()));

DROP POLICY IF EXISTS "borrar productos nutricion" ON public.atleta_productos_nutricion;
CREATE POLICY "borrar productos nutricion" ON public.atleta_productos_nutricion
  FOR DELETE TO authenticated
  USING (athlete_id = (select auth.uid()));

COMMIT;
