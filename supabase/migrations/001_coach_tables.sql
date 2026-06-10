-- 001_coach_tables.sql
-- Tablas del Coach Dashboard: coaches, coach_athletes, coach_sessions
-- Requiere la tabla `profiles` existente (atletas de TriCoach).

-- =========================
-- Tabla: coaches
-- =========================
create table if not exists public.coaches (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text,
  created_at timestamptz not null default now()
);

-- =========================
-- Tabla: coach_athletes (relación coach <-> atleta)
-- =========================
create table if not exists public.coach_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id)
);

-- =========================
-- Tabla: coach_sessions (sesiones planificadas por el coach)
-- =========================
create table if not exists public.coach_sessions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  fecha date not null,
  disciplina text not null,
  descripcion text,
  duracion_min int,
  intensidad text,
  notas text,
  created_at timestamptz not null default now()
);

create index if not exists idx_coach_athletes_coach on public.coach_athletes (coach_id);
create index if not exists idx_coach_sessions_coach on public.coach_sessions (coach_id);
create index if not exists idx_coach_sessions_athlete_fecha on public.coach_sessions (athlete_id, fecha);

-- =========================
-- RLS
-- =========================
alter table public.coaches enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.coach_sessions enable row level security;

-- coaches: cada coach solo ve y edita su propia fila
create policy "coaches_select_own"
  on public.coaches for select
  using (id = auth.uid());

create policy "coaches_update_own"
  on public.coaches for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- coach_athletes: el coach solo ve y gestiona sus propios atletas
create policy "coach_athletes_select_own"
  on public.coach_athletes for select
  using (coach_id = auth.uid());

create policy "coach_athletes_insert_own"
  on public.coach_athletes for insert
  with check (coach_id = auth.uid());

create policy "coach_athletes_delete_own"
  on public.coach_athletes for delete
  using (coach_id = auth.uid());

-- coach_sessions: el coach solo ve y gestiona sus propias sesiones
create policy "coach_sessions_select_own"
  on public.coach_sessions for select
  using (coach_id = auth.uid());

create policy "coach_sessions_insert_own"
  on public.coach_sessions for insert
  with check (coach_id = auth.uid());

create policy "coach_sessions_update_own"
  on public.coach_sessions for update
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

create policy "coach_sessions_delete_own"
  on public.coach_sessions for delete
  using (coach_id = auth.uid());
