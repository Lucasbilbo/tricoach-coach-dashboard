-- 014_adjuntos_entreno.sql — capturas de entrenos (Hyrox / fuerza) (2026-10-22)
--
-- El coach puede adjuntar a una sesión el entreno tal cual lo tiene: texto
-- pegado (va en coach_sessions.workout_steps.adjunto.texto, sin migración) o
-- capturas de pantalla, que se guardan en Storage en un bucket PRIVADO:
--   entrenos-adjuntos/<athlete_id>/<uuid>.jpg
-- Las rutas van en workout_steps.adjunto.imagenes. Se leen con URL firmada.
--
-- Permisos (storage.objects, RLS):
--   - Subir / borrar: solo un coach vinculado a ese atleta (coach_athletes).
--   - Leer: el propio atleta (primera carpeta = su uid) o su coach.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('entrenos-adjuntos', 'entrenos-adjuntos', false, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Adjuntos entreno: coach sube" ON storage.objects;
CREATE POLICY "Adjuntos entreno: coach sube" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'entrenos-adjuntos'
    AND EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = (select auth.uid())
        AND ca.athlete_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Adjuntos entreno: atleta o coach leen" ON storage.objects;
CREATE POLICY "Adjuntos entreno: atleta o coach leen" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'entrenos-adjuntos'
    AND (
      (storage.foldername(name))[1] = (select auth.uid())::text
      OR EXISTS (
        SELECT 1 FROM public.coach_athletes ca
        WHERE ca.coach_id = (select auth.uid())
          AND ca.athlete_id::text = (storage.foldername(name))[1]
      )
    )
  );

DROP POLICY IF EXISTS "Adjuntos entreno: coach borra" ON storage.objects;
CREATE POLICY "Adjuntos entreno: coach borra" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'entrenos-adjuntos'
    AND EXISTS (
      SELECT 1 FROM public.coach_athletes ca
      WHERE ca.coach_id = (select auth.uid())
        AND ca.athlete_id::text = (storage.foldername(name))[1]
    )
  );

COMMIT;

-- ── Verificación (solo lectura) ─────────────────────────────────────────────
-- select id, public from storage.buckets where id = 'entrenos-adjuntos';
-- select policyname, cmd from pg_policies where schemaname='storage' and tablename='objects'
--   and policyname like 'Adjuntos entreno%';
