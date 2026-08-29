-- =========================================================
-- Peso em Progresso — schema do banco (Supabase / Postgres)
-- =========================================================
-- Como usar: Supabase Dashboard > SQL Editor > cole este arquivo > Run.
-- Pressupõe o Supabase Auth já habilitado (auth.users é criado automaticamente).

-- ---------------------------------------------------------
-- 1. Perfis (1 linha por usuário, criada automaticamente no signup)
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Usuário',
  height_cm numeric(5,1),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------
-- 2. Registros de peso
-- ---------------------------------------------------------
create table if not exists public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric(5,2) not null check (weight_kg > 0 and weight_kg < 500),
  note text,
  source text not null default 'manual', -- 'manual' | 'import'
  created_at timestamptz not null default now(),
  unique (user_id, measured_at)
);

create index if not exists weight_entries_user_date_idx
  on public.weight_entries (user_id, measured_at desc);

alter table public.weight_entries enable row level security;

create policy "weight_entries_select_own"
  on public.weight_entries for select
  using (auth.uid() = user_id);

create policy "weight_entries_insert_own"
  on public.weight_entries for insert
  with check (auth.uid() = user_id);

create policy "weight_entries_update_own"
  on public.weight_entries for update
  using (auth.uid() = user_id);

create policy "weight_entries_delete_own"
  on public.weight_entries for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- 3. Metas (uma linha por usuário; editável a qualquer momento)
-- ---------------------------------------------------------
create table if not exists public.goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly_loss_kg numeric(5,2) not null default 0.25,
  monthly_loss_kg numeric(5,2) not null default 1.0,
  quarterly_loss_kg numeric(5,2) not null default 3.0,
  semester_loss_kg numeric(5,2) not null default 6.0,
  target_weight_kg numeric(5,2),
  updated_at timestamptz not null default now()
);

alter table public.goals enable row level security;

create policy "goals_select_own"
  on public.goals for select
  using (auth.uid() = user_id);

create policy "goals_upsert_own"
  on public.goals for insert
  with check (auth.uid() = user_id);

create policy "goals_update_own"
  on public.goals for update
  using (auth.uid() = user_id);

-- Cria metas padrão (250g/semana, 1kg/mês) junto com o perfil
create or replace function public.handle_new_user_goals()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.goals (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_goals on auth.users;
create trigger on_auth_user_created_goals
  after insert on auth.users
  for each row execute procedure public.handle_new_user_goals();

-- ---------------------------------------------------------
-- 4. Medidas corporais (opcional, complementar a weight_entries)
-- Ver supabase/migrations/0003_body_measurements.sql
-- ---------------------------------------------------------

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at date not null default current_date,
  waist_cm numeric(5,1) check (waist_cm is null or (waist_cm > 0 and waist_cm < 300)),
  hip_cm numeric(5,1) check (hip_cm is null or (hip_cm > 0 and hip_cm < 300)),
  arm_cm numeric(5,1) check (arm_cm is null or (arm_cm > 0 and arm_cm < 100)),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct < 100)),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, measured_at),
  constraint body_measurements_at_least_one_field check (
    waist_cm is not null or hip_cm is not null or arm_cm is not null or body_fat_pct is not null
  )
);

create index if not exists body_measurements_user_date_idx
  on public.body_measurements (user_id, measured_at desc);

alter table public.body_measurements enable row level security;

create policy "body_measurements_select_own"
  on public.body_measurements for select
  using (auth.uid() = user_id);

create policy "body_measurements_insert_own"
  on public.body_measurements for insert
  with check (auth.uid() = user_id);

create policy "body_measurements_update_own"
  on public.body_measurements for update
  using (auth.uid() = user_id);

create policy "body_measurements_delete_own"
  on public.body_measurements for delete
  using (auth.uid() = user_id);

comment on table public.body_measurements is
  'Medidas corporais opcionais (cintura, quadril, braço, % gordura) — 1 registro por dia por usuário, mesmo padrão de weight_entries.';

-- ---------------------------------------------------------
-- Notas de arquitetura:
-- * RLS garante que cada usuário (amigo/familiar) só vê os próprios dados,
--   mesmo estando todos no mesmo projeto Supabase.
-- * "unique (user_id, measured_at)" permite no máximo 1 pesagem por dia
--   por usuário; o app faz upsert nesse par.
-- * source='import' fica reservado para uma futura importação de CSV
--   exportado do app Fitdays (ver README — Fitdays não expõe API pública).
-- ---------------------------------------------------------
