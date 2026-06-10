-- 002_rls_forja_tables.sql
-- Activa RLS en las 4 tablas que estaban expuestas a la anon key:
-- forja_profile, forja_cuentas, forja_reuniones (user_id -> auth.users.id)
-- y training_cycles (user_id -> profiles.id, que coincide con auth.uid()).
--
-- Estructura verificada contra la base de datos real el 2026-06-10:
-- las 4 tablas usan la columna `user_id` (uuid) y no hay filas con user_id NULL,
-- así que las policies de propietario no dejan datos inaccesibles.
--
-- Las Netlify Functions usan la service key (bypassa RLS): no les afecta.
-- RLS y policies van juntas en la misma migración: activar RLS sin policies
-- bloquearía todo acceso desde el frontend.

-- =========================
-- forja_profile
-- =========================
alter table public.forja_profile enable row level security;

create policy "forja_profile_select_own"
  on public.forja_profile for select
  to authenticated
  using (user_id = auth.uid());

create policy "forja_profile_insert_own"
  on public.forja_profile for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "forja_profile_update_own"
  on public.forja_profile for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "forja_profile_delete_own"
  on public.forja_profile for delete
  to authenticated
  using (user_id = auth.uid());

-- =========================
-- forja_cuentas
-- =========================
alter table public.forja_cuentas enable row level security;

create policy "forja_cuentas_select_own"
  on public.forja_cuentas for select
  to authenticated
  using (user_id = auth.uid());

create policy "forja_cuentas_insert_own"
  on public.forja_cuentas for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "forja_cuentas_update_own"
  on public.forja_cuentas for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "forja_cuentas_delete_own"
  on public.forja_cuentas for delete
  to authenticated
  using (user_id = auth.uid());

-- =========================
-- forja_reuniones
-- =========================
alter table public.forja_reuniones enable row level security;

create policy "forja_reuniones_select_own"
  on public.forja_reuniones for select
  to authenticated
  using (user_id = auth.uid());

create policy "forja_reuniones_insert_own"
  on public.forja_reuniones for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "forja_reuniones_update_own"
  on public.forja_reuniones for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "forja_reuniones_delete_own"
  on public.forja_reuniones for delete
  to authenticated
  using (user_id = auth.uid());

-- =========================
-- training_cycles
-- =========================
alter table public.training_cycles enable row level security;

create policy "training_cycles_select_own"
  on public.training_cycles for select
  to authenticated
  using (user_id = auth.uid());

create policy "training_cycles_insert_own"
  on public.training_cycles for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "training_cycles_update_own"
  on public.training_cycles for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "training_cycles_delete_own"
  on public.training_cycles for delete
  to authenticated
  using (user_id = auth.uid());
