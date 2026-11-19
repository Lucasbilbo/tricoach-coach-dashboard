-- 021_atleta_potencia.sql — potenciómetro y FTP por atleta (2026-11)
-- Aplicada 2026-11-20. Aditiva y reversible.
--
-- Tabla `atleta_potencia` (una fila por atleta):
--   potenciometro  true = la bici de este atleta se prescribe y se mide por POTENCIA
--                  (objetivos en zonas de potencia / % del FTP y TSS por potencia).
--                  false (por defecto) = bici por pulso, como hasta ahora.
--   ftp_w          FTP de bici en vatios (null = aún sin test). Sin FTP no se
--                  calcula TSS por potencia (cae al de pulso).
--   ftp_fecha      fecha del test/valor.
-- La editan el atleta y su coach vinculado (mismo patrón que 017/018).
-- No toca `profiles` (compartida con TriCoach v2).
--
-- Para deshacer:  DROP TABLE public.atleta_potencia;

BEGIN;

CREATE TABLE IF NOT EXISTS public.atleta_potencia (
  athlete_id     uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  potenciometro  boolean NOT NULL DEFAULT false,
  ftp_w          smallint CHECK (ftp_w IS NULL OR ftp_w BETWEEN 50 AND 700),
  ftp_fecha      date,
  actualizado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.atleta_potencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ver potencia" ON public.atleta_potencia;
CREATE POLICY "ver potencia" ON public.atleta_potencia
  FOR SELECT TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_potencia.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "crear potencia" ON public.atleta_potencia;
CREATE POLICY "crear potencia" ON public.atleta_potencia
  FOR INSERT TO authenticated
  WITH CHECK (
    (athlete_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.coach_athletes ca
        WHERE ca.athlete_id = atleta_potencia.athlete_id
          AND ca.coach_id = (select auth.uid())
      ))
    AND actualizado_por = (select auth.uid())
  );

DROP POLICY IF EXISTS "editar potencia" ON public.atleta_potencia;
CREATE POLICY "editar potencia" ON public.atleta_potencia
  FOR UPDATE TO authenticated
  USING (
    athlete_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.athlete_id = atleta_potencia.athlete_id
        AND ca.coach_id = (select auth.uid())
    )
  )
  WITH CHECK (
    (athlete_id = (select auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.coach_athletes ca
        WHERE ca.athlete_id = atleta_potencia.athlete_id
          AND ca.coach_id = (select auth.uid())
      ))
    AND actualizado_por = (select auth.uid())
  );

COMMIT;
